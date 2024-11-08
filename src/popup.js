/**
 * Logs messages to the console with a custom prefix.
 * This helps identify logs specific to BetterUnsubscribe's popup.js.
 * @param {...any} args - The arguments to log.
 */
function console_log(...args) {
    console.log("[BetterUnsubscribe][popup.js]", ...args);
}

/**
 * Logs error messages to the console with a custom prefix.
 * This helps in debugging by clearly identifying error messages specific to BetterUnsubscribe.
 * @param {...any} args - The error arguments to log.
 */
function console_error(...args) {
    console.error("[BetterUnsubscribe][popup.js]", ...args);
}

/**
 * Event listener that triggers when the DOM content is fully loaded.
 * Retrieves message details, sets up button event listeners, and handles unsubscribe logic.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Retrieve the currently active tab and get the displayed message details.
    const [tab] = await messenger.tabs.query({active: true, currentWindow: true});
    const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
    console_log("Message", message.id);

    // Retrieve DOM elements for later use.
    const emailText = document.getElementById('emailText');
    const unsubscribeButton = document.getElementById('unsubscribeButton');
    const cancelButton = document.getElementById('cancelButton');
    const statusText = document.getElementById('statusText');
    const detailsText = document.getElementById('detailsText');
    const detailsCode = document.getElementById("dynamicCodeBlock");

    const deleteOneButton = document.getElementById("deleteOneButton");
    const deleteAllNameAddrButton = document.getElementById("deleteAllNameAddrButton");
    const deleteAllAddrButton = document.getElementById("deleteAllAddrButton");
    const deleteAllDomainButton = document.getElementById("deleteAllDomainButton");

    // Retrieve the message header to display the author and set the "Delete All" button text.
    const author = message.author;
    console_log(author);

    let name = undefined;
    let sender = undefined;
    let domain = undefined;

    const addressRegex = new RegExp("^(\"?([a-zA-Z\\s'\\-]+)\"?\\s+)?<([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})>$");
    const match = author.match(addressRegex);
    if (match) {
        name = match[2] || ''; // Fallback if name is optional and not present
        sender = match[3];
        domain = match[4];
        console_log(`Name: ${name}, Sender: ${sender}, Domain: ${domain}`);
    } else {
        console_error("Invalid email format");
    }


    // Create a safe line break using a document fragment or multiple elements.
    emailText.textContent = messenger.i18n.getMessage("emailText");
    emailText.appendChild(document.createElement("br"));  // Add a line break manually
    emailText.appendChild(document.createTextNode(author)); // Re-add author after the break

    if (author) {
        deleteAllNameAddrButton.appendChild(document.createElement("br"));
        deleteAllNameAddrButton.appendChild(document.createTextNode(author));
    }
    if (sender && domain) {
        deleteAllAddrButton.appendChild(document.createElement("br"));
        deleteAllAddrButton.appendChild(document.createTextNode(`${sender}@${domain}`));
    }
    if (domain) {
        deleteAllDomainButton.appendChild(document.createElement("br"));
        deleteAllDomainButton.appendChild(document.createTextNode(domain));
    }


    // Request the unsubscribe method details from the background script.
    messenger.runtime.sendMessage({messageId: message.id, getMethod: true}).then((r) => {
        console_log("Received", r);

        // Based on the unsubscribe method type (Post, Email, or Browser), update the UI with details.
        switch (r.method) {
            case "Post":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextPost") + ' ';
                detailsCode.textContent = r.address;
                break;
            case "Email":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextEmail") + ' ';
                detailsCode.textContent = r.address;
                break;
            case "Browser":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextWeb") + ' ';
                detailsCode.textContent = r.address;
                break;
            default:
            // No action if no method is provided.
        }
    }).catch((error) => {
        console_error("Error receiving methodInfo from background:", error);
    });

    /**
     * Event listener for the "Unsubscribe" button.
     * Disables the button, updates the status text, and sends an unsubscribe request to the background script.
     */
    unsubscribeButton.addEventListener('click', async () => {
        unsubscribeButton.disabled = true;
        statusText.textContent = messenger.i18n.getMessage("statusTextWorking");

        // Send unsubscribe request to the background script.
        messenger.runtime.sendMessage({messageId: message.id, unsubscribe: true}).then((r) => {
            console_log("Response from background:", r);
            if (r.response === "Unsubscribed") {
                statusText.textContent = messenger.i18n.getMessage("statusTextDone");
            } else {
                unsubscribeButton.disabled = false;
                statusText.textContent = messenger.i18n.getMessage("statusTextError");
            }
        }).catch((error) => {
            console_error("Error sending unsubscribe message:", error);
            statusText.textContent = messenger.i18n.getMessage("statusTextError");
        });
    });

    /**
     * Event listener for the "Cancel" button.
     * Sends a cancel request to the background script and closes the popup window.
     */
    cancelButton.addEventListener('click', async () => {
        try {
            const r = await messenger.runtime.sendMessage({messageId: message.id, cancel: true});
            console_log("Response from background:", r);
            window.close();
        } catch (error) {
            console_error("Error sending cancel message:", error);
        }
    });

    deleteOneButton.addEventListener('click', async () => {
        console_log("deleteOneButton");
    });
    deleteAllNameAddrButton.addEventListener('click', async () => {
        console_log("deleteAllNameAddrButton");
    })
    deleteAllAddrButton.addEventListener('click', async () => {
        console_log("deleteAllAddrButton");
    })
    deleteAllDomainButton.addEventListener('click', async () => {
        console_log("deleteAllDomainButton");
    })
});
