// Map to store functions for different unsubscribe actions associated with message IDs
const funcCache = new Map(); //MessageId:UnsubMethod

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
 * Event listener for message display events.
 * Disables the action button initially and checks if unsubscribe information is available.
 * If unsubscribe info is found, the action button is enabled.
 * @param {object} tab - The browser tab where the message is displayed.
 * @param {messenger.messages.MessageHeader} message - The message being displayed.
 */
messenger.messageDisplay.onMessageDisplayed.addListener(async (tab, message) => {
    console_log("Message displayed");
    await messenger.messageDisplayAction.disable(); // Disable action button until processing is complete
    if (message) {
        try {
            const found = await checkUnsub(message);
            if (found === true) {
                await messenger.messageDisplayAction.enable(); // Enable action button if unsubscribe info is found
            }
        } catch (error) {
            console_error(error);
        }
    }
});

/**
 * Checks if a message exists in the cache or if unsubscribe information in the message.
 * @param {messenger.messages.MessageHeader} message - The message to check.
 * @returns {Promise<boolean>} - True if the message maps to a non-null object, false otherwise.
 */
async function checkUnsub(message) {
    if (funcCache.has(message.id)) {
        // Message is in cache
        const value = funcCache.get(message.id);
        // Return true if value is a non-null object, false if null
        return value !== null;
    } else {
        // Message not in cache, call search(message)
        const value = await searchUnsub(message); // Assumes search is defined elsewhere
        // Store the result in cache
        funcCache.set(message.id, value);
        // Return true if value is a non-null object, false if null
        return value !== null;
    }
}

/**
 * Searches for unsubscribe links and information in the message headers and body.
 * @param {messenger.messages.MessageHeader} selectedMessage - The selected message to search for unsubscribe information.
 * @returns {Promise<UnsubMethod>} - Unsubscribe Method if found, otherwise null.
 */
async function searchUnsub(selectedMessage) {
    let fullMessage = await messenger.messages.getFull(selectedMessage.id);
    let messageHeader = await messenger.messages.get(selectedMessage.id);
    // See RFC 2369 (Mailing list Header)
    if (fullMessage.headers.hasOwnProperty('list-unsubscribe')) {
        let unsubscribeHeader = fullMessage.headers['list-unsubscribe'];
        if (Array.isArray(unsubscribeHeader)){
            unsubscribeHeader = unsubscribeHeader[0];
        }
        console_log("Header", unsubscribeHeader);
        const httpsLink = extractHttpsLink(unsubscribeHeader);
        const email = extractMailtoLink(unsubscribeHeader);

        if (fullMessage.headers.hasOwnProperty('list-unsubscribe-post')) {
            console_log("OneClick Link Found", httpsLink);
            const postCommand = fullMessage.headers['list-unsubscribe-post'][0];
            console_log("post", postCommand);
            if (httpsLink && postCommand) {
                return new UnsubPost(httpsLink, postCommand); // Return unsubscribe POST request method
            }
        }

        if (email) {
            console_log("Unsubscribe Email Found", email);
            const [emailAddress, params] = parseMailtoLink(email);
            const subject = params.subject || 'unsubscribe';

            const identity = await retrieveIdentity(messageHeader);
            return new UnsubMail(identity, emailAddress, subject);
        }

        if (httpsLink) {
            console_log("Unsubscribe WebLink Found", httpsLink);
            return new UnsubWeb(httpsLink); // Return unsubscribe web link method
        }
    }

    // Check for embedded unsubscribe links in the message body
    let embeddedLink = findEmbeddedUnsubLinkHTML(fullMessage);

    if (embeddedLink) {
        console_log("Embedded HTML Unsubscribe WebLink Found", embeddedLink);
        console_log(embeddedLink);
        let decoded = decodeURIComponent(embeddedLink);
        console_log("Decoded:", decoded);
        return new UnsubWeb(embeddedLink); // Return unsubscribe embedded web link method
    }

    embeddedLink = findEmbeddedUnsubLinkRegex(fullMessage);

    if (embeddedLink) {
        console_log("Embedded Unsubscribe WebLink Found", embeddedLink);
        console_log(embeddedLink);
        let decoded = decodeURIComponent(embeddedLink);
        console_log("Decoded:", decoded);
        return new UnsubWeb(decoded); // Return unsubscribe embedded decoded web link method
    }

    return null;
}

// Helper function to extract HTTPS link
/**
 * Extracts an HTTPS link from the unsubscribe header.
 * @param {string} header - The unsubscribe header containing the URL.
 * @returns {string|null} - The extracted HTTPS link if found, otherwise null.
 */
function extractHttpsLink(header) {
    const httpsLinkMatch = header.match(/(https?:\/\/[^>]+)/);
    return httpsLinkMatch ? httpsLinkMatch[1] : null;
}

// Helper function to extract mailto link
/**
 * Extracts a mailto link from the unsubscribe header.
 * @param {string} header - The unsubscribe header containing the mailto link.
 * @returns {string|null} - The extracted mailto link if found, otherwise null.
 */
function extractMailtoLink(header) {
    const emailMatch = header.match(/mailto:([^>]+)/i);
    return emailMatch ? emailMatch[1] : null;
}

// Helper function to parse mailto link and extract parameters
/**
 * Parses a mailto link and extracts the email address and parameters.
 * @param {string} email - The mailto link to parse.
 * @returns {Array} - An array containing the email address and parameters.
 */
function parseMailtoLink(email) {
    const emailSplit = email.split("?");
    const emailAddress = emailSplit[0];
    let params = {};

    if (emailSplit.length > 1) {
        params = Object.fromEntries(new URLSearchParams(emailSplit[1]).entries());
    }

    return [emailAddress, params];
}

// Helper function to retrieve identity
/**
 * Retrieves the MailIdentity associated with the given email's receiver.
 * @param {messenger.messages.MessageHeader} messageHeader - The message header to search for identities.
 * @returns {Promise<MailIdentity|undefined>} - The found MailIdentity, or undefined if no identity is found.
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
        console_log("No identity found for", messageHeader);
    }

    return identity || undefined; // Return undefined if no identity is found
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
            if (link.textContent.match(unsubscribeRegex) || link.href.match(unsubscribeRegex)) {
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

const unsubscribeRegexString = "\\bun\\W?(?:subscri(?:be|bing|ption))\\b";

const unsubscribeRegex = new RegExp(unsubscribeRegexString, "i");

// Precompile the regex pattern outside the function to avoid recompiling it on each call
const embeddedUnsubRegex = new RegExp(
    '(?:' +
    '(https?:\\/\\/[\\S]*' + unsubscribeRegexString + '[\\S]*)' +         // URL containing 'unsubscribe'
    ')|(?:' +
    '(https?:\\/\\/[\\S]*)[\\s\\S]{0,300}' + unsubscribeRegexString + // URL followed by 'unsubscribe' within 300 chars
    ')|(?:' +
    unsubscribeRegexString + '[\\s\\S]{0,300}(https?:\\/\\/[\\S]*)' + // 'unsubscribe' followed by URL within 300 chars
    ')',
    'i'
);

/**
 * Finds embedded unsubscribe links within the message body using a single regular expression.
 * @param {messenger.messages.MessagePart} messagePart - The message part to search for embedded links.
 * @returns {string|null} - The embedded link if found, otherwise null.
 */
function findEmbeddedUnsubLinkRegex(messagePart) {
    if (messagePart && messagePart.body) {
        const match = messagePart.body.match(embeddedUnsubRegex);
        if (match) {
            // Return the first non-null captured group
            return match[1] || match[2] || match[3] || null;
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
    if(messageHeader.folder) {
        let folder = messageHeader.folder;
        let accounts = await messenger.accounts.list();

        for (let account of accounts) {
            for (let identity of account.identities) {
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
        throw new Error("This method must be implemented by subclasses");
    }
}

/**
 * Class for unsubscribing via a POST request.
 */
class UnsubPost extends UnsubMethod {
    /**
     * Constructor for UnsubPost.
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
     * See RFC 8058 (Post request)
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

    /**
     * Returns details of the unsubscribe method.
     * @returns {any} - Method details, including type and address.
     */
    getMethodDetails() {
        return {method: "Post", address: this.weblink};
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

    /**
     * Returns details of the unsubscribe method.
     * @returns {any} - Method details, including type and address.
     */
    getMethodDetails() {
        return {method: "Email", address: this.emailAddress};
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

    /**
     * Returns details of the unsubscribe method.
     * @returns {any} - Method details, including type and address.
     */
    getMethodDetails() {
        return {method: "Browser", address: this.link};
    }
}

/**
 * Handles runtime messages for the extension.
 * @param {object} message - The message received.
 * @param {object} sender - The sender of the message.
 * @param {function} sendResponse - The function to send a response.
 */
messenger.runtime.onMessage.addListener(async (message) => {
    if (message.messageId) {
        let messageId = parseInt(message.messageId);
        if (message.unsubscribe === true) {
            console_log("User chose to unsubscribe from the mailing list");
            let out = await funcCache.get(messageId).call();
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
            //let messageHeader = await messenger.messages.get(messageId);
            let author = message.author;
            if (author) {
                console_log("User wants to delete all emails from", author);

                let messages = await messenger.messages.query({
                    author: author
                });

                console_log("Deleting", messages);

                let messageIds = messages.messages.map(message => message.id);

                await messenger.messages.delete(messageIds, false);
                return {response: 'Deleted', count: messageIds.length};
            } else {
                console_error("Received Invalid author:", author)
                return {response: 'Error'};
            }
        } else if (message.getMethod === true) {
            console_log('Method Requested');
            let func = funcCache.get(messageId);
            console_log("Method", func);
            if (func) {
                return func.getMethodDetails();
            } else {
                return {method: "NONE"};
            }
        }
    } else {
        console_log("IDK", message);
        return false;
    }
});

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    // Export the functions and classes for testing
    module.exports = {
        searchUnsub,
        UnsubMethod,
        UnsubWeb,
        UnsubMail,
        UnsubPost,
        funcCache
    };
}
