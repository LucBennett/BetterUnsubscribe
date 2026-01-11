// Map to store functions for different unsubscribe actions associated with message IDs
const funcCache = new Map(); // MessageId:UnsubMethod

/**
 * Logs messages to the console with a specific prefix.
 * Useful for tracking debug information related to BetterUnsubscribe in background scripts.
 * @param {...*} arguments - The arguments to be logged.
 */
function console_log() {
  console.log('[BetterUnsubscribe][background.js]', ...arguments);
}

/**
 * Logs errors to the console with a specific prefix.
 * Helps identify error messages specific to BetterUnsubscribe's background script.
 * @param {...*} arguments - The arguments to be logged as errors.
 */
function console_error() {
  console.error('[BetterUnsubscribe][background.js]', ...arguments);
}

/**
 * Tab activation listener.
 *
 * Triggered when the user switches tabs or a tab becomes active.
 * In Thunderbird, message content is often shown in a `messageDisplay` tab.
 *
 * Behavior:
 * - Fetches the activated tab details.
 * - If the tab is a `messageDisplay` tab, retrieves the currently displayed message.
 * - Delegates to {@link check_message} to:
 *   - disable the action while processing,
 *   - look up/calculate the unsubscribe method (cached by message id),
 *   - enable the action if an unsubscribe method was found.
 *
 * Notes:
 * - The tab activation event can fire even when no message is displayed; `check_message`
 *   safely handles a null/undefined message.
 * - This exists alongside `onMessageDisplayed` because tab focus changes don’t always
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
    await check_message(tab, message);
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
 * - Delegates to {@link check_message} to update the messageDisplayAction state
 *   (disable during processing, enable if unsubscribe info exists).
 *
 * @param {messenger.tabs.Tab} tab - The tab where the message is displayed.
 * @param {messenger.messages.MessageHeader} message - The message now displayed in the tab.
 * @returns {Promise<void>}
 */
messenger.messageDisplay.onMessageDisplayed.addListener(
  async (tab, message) => {
    console_log('onMessageDisplayed');
    await check_message(tab, message);
  }
);

/**
 * Evaluates the currently displayed message and updates the messageDisplayAction state.
 *
 * This is the central "gatekeeper" for enabling/disabling the extension’s action button.
 *
 * Flow:
 * 1) Immediately disables the action button for the current tab to prevent the user
 *    from clicking while unsubscribe detection is still running.
 * 2) If a message is present:
 *    - checks `funcCache` for a previously computed {@link UnsubMethod} (or null result)
 *      keyed by `message.id`.
 *    - if not cached, calls {@link searchUnsub} to detect an unsubscribe mechanism and
 *      caches the result (including null to avoid repeated work).
 * 3) Re-enables the action button only when an unsubscribe method was found (i.e. result
 *    is not null).
 *
 * Error handling:
 * - Any errors are caught and logged; the action remains disabled in that case.
 *
 * @param {messenger.tabs.Tab} tab - The tab in which the message is displayed.
 * @param {messenger.messages.MessageHeader|null|undefined} message - The displayed message.
 * @returns {Promise<void>}
 */
async function check_message(tab, message) {
  try {
    await messenger.messageDisplayAction.disable(tab.id); // Disable action button until processing is complete
    if (message) {
      let value;

      if (funcCache.has(message.id)) {
        // Message is in cache
        value = funcCache.get(message.id);
      } else {
        // Message not in cache, call searchUnsub(message)
        value = await searchUnsub(message);
        // Store the result in cache
        funcCache.set(message.id, value);
      }

      if (value !== null) {
        await messenger.messageDisplayAction.enable(tab.id); // Enable action button if unsubscribe info is found
      }
    }
  } catch (error) {
    console_error(error);
  }
}

/**
 * Searches for unsubscribe links and information in the message headers and body.
 * This function scans for standard unsubscribe headers (RFC 2369) and embedded links.
 * @param {messenger.messages.MessageHeader} selectedMessage - The selected message to search for unsubscribe information.
 * @returns {Promise<UnsubMethod|null>} - Unsubscribe Method if found, otherwise null.
 */
async function searchUnsub(selectedMessage) {
  const fullMessage = await messenger.messages.getFull(selectedMessage.id);
  const messageHeader = await messenger.messages.get(selectedMessage.id);
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
      const identity = await retrieveIdentity(messageHeader);
      return new UnsubMail(identity, email);
    }

    if (httpsLink) {
      console_log('Unsubscribe WebLink Found', httpsLink);
      return new UnsubWeb(httpsLink);
    }
  }

  const embeddedLink =
    findEmbeddedUnsubLinkHTML(fullMessage) ||
    findEmbeddedUnsubLinkRegex(fullMessage);
  if (embeddedLink) {
    console_log('Embedded HTML Unsubscribe WebLink Found', embeddedLink);
    return new UnsubWeb(embeddedLink); // Return unsubscribe embedded web link method
  }

  return null; // No unsubscribe information found
}

// Helper function to extract HTTPS link from the header
/**
 * Extracts an HTTPS link from the unsubscribe header.
 * @param {string} header - The unsubscribe header containing the URL.
 * @returns {URL|null} - The extracted HTTPS link if found, otherwise null.
 */
function extractHttpsLink(header) {
  const httpsLinkMatch = header.match(/<(https?:\/\/[^>]+)>/);
  return httpsLinkMatch ? new URL(httpsLinkMatch[1]) : null;
}

// Helper function to extract mailto link from the header
/**
 * Extracts a mailto link from the unsubscribe header.
 * @param {string} header - The unsubscribe header containing the mailto link.
 * @returns {URL|null} - The extracted mailto link if found, otherwise null.
 */
function extractMailtoLink(header) {
  const emailMatch = header.match(/<(mailto:[^>]+)>/i);
  if (emailMatch) {
    return new URL(emailMatch[1].replace(/^mailto:\/*/, 'mailto:'));
  }
  return null;
}

/**
 * Retrieves the MailIdentity associated with the given email's receiver.
 * @param {messenger.messages.MessageHeader} messageHeader - The message header to search for identities.
 * @returns {Promise<MailIdentity|null>} - The found MailIdentity, or null if no identity is found.
 */
async function retrieveIdentity(messageHeader) {
  let identity = await getIdentityReceiver(messageHeader);

  if (identity === null) {
    identity = await getIdentityForMessage(messageHeader);
    if (identity === null) {
      const identities = await messenger.identities.list();
      if (identities.length !== 0) {
        identity = identities[0];
      }
    }
  }

  if (!identity) {
    console_log('No identity found for', messageHeader);
  }

  return identity || null; // Return undefined if no identity is found
}

// Regular expression to match 'unsubscribe' in different forms for embedded links
const unsubscribeRegexString = '\\bun\\W?(?:subscri(?:be|bing|ption))\\b';

// More precise URL pattern with length limits and exclusion of common URL-ending characters
const urlPattern = 'https?:\\/\\/[^\\s"\'<>]{1,1000}';

const unsubscribeRegex = new RegExp(unsubscribeRegexString, 'i');

// Improved regex for detecting embedded unsubscribe links within the message body
const embeddedUnsubRegex = new RegExp(
  '(?:' +
    '(' +
    urlPattern +
    '[^\\s"\'<>]*' +
    unsubscribeRegexString +
    '[^\\s"\'<>]*)' + // URL containing 'unsubscribe'
    ')|(?:' +
    '(' +
    urlPattern +
    ')[\\s\\S]{0,300}' +
    unsubscribeRegexString + // URL followed by 'unsubscribe' within 300 chars
    ')|(?:' +
    unsubscribeRegexString +
    '[\\s\\S]{0,300}(' +
    urlPattern +
    ')' + // 'unsubscribe' followed by URL within 300 chars
    ')',
  'i'
);

/**
 * Finds embedded unsubscribe links within the message body using HTML parsing.
 * @param {messenger.messages.MessagePart} messagePart - The message part to search for embedded links.
 * @returns {URL|null} - The embedded link if found, otherwise null.
 */
function findEmbeddedUnsubLinkHTML(messagePart) {
  if (messagePart && messagePart.contentType === 'text/html') {
    // Parse the HTML content using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(messagePart.body, 'text/html');

    // Search for all <a> elements
    const links = doc.querySelectorAll('a');
    for (const link of links) {
      // Check if the link text contains "unsubscribe"
      if (
        link.textContent.match(unsubscribeRegex) ||
        link.href.match(unsubscribeRegex)
      ) {
        // Return the href attribute of the matching <a> tag
        return new URL(link.href);
      }
    }
  }

  if (messagePart && messagePart.parts) {
    for (const part of messagePart.parts) {
      const embeddedLink = findEmbeddedUnsubLinkHTML(part);
      if (embeddedLink) {
        return embeddedLink;
      }
    }
  }

  return null; // No embedded link found
}

/**
 * Finds embedded unsubscribe links within the message body using a regular expression.
 * @param {messenger.messages.MessagePart} messagePart - The message part to search for embedded links.
 * @returns {URL|null} - The embedded link if found, otherwise null.
 */
function findEmbeddedUnsubLinkRegex(messagePart) {
  if (messagePart && messagePart.body) {
    const match = messagePart.body.match(embeddedUnsubRegex);
    if (match) {
      // Return the first non-null captured group
      const link = match[1] || match[2] || match[3] || null;
      if (link) {
        return new URL(link);
      }
      return null;
    }
  }

  if (messagePart && messagePart.parts) {
    for (const part of messagePart.parts) {
      const embeddedLink = findEmbeddedUnsubLinkRegex(part);
      if (embeddedLink) {
        return embeddedLink;
      }
    }
  }

  return null; // No embedded link found
}

/**
 * Retrieves the MailIdentity associated with the given email headers receiver.
 * This function checks the BCC, CC, and recipient lists to find a matching identity.
 * @param {messenger.messages.MessageHeader} messageHeader - The MessageHeader associated with the message.
 * @returns {Promise<MailIdentity|null>} - The MailIdentity if found, otherwise null.
 */
async function getIdentityReceiver(messageHeader) {
  const allReceivers = new Set([
    ...messageHeader.bccList,
    ...messageHeader.ccList,
    ...messageHeader.recipients,
  ]);

  const identities = await messenger.identities.list();

  for (const identity of identities) {
    if (allReceivers.has(identity.email)) {
      return identity;
    }
  }

  return null; // Return null if no matching identity is found
}

/**
 * Retrieves the MailIdentity associated with the given message's folder.
 * This function iterates over accounts to match identities based on the folder's account ID.
 * @param {messenger.messages.MessageHeader} messageHeader - The MessageHeader associated with the message.
 * @returns {Promise<MailIdentity|null>} - The MailIdentity if found, otherwise null.
 */
async function getIdentityForMessage(messageHeader) {
  // Early return if no folder is present
  if (!messageHeader.folder) {
    return null;
  }

  const folder = messageHeader.folder;
  const accounts = await messenger.accounts.list();

  // Find the account that matches the folder's accountId
  const matchingAccount = accounts.find(
    (account) => account.id === folder.accountId
  );

  // Return the first identity of the matching account, or null if no match
  return matchingAccount?.identities?.[0] ?? null;
}

/**
 * Base class for different unsubscribe methods.
 * This class is extended by specific unsubscribe action implementations.
 */
class UnsubMethod {
  /**
   * Method to be implemented by subclasses to execute the unsubscribe action.
   * @throws {Error} - If the method is not implemented by a subclass.
   */
  async call() {
    throw new Error('Method call() must be implemented.');
  }

  /**
   * Method to get details of the unsubscribe method (e.g., type, address).
   * Must be implemented by subclasses.
   * @throws {Error} - If the method is not implemented by a subclass.
   */
  getMethodDetails() {
    throw new Error('This method must be implemented by subclasses');
  }
}

/**
 * Class for unsubscribing via a POST request.
 * This class handles the logic for making POST requests to specified URLs for unsubscription.
 */
class UnsubPost extends UnsubMethod {
  /**
   * Constructor for UnsubPost.
   * @param {URL} weblink - The web link to send the POST request to.
   */
  constructor(weblink) {
    super();
    this.weblink = weblink;
  }

  /**
   * Executes the unsubscribe action via an HTTP POST request.
   *
   * Implements the RFC 8058 "One-Click Unsubscribe" mechanism:
   * sends a POST request to the provided URL with a form body of
   * `List-Unsubscribe=One-Click`.
   *
   * If the request completes with a non-2xx status code or the fetch
   * operation fails, this method throws an {@link Error} describing
   * the reason.
   *
   * @async
   * @throws {Error} If the network request fails or the server responds
   *         with a non-OK status code.
   * @returns {Promise<void>} Resolves when the unsubscribe request
   *          succeeds (HTTP 2xx response).
   */
  async call() {
    console_log('Post to', this.weblink);

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
    };

    console_log(fetchOptions);

    const response = await fetch(this.weblink, fetchOptions);
    if (!response.ok) {
      throw new Error(`Error during unsubscribe request: ${response.status}`);
    }
    console_log(response);
  }

  /**
   * Returns details of the unsubscribe method.
   * @returns {any} - Method details, including type and address.
   */
  getMethodDetails() {
    return { method: 'Post', address: this.weblink.href };
  }
}

/**
 * Class for unsubscribing via an email.
 * This class handles composing and sending an unsubscribe email.
 */
class UnsubMail extends UnsubMethod {
  /**
   * Constructor for UnsubMail.
   * @param {MailIdentity} identity - The identity for the email.
   * @param {URL} email - The email address to send the unsubscribe request to.
   */
  constructor(identity, email) {
    super();
    this.identity = identity;
    this.email = email;
  }

  /**
   * Executes the unsubscribe action by sending an email message.
   *
   * Opens a compose window using the Thunderbird Compose API,
   * pre-filled with the standard "unsubscribe" subject and body,
   * and sends the message immediately.
   *
   * The target address and optional subject line are extracted from
   * the `mailto:` URL supplied in the `List-Unsubscribe` header.
   *
   * If message composition or sending fails, this method throws an
   * {@link Error} describing the failure.
   *
   * @async
   * @throws {Error} If the compose window cannot be created or the
   *         message send operation fails.
   * @returns {Promise<void>} Resolves once the unsubscribe email
   *          has been successfully sent.
   */
  async call() {
    let details = {
      to: this.email.pathname,
      subject: this.email.searchParams.has('subject')
        ? this.email.searchParams.get('subject')
        : 'unsubscribe',
      body: 'Please unsubscribe me from your mailing list. Thank you.',
    };

    if (this.identity) {
      details.identityId = this.identity.id;
    }

    const composeTab = await messenger.compose.beginNew(details);

    const { _messages, _mode, id } = await messenger.compose.sendMessage(
      composeTab.id,
      { mode: 'sendNow' }
    );

    if (typeof id == 'undefined') {
      throw new Error('Sent message is undefined');
    }
  }

  /**
   * Returns details of the unsubscribe method.
   * @returns {any} - Method details, including type and address.
   */
  getMethodDetails() {
    return { method: 'Email', address: this.email.pathname };
  }
}

/**
 * Class for unsubscribing via a web link.
 * This class handles opening a web page for unsubscription.
 */
class UnsubWeb extends UnsubMethod {
  /**
   * Constructor for UnsubWeb.
   * @param {URL} link - The web link to visit for unsubscribing.
   */
  constructor(link) {
    super();
    this.link = link;
  }

  /**
   * Executes the unsubscribe action by opening the sender’s
   * unsubscribe web page in a popup browser window.
   *
   * This follows the RFC 2369 "List-Unsubscribe" web-link mechanism.
   * No network request is made automatically; the user completes
   * the process manually in the opened window.
   *
   * Throws an {@link Error} if the window cannot be created.
   *
   * @async
   * @throws {Error} If the popup window cannot be opened (for example,
   *         due to permissions or browser restrictions).
   * @returns {Promise<void>} Resolves once the popup window has been
   *          successfully opened.
   */
  async call() {
    await messenger.windows.create({
      url: this.link.href,
      type: 'popup',
    });
  }

  /**
   * Returns details of the unsubscribe method.
   * @returns {any} - Method details, including type and address.
   */
  getMethodDetails() {
    return { method: 'Browser', address: this.link.href };
  }
}

/**
 * Generator function to yield messages from a paginated list.
 * @param {Promise<object>} list - The paginated list of messages.
 * @returns {AsyncGenerator<object>} - An async generator that yields messages.
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
 * @returns {AsyncGenerator<object>} - An async generator that yields messages from all inboxes.
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
 * @returns {Promise<void>}
 */
messenger.runtime.onMessage.addListener(async (messageFromPopup) => {
  if (!messageFromPopup.messageId) {
    console_log('Unknown action', messageFromPopup);
    return false;
  }

  const messageId = parseInt(messageFromPopup.messageId);

  if (messageFromPopup.getMethod === true) {
    return handleGetMethod(messageId);
  } else if (messageFromPopup.unsubscribe === true) {
    return await handleUnsubscribe(messageId);
  } else if (messageFromPopup.cancel === true) {
    return handleCancel();
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
function handleGetMethod(messageId) {
  console_log('Method Requested');
  const func = funcCache.get(messageId);
  console_log('Method', func);
  return func ? func.getMethodDetails() : { method: 'NONE' };
}

/**
 * Executes the unsubscribe operation.
 * @param {number} messageId - The ID of the message.
 * @returns {Promise<object>} - Response indicating the result of the unsubscribe operation.
 */
async function handleUnsubscribe(messageId) {
  console_log('User chose to unsubscribe from the mailing list');
  const func = funcCache.get(messageId);
  try {
    await func.call();
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
function handleCancel() {
  console_log('User canceled the unsubscribe action.');
  return { response: 'Canceled' };
}

/**
 * Handles the deletion of messages based on provided criteria.
 * @param {object} messageFromPopup - The message data containing deletion criteria.
 * @returns {Promise<object>} - Response indicating the result of the deletion operation.
 */
async function handleDelete(messageFromPopup) {
  console_log(messageFromPopup);
  try {
    const messageIds = await collectMessageIdsToDelete(messageFromPopup);

    if (messageIds.length) {
      console_log('Deleting Selected Messages');
      await messenger.messages.delete(messageIds, false);
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
      if (message.author.trim().toLowerCase().includes(atDomain)) {
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
