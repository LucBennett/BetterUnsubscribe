// Map to store functions for different unsubscribe actions
this.funcMap = new Map(); 

// Map to store popup windows and associated messages
this.popupMap = new Map(); 

// Variable to store the currently selected message
this.selectedMessage = undefined; 

/**
 * Logs messages to the console with a specific prefix.
 * @param {...*} arguments - The arguments to be logged.
 */
function console_log() {
  console.log("[BetterUnsubscribe][background.js]", ...arguments);
}

/**
 * Logs errors to the console with a specific prefix.
 * @param {...*} arguments - The arguments to be logged as errors.
 */
function console_error() {
  console.error("[BetterUnsubscribe][background.js]", ...arguments);
}

/**
 * Opens a dialog for the user to confirm the unsubscribe action when the message display action is clicked.
 * @param {MailTab} tab - The currently active tab.
 */
messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  if (this.selectedMessage) {
    await createPopup(this.selectedMessage);
  }
});

/**
 * Triggers when messages are displayed in the message tab.
 * @param {MailTab} tab - The currently active tab.
 * @param {MessageList} messageList - The list of displayed messages.
 */
messenger.messageDisplay.onMessagesDisplayed.addListener(async (tab, messageList) => {
  console_log("Display Changed");
  this.selectedMessage = null;
  messenger.messageDisplayAction.disable();

  if (messageList.length > 1) {
    console_log("Multiple Messages Selected");
  } else if (messageList.length == 1) {
    this.selectedMessage = messageList[0];
    if (await searchForUnsub(this.selectedMessage)) {
      messenger.messageDisplayAction.enable();
    }
  } else {
    console_log("No Messages Selected");
  }
});

/**
 * Searches for unsubscribe information in the selected message.
 * @param {MessageHeader} selectedMessage - The selected message to search for unsubscribe information.
 * @returns {boolean} - True if unsubscribe information is found, otherwise false.
 */
async function searchForUnsub(selectedMessage) {
  if (!this.funcMap.has(selectedMessage.id)) {
    try {
      let result = await searchUnsub(selectedMessage);
      if (result) {
        console_log("Unsub Found For", selectedMessage['subject']);
        this.funcMap.set(selectedMessage.id, result);
        return true;
      } else {
        console_log("No Unsub Found For", selectedMessage['subject']);
      }
    } catch (error) {
      console_error(error);
    }
  } else {
    console_log("Unsub Found previously For", selectedMessage['subject']);
    return true;
  }
  return false;
}

/**
 * Searches for unsubscribe links and information in the message headers and body.
 * @param {MessageHeader} selectedMessage - The selected message to search for unsubscribe information.
 * @returns {Function|boolean} - Unsubscribe function if found, otherwise false.
 */
async function searchUnsub(selectedMessage) {
  try {
    let fullMessage = await messenger.messages.getFull(selectedMessage.id);
    let messageHeader = await messenger.messages.get(selectedMessage.id);

    if (fullMessage.headers.hasOwnProperty('list-unsubscribe')) {
      const unsubscribeHeader = fullMessage.headers['list-unsubscribe'][0];
      const httpsLinkMatch = unsubscribeHeader.match(/<(https?:\/\/[^>]+)>/);
      const httpsLink = httpsLinkMatch ? httpsLinkMatch[1] : null;
      const emailMatch = unsubscribeHeader.match(/<mailto:([^>]+)>/i);
      const email = emailMatch ? emailMatch[1] : null;

      if (fullMessage.headers.hasOwnProperty('list-unsubscribe-post')) {
        console_log("OneClick Link Found");
        const postCommand = fullMessage.headers['list-unsubscribe-post'][0];
        if (httpsLink && postCommand) {
          return new UnsubPostRequest(httpsLink, postCommand);
        }
      }

      if (email) {
        console_log("Unsubscribe Email Found");
        const emailSplit = email.split("?");
        const emailAddress = emailSplit[0];
        let params = {};
        if (emailSplit.length > 1) {
          let paramsString = emailSplit[1];
          for (let param of paramsString.split('&')) {
            let pair = param.split('=');
            params[pair[0]] = pair[1];
          }
        }

        let subject = "unsubscribe";
        if ('subject' in params) {
          subject = params['subject'];
        }

        return new UnsubMail(messageHeader, emailAddress, subject);
      }

      if (httpsLink) {
        console_log("Unsubscribe WebLink Found");
        return new UnsubWeb(httpsLink);
      }
    }

    let embeddedLink = findEmbeddedUnsubLink(fullMessage);

    if (embeddedLink) {
      console_log("Embedded Unsubscribe WebLink Found");
      return new UnsubWeb(embeddedLink);
    }

    return false;

  } catch (error) {
    console_error(error);
    return false;
  }
}

/**
 * Finds embedded unsubscribe links within the message body.
 * @param {MessagePart} messagePart - The message part to search for embedded links.
 * @returns {string|null} - The embedded link if found, otherwise null.
 */
function findEmbeddedUnsubLink(messagePart) {
  if (messagePart.hasOwnProperty('body')) {
    let lowerCaseBody = messagePart.body.toLowerCase();

    // Check if the body contains the word "unsubscribe"
    if (lowerCaseBody.includes("unsubscribe")) {

      // First Regex: Capture URLs that contain the word "unsubscribe" directly in the URL
      let embeddedLinkMatch = messagePart.body.match(/(https?:\/\/[^\s"'<>]+unsubscribe[^\s"'<>]*)/i);
      let embeddedLink = embeddedLinkMatch ? embeddedLinkMatch[1] : null;
      if (embeddedLink) {
        return embeddedLink;
      }

      // Second Regex: Capture hrefs where "unsubscribe" appears within 300 characters after the href
      embeddedLinkMatch = messagePart.body.match(/href=["'](https?:\/\/[^"']*)["'].{0,300}unsubscribe/i);
      embeddedLink = embeddedLinkMatch ? embeddedLinkMatch[1] : null;
      if (embeddedLink) {
        return embeddedLink;
      }

      // Third Regex: Capture cases where "unsubscribe" appears first, followed by a URL within 300 characters
      embeddedLinkMatch = messagePart.body.match(/unsubscribe.{0,300}(https?:\/\/[^"']*)/i);
      embeddedLink = embeddedLinkMatch ? embeddedLinkMatch[1] : null;
      if (embeddedLink) {
        return embeddedLink;
      }

      // Error logging if no unsubscribe link is found
      console_error("Couldn't find embedded unsub link");
    }
  }

  if (messagePart.hasOwnProperty('parts')) {
    for (let part of messagePart.parts) {
      let embeddedLink = findEmbeddedUnsubLink(part);
      if (embeddedLink) {
        return embeddedLink;
      }
    }
  }

  return null;
}

/**
 * Base class for different unsubscribe methods.
 */
class UnsubMethod {
  /**
   * Method to be implemented by subclasses to execute the unsubscribe action.
   * @throws {Error} - If the method is not implemented by a subclass.
   */
  call() {
    throw new Error('Method call() must be implemented.');
  }
}

/**
 * Class for unsubscribing via a POST request.
 */
class UnsubPostRequest extends UnsubMethod {
  /**
   * Constructor for UnsubPostRequest.
   * @param {string} weblink - The web link to send the POST request to.
   * @param {string} command - The command to be sent in the POST request.
   */
  constructor(weblink, command) {
    super();
    this.weblink = weblink;
    this.command = command;
  }

  /**
   * Executes the unsubscribe action via a POST request.
   * @returns {Promise<boolean>} - True if the request is successful, otherwise false.
   */
  async call() {
    try {
      console_log("Post to", this.weblink);

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'List-Unsubscribe-Post': this.command
        }
      };

      console_log(fetchOptions);

      const response = await fetch(this.weblink, fetchOptions);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console_log(response);
      return true;
    } catch (error) {
      console_error('Error during unsubscribe request:', error);
      return false;
    }
  }
}

/**
 * Class for unsubscribing via an email.
 */
class UnsubMail extends UnsubMethod {
  /**
   * Constructor for UnsubMail.
   * @param {MessageHeader} messageHeader - The message header associated with the email.
   * @param {string} emailAddress - The email address to send the unsubscribe request to.
   * @param {string} subject - The subject of the unsubscribe email.
   */
  constructor(messageHeader, emailAddress, subject) {
    super();
    this.messageHeader = messageHeader;
    this.emailAddress = emailAddress;
    this.subject = subject;
  }

  /**
   * Executes the unsubscribe action via an email.
   * @returns {Promise<boolean>} - True if the email is successfully composed, otherwise false.
   */
  async call() {
    try {
      if (!this.messageHeader || !this.emailAddress || !this.subject) {
        throw new Error('Missing required parameters');
      }

      let identity = await this.getIdentityReceiver(this.messageHeader);
      let details = {
        to: this.emailAddress,
        subject: this.subject,
        body: "Please unsubscribe me from your mailing list. Thank you."
      };

      if (identity) {
        details.identityId = identity.id;
      }

      await messenger.compose.beginNew(details);

      return true;
    } catch (error) {
      console_error('Error during unsubscribe email:', error);
      return false;
    }
  }

  /**
   * Retrieves the MailIdentity associated with the given email headers receiver.
   * @param {MessageHeader} messageHeader - The MessageHeader associated with the message.
   * @returns {Promise<MailIdentity|undefined>} - The MailIdentity if found, otherwise undefined.
   */
  async getIdentityReceiver(messageHeader) {
    let allReceivers = new Set([...messageHeader.bccList,
    ...messageHeader.ccList, ...messageHeader.recipients]);

    let identities = await messenger.identities.list();

    for (identity of identities) {
      if (allReceivers.has(identity.email)) {
        return identity;
      }
    }

    return undefined;
  }
}

/**
 * Class for unsubscribing via a web link.
 */
class UnsubWeb extends UnsubMethod {
  /**
   * Constructor for UnsubWeb.
   * @param {string} link - The web link to visit for unsubscribing.
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
      if (!this.link) {
        throw new Error('No web link provided');
      }

      await messenger.windows.create({
        url: this.link,
        type: "popup"
      });

      return true;
    } catch (error) {
      console_error('Error during web unsubscribe:', error);
      return false;
    }
  }
}

/**
 * Handles runtime messages for the extension.
 * @param {object} message - The message received.
 * @param {object} sender - The sender of the message.
 * @param {function} sendResponse - The function to send a response.
 */
messenger.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (this.popupMap.has(sender.tab.windowId)) {
    let selectedMessage = this.popupMap.get(sender.tab.windowId).message;
    if (message.unsubscribe) {
      console_log("User chose to unsubscribe from the mailing list");
      let out = await this.funcMap.get(selectedMessage.id).call();
      if (out) {
        return { response: "Unsubscribed" };
      } else {
        return { response: "Error" };
      }
    } else if (message.cancel) {
      console_log("User canceled the unsubscribe action.");
      return { response: "Canceled" };
    } else if (message.delete) {
      console_log("User wants to delete the email");
      messenger.messages.delete([selectedMessage.id], false);
      return { response: 'Deleted' };
    } else if (message.requestEmail) {
      return { email: selectedMessage['author'] };
    } else if (message.requestMethod) {
      console_log('Method Requested');
      let func = this.funcMap.get(selectedMessage.id);
      console_log(func);
      if (func instanceof UnsubPostRequest) {
        return { method: "Post", address: func.weblink };
      } else if (func instanceof UnsubMail) {
        return { method: "Email", address: func.emailAddress };
      } else if (func instanceof UnsubWeb) {
        return { method: "Browser", address: func.link };
      } else {
        return { method: "IDK" };
      }
    }
  } else {
    console_log("WEIRD MESSAGE", message);
    return false;
  }
});

/**
 * Creates a popup window for the user to confirm the unsubscribe action.
 * @param {object} message - The message object containing details for the popup.
 */
async function createPopup(message) {
  let popup = await messenger.windows.create({
    url: "popup.html",
    type: "popup",
    height: 400,
    width: 600,
    allowScriptsToClose: true
  });

  this.popupMap.set(popup.id, { 'message': message, 'window': popup });
}

/**
 * Listener for when a browser window is closed, used to clean up popupMap.
 * @param {number} windowId - The ID of the window that was closed.
 */
browser.windows.onRemoved.addListener((windowId) => {
  console_log(`Window with ID ${windowId} has been closed.`);
  if (this.popupMap.delete(windowId)) {
    console_log(`${windowId} removed from popupMap`);
  }
});
