/**
 * Extension background script. Watches for a displayed or selected message,
 * detects an available unsubscribe method via unsubExtraction.js and
 * unsubMethods.js, and enables the message-display action / popup
 * accordingly. Also handles the popup's runtime messages for executing
 * unsubscribe, canceling, and deleting messages from a sender or domain.
 */

/* global createLogger, resolveCurrentMessage
   provided by common.js

   global extractHttpsLink, extractMailtoLink, retrieveIdentity,
   findEmbeddedUnsubLinkHTML, findEmbeddedUnsubLinkRegex
   provided by unsubExtraction.js

   global UnsubMethod, UnsubPost, UnsubMail, UnsubWeb
   provided by unsubMethods.js

   common.js, unsubExtraction.js, and unsubMethods.js
   loaded earlier in manifest.json's background scripts */

// In a Node.js environment, pull in this file's dependencies so they resolve
// the same way they do in the browser, where all background scripts listed
// in manifest.json's "background.scripts" share one global scope.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  Object.assign(globalThis, require('./common.js'));
  Object.assign(globalThis, require('./unsubExtraction.js'));
  Object.assign(globalThis, require('./unsubMethods.js'));
}

const { log: console_log, error: console_error } =
  createLogger('background.js');

/**
 * Map to store functions for different unsubscribe actions associated with message IDs
 * @type {Map<messenger.messages.MessageId,UnsubMethod|null>} */
const funcCache = new Map();

/**
 * Id of the message-list context menu item that opens the unsubscribe popup.
 * @type {string}
 */
const UNSUBSCRIBE_MENU_ITEM_ID = 'betterunsubscribe-unsubscribe';

/**
 * Registers a right-click context menu item, both on messages in the
 * message list and inside the message content itself (the reading pane),
 * offering another entry point into the unsubscribe popup.
 */
messenger.menus.create({
  id: UNSUBSCRIBE_MENU_ITEM_ID,
  title: messenger.i18n.getMessage('unsubscribeTitle'),
  contexts: ['message_list', 'page', 'frame'],
});

/**
 * Context menu click listener.
 *
 * Opens the unsubscribe popup in its own standalone window. The resolved
 * message id is passed via a URL param so `popup.js` doesn't need a mail
 * tab to look up "the current message" (a fresh window has none).
 *
 * @param {messenger.menus.OnClickData} info - Details about the click event.
 * @param {messenger.tabs.Tab} tab - The tab the click happened in.
 * @returns {Promise<void>}
 */
messenger.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== UNSUBSCRIBE_MENU_ITEM_ID) {
    return;
  }

  const message = await resolveCurrentMessage(tab, info);
  const popupUrl = message
    ? `popup.html?messageId=${message.id}`
    : 'popup.html';

  try {
    await messenger.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 490,
      height: 375,
    });
  } catch (error) {
    console_error('Error opening popup window from context menu', error);
  }
});

/**
 * Tab activation listener.
 *
 * Triggered when the user switches tabs or a tab becomes active.
 * In Thunderbird, message content is often shown in a `messageDisplay` tab.
 *
 * Behavior:
 * - Fetches the activated tab details.
 * - If the tab is a `messageDisplay` tab, retrieves the currently displayed message.
 * - Delegates to {@link updateAction} to:
 *   - disable the action while processing,
 *   - look up/calculate the unsubscribe method (cached by message id),
 *   - enable the action if an unsubscribe method was found.
 *
 * Notes:
 * - The tab activation event can fire even when no message is displayed; `updateAction`
 *   safely handles a null/undefined message.
 * - This exists alongside `onMessageDisplayed` because tab focus changes don't always
 *   imply a new message display event, and vice versa.
 *
 * @param {object} activeInfo - Activation details from `messenger.tabs.onActivated`.
 * @param {integer} activeInfo.tabId - The ID of the tab that has become active
 * @param {integer} activeInfo.windowId - The ID of the window the active tab changed inside of.
 * @param {integer} activeInfo.previousTabId - The ID of the tab that was previously active, if that tab is still open.
 * @returns {Promise<void>}
 */
messenger.tabs.onActivated.addListener(async (activeInfo) => {
  console_log('onActivated');
  const tab = await messenger.tabs.get(activeInfo.tabId);
  if (tab.type === 'messageDisplay') {
    const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
    await updateAction(tab, message);
  }
});

/**
 * Message display listener.
 *
 * Triggered when a message is displayed in a message display tab (e.g. selecting a
 * different message in the message list).
 *
 * Behavior:
 * - Runs whenever Thunderbird reports a newly displayed message for a tab.
 * - Delegates to {@link updateAction} to update the messageDisplayAction state
 *   (disable during processing, enable if unsubscribe info exists).
 *
 * @param {messenger.tabs.Tab} tab - The tab where the message is displayed.
 * @param {messenger.messages.MessageHeader} message - The message now displayed in the tab.
 * @returns {Promise<void>}
 */
messenger.messageDisplay.onMessageDisplayed.addListener(
  async (tab, message) => {
    console_log('onMessageDisplayed');
    await updateAction(tab, message);
  }
);

/**
 * Evaluates the currently displayed message and updates the messageDisplayAction state.
 *
 * This is the central "gatekeeper" for enabling/disabling the extension's action button.
 *
 * Flow:
 * 1) Immediately disables the action button for the current tab to prevent the user
 *    from clicking while unsubscribe detection is still running.
 *
 * 2) Re-enables the action button only when an unsubscribe method was found (i.e. result
 *    is not null).
 *
 * Error handling:
 * - Any errors are caught and logged; the action remains disabled in that case.
 *
 * @param {messenger.tabs.Tab} tab - The tab in which the message is displayed.
 * @param {messenger.messages.MessageHeader} message - The displayed message.
 * @returns {Promise<void>}
 */
async function updateAction(tab, message) {
  try {
    await messenger.messageDisplayAction.disable(tab.id); // Disable action button until processing is complete
    if (message) {
      const unsubMethod = await getUnsubscribeMethod(message.id);
      if (unsubMethod !== null) {
        await messenger.messageDisplayAction.enable(tab.id); // Enable action button if unsubscribe info is found
      }
    }
  } catch (error) {
    console_error(error);
  }
}

/**
 * Returns the cached unsubscribe method for a message.
 *
 * On a cache miss, runs {@link searchUnsub} to detect an unsubscribe mechanism and
 * stores the result (including `null`) so subsequent calls do not repeat the scan.
 *
 * @param {messenger.messages.MessageId} messageId - The message id to inspect.
 * @returns {Promise<UnsubMethod|null>} The unsubscribe method, or `null` if none exists.
 */
async function getUnsubscribeMethod(messageId) {
  if (!funcCache.has(messageId)) {
    // Message not in cache, call searchUnsub and store the result in cache
    funcCache.set(messageId, await searchUnsub(messageId));
  }
  return funcCache.get(messageId);
}

/**
 * Searches for unsubscribe links and information in the message headers and body.
 * This function scans for standard unsubscribe headers (RFC 2369) and embedded links.
 * @param {messenger.messages.MessageId} selectedMessageId - The selected message id to search for unsubscribe information.
 * @returns {Promise<UnsubMethod|null>} - Unsubscribe Method if found, otherwise null.
 */
async function searchUnsub(selectedMessageId) {
  const fullMessage = await messenger.messages.getFull(selectedMessageId);
  const { headers } = fullMessage;

  // Check for standard unsubscribe headers (RFC 2369)
  if ('list-unsubscribe' in headers) {
    const unsubscribeHeaders = headers['list-unsubscribe'];
    let unsubscribeHeader = Array.isArray(unsubscribeHeaders)
      ? unsubscribeHeaders[0]
      : unsubscribeHeaders;

    const httpsLink = extractHttpsLink(unsubscribeHeader);
    const email = extractMailtoLink(unsubscribeHeader);
    const postCommand =
      'list-unsubscribe-post' in headers
        ? headers['list-unsubscribe-post'][0]
        : null;

    if (httpsLink && postCommand) {
      console_log('OneClick Link Found', httpsLink);
      console_log('post', postCommand);
      return new UnsubPost(httpsLink);
    }

    if (email) {
      console_log('Unsubscribe Email Found', email);
      const messageHeader = await messenger.messages.get(selectedMessageId);
      const identity = await retrieveIdentity(messageHeader);
      return new UnsubMail(identity, email);
    }

    if (httpsLink) {
      console_log('Unsubscribe WebLink Found', httpsLink);
      return new UnsubWeb(httpsLink);
    }
  }

  const htmlMatch = findEmbeddedUnsubLinkHTML(fullMessage);
  if (htmlMatch) {
    console_log(
      `Embedded Unsubscribe WebLink Found using HTML parsing`,
      htmlMatch
    );
    return new UnsubWeb(htmlMatch);
  }

  const regexMatch = findEmbeddedUnsubLinkRegex(fullMessage);
  if (regexMatch) {
    console_log(`Embedded Unsubscribe WebLink Found using Regex`, regexMatch);
    return new UnsubWeb(regexMatch);
  }

  return null; // No unsubscribe information found
}

/**
 * Generator function to yield messages from a paginated list.
 * @param {Promise<messenger.messages.MessageList>} list
 * @returns {AsyncGenerator<messenger.messages.MessageHeader>} - An async generator that yields messages.
 */
async function* getMessages(list) {
  let page = await list;
  for (let message of page.messages) {
    yield message;
  }

  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    for (let message of page.messages) {
      yield message;
    }
  }
}

/**
 * Generator function to yield messages from all inbox folders across all accounts.
 * This function finds and processes messages from each inbox folder.
 * @returns {AsyncGenerator<messenger.messages.MessageHeader>} - An async generator that yields messages from all inboxes.
 */
async function* getAllMessages() {
  // Step 1: Get all accounts
  let accounts = await messenger.accounts.list();

  // Step 2: Loop through all accounts to find inbox folders
  for (let account of accounts) {
    let folders = await messenger.folders.getSubFolders(account);

    // Filter out folders that are inboxes
    let inboxes = folders.filter((folder) => folder.type === 'inbox');

    // Step 3: Fetch messages from each inbox
    for (let inbox of inboxes) {
      yield* getMessages(messenger.messages.list(inbox));
    }
  }
}

/**
 * Handles runtime messages for the extension.
 * Processes different actions such as fetching unsubscribe methods, executing unsubscribe operations,
 * or deleting specific messages based on input data.
 * @param {object} messageFromPopup - The message received from the popup.
 * @returns {Promise<object|boolean>} Response object for known actions, otherwise false.
 */
messenger.runtime.onMessage.addListener(async (messageFromPopup) => {
  if (!messageFromPopup.messageId) {
    console_log('No Message Id', messageFromPopup);
    return false;
  }

  const messageId = parseInt(messageFromPopup.messageId);

  if (messageFromPopup.getMethod === true) {
    return await handleGetMethod(messageId);
  } else if (messageFromPopup.unsubscribe === true) {
    return await handleUnsubscribe(messageId);
  } else if (messageFromPopup.cancel === true) {
    return await handleCancel();
  } else if (messageFromPopup.delete === true) {
    return await handleDelete(messageFromPopup);
  }
  console_log('Unknown action', messageFromPopup);
  return false;
});

/**
 * Handles the retrieval of unsubscribe method details.
 * @param {number} messageId - The ID of the message.
 * @returns {object} - Unsubscribe method details.
 */
async function handleGetMethod(messageId) {
  console_log('Method Requested');
  const unsubMethod = await getUnsubscribeMethod(messageId);

  console_log('Method', unsubMethod);
  return unsubMethod === null
    ? { method: 'None' }
    : unsubMethod.getMethodDetails();
}

/**
 * Executes the unsubscribe operation.
 * @param {number} messageId - The ID of the message.
 * @returns {Promise<object>} - Response indicating the result of the unsubscribe operation.
 */
async function handleUnsubscribe(messageId) {
  console_log('User chose to unsubscribe from the mailing list');
  const unsubMethod = await getUnsubscribeMethod(messageId);

  if (unsubMethod === null) {
    return {
      response: 'Failed',
      error: 'No unsubscribe method found for this message.',
    };
  }

  try {
    await unsubMethod.call();
    return { response: 'Unsubscribed' };
  } catch (err) {
    console_error(err);
    return { response: 'Failed', error: err.message };
  }
}

/**
 * Handles the cancellation of the unsubscribe action.
 * @returns {object} - Response indicating that the action was canceled.
 */
async function handleCancel() {
  console_log('User canceled the unsubscribe action.');
  return { response: 'Canceled' };
}

/**
 * Handles the deletion of messages based on provided criteria.
 * @param {object} messageFromPopup - The message data containing deletion criteria.
 * @returns {Promise<object>} - Response indicating the result of the deletion operation.
 */
async function handleDelete(messageFromPopup) {
  console_log('User chose to delete emails from the mailing list');
  try {
    const messageIds = await collectMessageIdsToDelete(messageFromPopup);

    if (messageIds.length) {
      console_log('Deleting Selected Messages');
      try {
        await messenger.messages.delete(messageIds, {
          deletePermanently: false, // [Added in TB 137]
        });
      } catch (err) {
        // Fallback for older versions of Thunderbird
        await messenger.messages.delete(messageIds, false);
      }
      return { response: 'Deleted', count: messageIds.length };
    }

    console_log('No messages found to delete.');
    return { response: 'No Messages Found' };
  } catch (error) {
    console_error('Error processing deletion request:', error);
    return { response: 'Error', error: error.message };
  }
}

/**
 * Collects message IDs to delete based on the provided criteria.
 * @param {object} messageFromPopup - The message data containing deletion criteria.
 * @returns {Promise<Array<number>>} - An array of message IDs to delete.
 */
async function collectMessageIdsToDelete(messageFromPopup) {
  let messageIds = [];
  const { name, sender, domain, messageId } = messageFromPopup;

  if (name && sender && domain) {
    // Handle delete all with name address
    const formattedName = name.trim().toLowerCase();
    const formattedSender = sender.trim().toLowerCase();
    const formattedDomain = domain.trim().toLowerCase();

    console_log(
      'Selecting all messages associated with name:',
      `${formattedName} <${formattedSender}@${formattedDomain}>`
    );

    const messages = getMessages(
      messenger.messages.query({
        author: `${formattedName} <${formattedSender}@${formattedDomain}>`,
      })
    );

    for await (let message of messages) {
      messageIds.push(message.id);
    }
  } else if (sender && domain) {
    // Handle delete all from sender
    const formattedSender = sender.trim().toLowerCase();
    const formattedDomain = domain.trim().toLowerCase();

    console_log(
      'Selecting all messages from sender:',
      `${formattedSender}@${formattedDomain}`
    );

    const messages = getMessages(
      messenger.messages.query({
        author: `${formattedSender}@${formattedDomain}`,
      })
    );

    for await (let message of messages) {
      messageIds.push(message.id);
    }
  } else if (domain) {
    // Handle delete all from domain
    const formattedDomain = domain.trim().toLowerCase();
    const atDomain = '@' + formattedDomain;

    console_log('Selecting all messages from domain:', formattedDomain);

    const messages = getAllMessages();

    for await (let message of messages) {
      if (message.author.toLowerCase().includes(atDomain)) {
        messageIds.push(message.id);
      }
    }
  } else if (messageId) {
    // Handle deleting one specific message
    console_log('Selecting a specific message with ID:', messageId);
    messageIds.push(messageId);
  }

  return messageIds;
}

// Export module functions and classes for testing if in a Node.js environment
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    searchUnsub,
    UnsubMethod,
    UnsubWeb,
    UnsubMail,
    UnsubPost,
    funcCache,
  };
}
