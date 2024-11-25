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
 * Event listener for message display events.
 * Disables the action button initially and checks if unsubscribe information is available.
 * If unsubscribe info is found, the action button is enabled.
 * @param {object} tab - The browser tab where the message is displayed.
 * @param {messenger.messages.MessageHeader} message - The message being displayed.
 */
messenger.messageDisplay.onMessageDisplayed.addListener(
  async (tab, message) => {
    console_log('Message displayed');
    await messenger.messageDisplayAction.disable(); // Disable action button until processing is complete
    if (message) {
      try {
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
          await messenger.messageDisplayAction.enable(); // Enable action button if unsubscribe info is found
        }
      } catch (error) {
        console_error(error);
      }
    }
  }
);

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
      return new UnsubPost(httpsLink, postCommand);
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
  const httpsLinkMatch = header.match(/(https?:\/\/[^>]+)/);
  return httpsLinkMatch ? new URL(httpsLinkMatch[1]) : null;
}

// Helper function to extract mailto link from the header
/**
 * Extracts a mailto link from the unsubscribe header.
 * @param {string} header - The unsubscribe header containing the mailto link.
 * @returns {URL|null} - The extracted mailto link if found, otherwise null.
 */
function extractMailtoLink(header) {
  const emailMatch = header.match(/<(mailto:[^>]+)/i);
  if (emailMatch) {
    return new URL(emailMatch[1].replace(/^mailto:\/*/, 'mailto:'));
  }
  return null;
}

// Helper function to retrieve identity associated with the message
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
  if (messageHeader.folder) {
    const folder = messageHeader.folder;
    const accounts = await messenger.accounts.list();

    for (const account of accounts) {
      for (const identity of account.identities) {
        if (folder.accountId === account.id) {
          return identity;
        }
      }
    }
  }
  return null; // No matching identity found
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
   * @param {string} command - The command to be sent in the POST request.
   */
  constructor(weblink, command) {
    super();
    this.weblink = weblink;
    this.command = command;
  }

  /**
   * Executes the unsubscribe action via a POST request.
   * This implementation follows RFC 8058 (Post request).
   * @returns {Promise<boolean>} - True if the request is successful, otherwise false.
   */
  async call() {
    try {
      console_log('Post to', this.weblink);

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'List-Unsubscribe-Post': this.command,
        },
        body: 'List-Unsubscribe=One-Click',
      };

      console_log(fetchOptions);

      const response = await fetch(this.weblink, fetchOptions);
      if (!response.ok) {
        console_error('Error during unsubscribe request:', response.status);
        return false;
      }

      console_log(response);
      return true;
    } catch (error) {
      console_error('Error during unsubscribe request:', error);
      return false;
    }
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
   * Executes the unsubscribe action via an email.
   * Opens a new compose window with the unsubscribe message.
   * @returns {Promise<boolean>} - True if the email is successfully composed, otherwise false.
   */
  async call() {
    try {
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

      await messenger.compose.beginNew(details);

      return true;
    } catch (error) {
      console_error('Error during unsubscribe email:', error);
      return false;
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
   * Executes the unsubscribe action by opening the web link in a popup window.
   * @returns {Promise<boolean>} - True if the window is successfully opened, otherwise false.
   */
  async call() {
    try {
      await messenger.windows.create({
        url: this.link.href,
        type: 'popup',
      });

      return true;
    } catch (error) {
      console_error('Error during web unsubscribe:', error);
      return false;
    }
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
  } else {
    console_log('Unknown action', messageFromPopup);
    return false;
  }
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
  const out = await func.call();
  return out ? { response: 'Unsubscribed' } : { response: 'Error' };
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
