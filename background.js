// Map to store functions for different unsubscribe actions associated with message IDs
const funcMap = new Map(); //MessageId:UnsubMethod

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
    console_log('Clicked');
    await messenger.messageDisplayAction.disable(); // Disable action button until processing is complete
    if (tab.type === "messageDisplay" || tab.type === "mail") {
        let messageHeader = await messenger.messageDisplay.getDisplayedMessage(tab.id);
        if (messageHeader) {
            const found = await searchForUnsub(messageHeader);
            if (found === true) {
                await createPopup(messageHeader);
                await messenger.messageDisplayAction.enable()
            }
        }
    }
});

/**
 * Listener for when a tab is activated. It checks if the active tab is a message display or mail tab
 * and enables or disables the messageDisplayAction accordingly.
 * @param {object} activeInfo - The information about the activated tab.
 */
messenger.tabs.onActivated.addListener(async (activeInfo) => {
    console_log("Tab Activated");
    await messenger.messageDisplayAction.disable(); // Disable action button until processing is complete
    let tab = await messenger.tabs.get(activeInfo.tabId);
    if (tab) {
        console_log(tab.type);
        if (tab.type === "messageDisplay" || tab.type === "mail") {
            let messageHeader = await messenger.messageDisplay.getDisplayedMessage(tab.id);
            if (messageHeader) {
                const found = await searchForUnsub(messageHeader);
                if (found === true) {
                    await messenger.messageDisplayAction.enable(); // Enable action button if unsubscribe info is found
                }
            }
        }
    }
});

/**
 * Listener for when the selected messages in a mail tab change. It checks the selected message
 * for unsubscribe information and enables or disables the messageDisplayAction accordingly.
 * @param {MailTab} tab - The currently active mail tab.
 * @param {MessageList} messageList - The list of selected messages in the tab.
 */
messenger.mailTabs.onSelectedMessagesChanged.addListener(async (tab, messageList) => {
    console_log("Selected Message Changed");
    await messenger.messageDisplayAction.disable(); // Disable action button until processing is complete
    if (messageList.messages.length !== 0) {
        const messageHeader = messageList.messages[0];
        const found = await searchForUnsub(messageHeader);
        if (found === true) {
            await messenger.messageDisplayAction.enable(); // Enable action button if unsubscribe info is found
        }
    }
});

/**
 * Searches for unsubscribe information in the selected message.
 * If found, it stores the information in the funcMap.
 * @param {messenger.messages.MessageHeader} selectedMessage - The selected message to search for unsubscribe information.
 * @returns {Promise<boolean>} - True if unsubscribe information is found, otherwise false.
 */
async function searchForUnsub(selectedMessage) {
    if (!funcMap.has(selectedMessage.id)) {
        try {
            let result = await searchUnsub(selectedMessage);
            if (result) {
                console_log("Unsub Found For", selectedMessage['subject']);
                funcMap.set(selectedMessage.id, result); // Store the unsubscribe method if found
                return true;
            } else {
                console_log("No Unsub Found For", selectedMessage['subject']);
                funcMap.set(selectedMessage.id, false); // Mark as no unsubscribe info found
            }
        } catch (error) {
            console_error(error);
        }
    } else {
        if (funcMap.get(selectedMessage.id)) {
            console_log("Unsub found previously for", selectedMessage['subject']);
            return true;
        } else {
            console_log("Previously found no unsub for", selectedMessage['subject']);
            return false;
        }
    }

    return false;
}

/**
 * Decodes a URL that may contain encoded characters.
 * @param {string} url - The URL to decode.
 * @returns {string} - The decoded URL.
 */
function decodeURL(url) {
    return decodeURIComponent(url.replace(/=([A-Fa-f0-9]{2})/g, '%$1'));
}

/**
 * Searches for unsubscribe links and information in the message headers and body.
 * @param {messenger.messages.MessageHeader} selectedMessage - The selected message to search for unsubscribe information.
 * @returns {Promise<UnsubMethod|boolean>} - Unsubscribe Method if found, otherwise false.
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
                    return new UnsubPostRequest(httpsLink, postCommand); // Return unsubscribe POST request method
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

                let identity = await getIdentityReceiver(messageHeader);

                if (identity === null) {
                    identity = await getIdentityForMessage(messageHeader);
                    if (identity === null) {
                        let identities = await messenger.identities.list();
                        if (identities.length !== 0) {
                            identity = identities[0];
                        } else {
                            identity = undefined; // Fallback if no identity is found
                        }
                    }
                }

                return new UnsubMail(identity, emailAddress, subject); // Return unsubscribe email method
            }

            if (httpsLink) {
                console_log("Unsubscribe WebLink Found");
                return new UnsubWeb(httpsLink); // Return unsubscribe web link method
            }
        }

        // Check for embedded unsubscribe links in the message body
        let embeddedLink = findEmbeddedUnsubLinkHTML(fullMessage);

        if (embeddedLink) {
            console_log("Embedded HTML Unsubscribe WebLink Found");
            return new UnsubWeb(embeddedLink); // Return unsubscribe embedded web link method
        }

        embeddedLink = findEmbeddedUnsubLinkRegex(fullMessage);

        if (embeddedLink) {
            console_log("Embedded Unsubscribe WebLink Found");
            console_log(embeddedLink);
            console_log("Decoded:", decodeURL(embeddedLink));
            return new UnsubWeb(decodeURL(embeddedLink)); // Return unsubscribe embedded decoded web link method
        }

        return false;

    } catch (error) {
        console_error(error);
        return false;
    }
}

/**
 * Finds embedded unsubscribe links within the message body using HTML parsing.
 * @param {messenger.messages.MessagePart} messagePart - The message part to search for embedded links.
 * @returns {string|null} - The embedded link if found, otherwise null.
 */
function findEmbeddedUnsubLinkHTML(messagePart) {
    if (messagePart.contentType === "text/html") {
        // Parse the HTML content using DOMParser
        let parser = new DOMParser();
        let doc = parser.parseFromString(messagePart.body, 'text/html');

        // Search for all <a> elements
        let links = doc.querySelectorAll('a');
        for (let link of links) {
            // Check if the link text contains "unsubscribe"
            if (link.textContent.toLowerCase().includes('unsubscribe')) {
                // Return the href attribute of the matching <a> tag
                return link.href;
            }
        }
    }

    if (messagePart.hasOwnProperty('parts')) {
        for (let part of messagePart.parts) {
            let embeddedLink = findEmbeddedUnsubLinkHTML(part);
            if (embeddedLink) {
                return embeddedLink;
            }
        }
    }

    return null;
}

/**
 * Finds embedded unsubscribe links within the message body using regular expressions.
 * @param {messenger.messages.MessagePart} messagePart - The message part to search for embedded links.
 * @returns {string|null} - The embedded link if found, otherwise null.
 */
function findEmbeddedUnsubLinkRegex(messagePart) {
    if (messagePart.hasOwnProperty('body')) {
        console_log(messagePart.contentType);
        let lowerCaseBody = messagePart.body.toLowerCase();

        // Check if the body contains the word "unsubscribe"
        if (lowerCaseBody.includes("unsubscribe")) {

            // First Regex: Capture URLs that contain the word "unsubscribe" directly in the URL
            let embeddedLinkMatch = messagePart.body.match(/(https?:\/\/[^\s"'<>]+unsubscribe[^\s"'<>]*)/i);
            let embeddedLink = embeddedLinkMatch ? embeddedLinkMatch[1] : null;
            if (embeddedLink) {
                console_log("Matched First Regex");
                return embeddedLink;
            }

            // Second Regex: Capture hrefs where "unsubscribe" appears within 300 characters after the href
            embeddedLinkMatch = messagePart.body.match(/(https?:\/\/[^\s"'<>]*)[^:]{0,300}unsubscribe/i);
            embeddedLink = embeddedLinkMatch ? embeddedLinkMatch[1] : null;
            if (embeddedLink) {
                console_log("Matched Second Regex");
                return embeddedLink;
            }

            // Third Regex: Capture cases where "unsubscribe" appears first, followed by a URL within 300 characters
            embeddedLinkMatch = messagePart.body.match(/unsubscribe[^:]{0,300}(https?:\/\/[^\s"'<>]*)/i);
            embeddedLink = embeddedLinkMatch ? embeddedLinkMatch[1] : null;
            if (embeddedLink) {
                console_log("Matched Third Regex");
                return embeddedLink;
            }

            // Error logging if no unsubscribe link is found
            console_error("Unsubscribe mentioned but couldn't find embedded unsub link");
            console_error(lowerCaseBody);
        }
    }

    if (messagePart.hasOwnProperty('parts')) {
        for (let part of messagePart.parts) {
            let embeddedLink = findEmbeddedUnsubLinkRegex(part);
            if (embeddedLink) {
                return embeddedLink;
            }
        }
    }

    return null;
}

/**
 * Retrieves the MailIdentity associated with the given email headers receiver.
 * @param {messenger.messages.MessageHeader} messageHeader - The MessageHeader associated with the message.
 * @returns {Promise<MailIdentity|null>} - The MailIdentity if found, otherwise null.
 */
async function getIdentityReceiver(messageHeader) {
    let allReceivers = new Set([...messageHeader.bccList, ...messageHeader.ccList, ...messageHeader.recipients]);

    let identities = await messenger.identities.list();

    for (let identity of identities) {
        if (allReceivers.has(identity.email)) {
            return identity;
        }
    }

    return null;
}

/**
 * Retrieves the MailIdentity associated with the given message's folder.
 * @param {messenger.messages.MessageHeader} messageHeader - The MessageHeader associated with the message.
 * @returns {Promise<MailIdentity>} - The MailIdentity if found, otherwise null.
 */
async function getIdentityForMessage(messageHeader) {
    let folder = messageHeader.folder;
    let accounts = await messenger.accounts.list();

    for (let account of accounts) {
        for (let identity of account.identities) {
            if (folder.accountId === account.id) {
                return identity;
            }
        }
    }
    return null; // No matching identity found
}

// See RFC 2369 (Mailing list Header) and RFC 8058 (Post request)

/**
 * Base class for different unsubscribe methods.
 */
class UnsubMethod {
    /**
     * Method to be implemented by subclasses to execute the unsubscribe action.
     * @throws {Error} - If the method is not implemented by a subclass.
     */
    async call() {
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
                },
                body: 'List-Unsubscribe=One-Click'
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
}

/**
 * Class for unsubscribing via an email.
 */
class UnsubMail extends UnsubMethod {
    /**
     * Constructor for UnsubMail.
     * @param {MailIdentity} identity - The identity for the email
     * @param {string} emailAddress - The email address to send the unsubscribe request to.
     * @param {string} subject - The subject of the unsubscribe email.
     */
    constructor(identity, emailAddress, subject) {
        super();
        this.identity = identity;
        this.emailAddress = emailAddress;
        this.subject = subject;
    }

    /**
     * Executes the unsubscribe action via an email.
     * @returns {Promise<boolean>} - True if the email is successfully composed, otherwise false.
     */
    async call() {
        try {
            let details = {
                to: this.emailAddress,
                subject: this.subject,
                body: "Please unsubscribe me from your mailing list. Thank you."
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
    if (message.messageId) {
        let messageId = parseInt(message.messageId);
        if (message.unsubscribe === true) {
            console_log("User chose to unsubscribe from the mailing list");
            let out = await funcMap.get(messageId).call();
            if (out) {
                return {response: "Unsubscribed"};
            } else {
                return {response: "Error"};
            }
        } else if (message.cancel === true) {
            console_log("User canceled the unsubscribe action.");
            return {response: "Canceled"};
        } else if (message.delete === true) {
            console_log("User wants to delete the email");
            await messenger.messages.delete([messageId], false);
            return {response: 'Deleted'};
        } else if (message.deleteAllFromSender === true) {
            let messageHeader = await messenger.messages.get(messageId);
            let author = messageHeader.author;
            console_log("User wants to delete alls email from", author);

            let messages = await messenger.messages.query({
                author: author
            });

            console_log("Deleting", messages);

            let messageIds = messages.messages.map(message => message.id);

            await messenger.messages.delete(messageIds, false);
            return {response: 'Deleted'};
        } else if (message.getMethod === true) {
            console_log('Method Requested');
            let func = funcMap.get(messageId);
            console_log(func);
            if (func instanceof UnsubPostRequest) {
                return {method: "Post", address: func.weblink};
            } else if (func instanceof UnsubMail) {
                return {method: "Email", address: func.emailAddress};
            } else if (func instanceof UnsubWeb) {
                return {method: "Browser", address: func.link};
            } else if (func === false) {
                return {method: "NONE"};
            } else {
                return {method: "IDK"};
            }
        }
    } else {
        console_log("No MessageID", message);
        return false;
    }
});

/**
 * Creates a popup window for the user to confirm the unsubscribe action.
 * @param {object} message - The message object containing details for the popup.
 */
async function createPopup(message) {
    console_log("Create Popup for message id:", message.id);
    const url = `popup.html?messageId=${message.id}`;
    await messenger.windows.create({
        url: url,
        type: "popup",
        height: 400,
        width: 700,
        allowScriptsToClose: true
    });
}