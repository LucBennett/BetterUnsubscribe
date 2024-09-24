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
 * Applies the current Thunderbird theme to the extension's UI.
 *
 * This function updates various CSS variables to match the active Thunderbird theme's
 * color scheme, ensuring that the UI remains consistent with the user's selected theme.
 *
 * @param {ThemeType} theme - The current theme object, which contains color properties for various UI elements.
 */
async function applyTheme(theme) {
    console_log("Apply Theme");

    // Set background color based on the theme's popup color or default to light gray.
    if (theme && theme.colors && theme.colors.popup) {
        console_log("Using theme for background color");
        document.documentElement.style.setProperty('--in-content-page-background-color', theme.colors.popup);
    } else {
        document.documentElement.style.setProperty('--in-content-page-background-color', '#f0f0f0');
    }

    // Set primary text color based on the theme's popup text color or default to dark gray.
    if (theme && theme.colors && theme.colors.popup_text) {
        console_log("Using theme for primary text color");
        document.documentElement.style.setProperty('--in-content-primary-text-color', theme.colors.popup_text);
    } else {
        document.documentElement.style.setProperty('--in-content-primary-text-color', '#1a1a1a');
    }

    // Set button colors and other UI elements based on the theme, or use default values.
    document.documentElement.style.setProperty('--in-content-button-color', 'white');
    document.documentElement.style.setProperty('--in-content-secondary-text-color', theme?.colors?.toolbar_field_text || '#5f6368');
    document.documentElement.style.setProperty('--in-content-button-background-color', theme?.colors?.button_background_active || '#0078d7');
    document.documentElement.style.setProperty('--in-content-code-background-color', theme?.colors?.toolbar_field || '#f8f9fa');
    document.documentElement.style.setProperty('--in-content-code-color', theme?.colors?.sidebar_text || '#212529');
    document.documentElement.style.setProperty('--in-content-box-background-color', theme?.colors?.toolbar || '#ffffff');
    document.documentElement.style.setProperty('--in-content-box-border-color', theme?.colors?.sidebar_border || '#dcdcdc');
    document.documentElement.style.setProperty('--button-danger-background-color', '#d9534f');
    document.documentElement.style.setProperty('--button-secondary-background-color', '#6c757d');
    document.documentElement.style.setProperty('--button-success-background-color', '#28a745');

    // Determine if the theme is dark or light based on the toolbar text color.
    const isDarkTheme = theme?.colors?.toolbar_text === 'white' || theme?.colors?.toolbar_text === '#ffffff';

    // Toggle class based on whether the theme is dark or light.
    document.body.classList.toggle('dark-theme', isDarkTheme);
    document.body.classList.toggle('light-theme', !isDarkTheme);
}

/**
 * Event listener that triggers when the DOM content is fully loaded.
 * Retrieves message details, sets up button event listeners, and handles unsubscribe logic.
 */
document.addEventListener('DOMContentLoaded', async () => {
    await applyTheme(await messenger.theme.getCurrent());

    const params = new URLSearchParams(window.location.search);
    const messageId = parseInt(params.get('messageId'));
    console_log("MessageId:", messageId);

    // Retrieve DOM elements for later use.
    const emailText = document.getElementById('emailText');
    const unsubscribeButton = document.getElementById('unsubscribeButton');
    const cancelButton = document.getElementById('cancelButton');
    //const deleteButton = document.getElementById('deleteButton');
    const deleteOneBtn = document.getElementById('delete-one-btn');
    const deleteAllBtn = document.getElementById('delete-all-btn');
    const statusText = document.getElementById('statusText');
    //const details = document.getElementById('detailsDropDown');
    const detailsText = document.getElementById('detailsText');

// Retrieve the message header to display the author and set the delete all text.
    try {
        let messageHeader = await messenger.messages.get(messageId);
        let author = messageHeader.author;

        // Create a safe line break using a document fragment or multiple elements.
        emailText.textContent = messenger.i18n.getMessage("emailText");// + " " + author;
        emailText.appendChild(document.createElement("br"));  // Add a line break manually
        emailText.appendChild(document.createTextNode(author)); // Re-add author after the break

        // Update the "Delete All" button similarly, without using innerHTML.
        deleteAllBtn.textContent = messenger.i18n.getMessage("deleteAllButton");// + " " + author;
        deleteAllBtn.appendChild(document.createElement("br"));  // Add a line break
        deleteAllBtn.appendChild(document.createTextNode(author));  // Append the author again

    } catch (error) {
        console_error(error);
    }


    // Request the unsubscribe method from the background script.
    messenger.runtime.sendMessage({messageId: messageId, getMethod: true}).then((r) => {
        console_log("Received", r);
        let codeElement = document.createElement('code');
        codeElement.textContent = r.address;

        switch (r.method) {
            case "Post":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextPost") + ' ';
                detailsText.appendChild(codeElement);
                //details.hidden = false;
                break;
            case "Email":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextEmail") + ' ';
                detailsText.appendChild(codeElement);
                //details.hidden = false;
                break;
            case "Browser":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextWeb") + ' ';
                detailsText.appendChild(codeElement);
                //details.hidden = false;
                break;
            default:
            // No action if no method is provided.
        }
    }).catch((error) => {
        console_error("Error receiving methodInfo from background:", error);
    });

    // Event listener for the unsubscribe button.
    unsubscribeButton.addEventListener('click', async () => {
        unsubscribeButton.disabled = true;
        statusText.textContent = messenger.i18n.getMessage("statusTextWorking");

        // Send unsubscribe request to the background script.
        messenger.runtime.sendMessage({messageId: messageId, unsubscribe: true}).then((r) => {
            console_log("Response from background:", r);
            if (r.response === "Unsubscribed") {
                statusText.textContent = messenger.i18n.getMessage("statusTextDone");
                //deleteButton.hidden = false;
            } else {
                unsubscribeButton.disabled = false;
                statusText.textContent = messenger.i18n.getMessage("statusTextError");
            }
        }).catch((error) => {
            console_error("Error sending unsubscribe message:", error);
            statusText.textContent = messenger.i18n.getMessage("statusTextError");
        });
    });

    // Event listener for the cancel button.
    cancelButton.addEventListener('click', async () => {
        try {
            const r = await messenger.runtime.sendMessage({messageId: messageId, cancel: true});
            console_log("Response from background:", r);
            window.close();
        } catch (error) {
            console_error("Error sending cancel message:", error);
        }
    });

    // Event listener for the "Delete Just This Email" button.
    deleteOneBtn.addEventListener('click', async () => {
        try {
            deleteOneBtn.disabled = true;
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleting");
            const r = await messenger.runtime.sendMessage({messageId: messageId, delete: true});
            console_log("Deleted this email response:", r);
            if (r.response === "Deleted") {
                statusText.textContent = messenger.i18n.getMessage("statusTextDeleteSuccess");
            } else {
                deleteOneBtn.disabled = false;
                statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
            }

        } catch (error) {
            console_error("Error deleting just this email:", error);
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
        }
    });

    // Event listener for the "Delete All Emails from This Sender" button.
    deleteAllBtn.addEventListener('click', async () => {
        try {
            deleteAllBtn.disabled = true;
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleting");
            const r = await messenger.runtime.sendMessage({messageId: messageId, deleteAllFromSender: true});
            console_log("Deleted this email response:", r);
            if (r.response === "Deleted") {
                statusText.textContent = messenger.i18n.getMessage("statusTextDeleteSuccess");
            } else {
                deleteOneBtn.disabled = false;
                statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
            }
        } catch (error) {
            console_error("Error deleting all emails from this sender:", error);
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
        }
    });
});
