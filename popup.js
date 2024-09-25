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
 * @param {messenger._manifest.ThemeType} theme - The current theme object, which contains color properties for various UI elements.
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
    // Apply the current Thunderbird theme to match the extension's UI.
    await applyTheme(await messenger.theme.getCurrent());

    // Retrieve the currently active tab and get the displayed message details.
    const [tab] = await messenger.tabs.query({active: true, currentWindow: true});
    const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
    console_log("Message", message.id);

    // Retrieve DOM elements for later use.
    const emailText = document.getElementById('emailText');
    const unsubscribeButton = document.getElementById('unsubscribeButton');
    const cancelButton = document.getElementById('cancelButton');
    const deleteOneBtn = document.getElementById('delete-one-btn');
    const deleteAllBtn = document.getElementById('delete-all-btn');
    const statusText = document.getElementById('statusText');
    const detailsText = document.getElementById('detailsText');
    const detailsCode = document.getElementById("dynamicCodeBlock");

    // Retrieve the message header to display the author and set the "Delete All" button text.
    const author = message.author;

    // Create a safe line break using a document fragment or multiple elements.
    emailText.textContent = messenger.i18n.getMessage("emailText");
    emailText.appendChild(document.createElement("br"));  // Add a line break manually
    emailText.appendChild(document.createTextNode(author)); // Re-add author after the break

    // Update the "Delete All" button similarly, without using innerHTML.
    deleteAllBtn.textContent = messenger.i18n.getMessage("deleteAllButton");
    deleteAllBtn.appendChild(document.createElement("br"));  // Add a line break
    deleteAllBtn.appendChild(document.createTextNode(author));  // Append the author again


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

    let deleteOneClicked = false;
    let deleteAllClicked = false;

    /**
     * Event listener for the "Delete Just This Email" button.
     * Sends a request to delete the current email and updates the status text.
     */
    deleteOneBtn.addEventListener('click', async () => {
        if (deleteOneClicked || deleteAllClicked) return; // Prevent multiple clicks
        deleteOneClicked = true; // Set the flag to true after the first click
        try {
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleting");
            const r = await messenger.runtime.sendMessage({messageId: message.id, delete: true});
            console_log("Deleted this email response:", r);
            if (r.response === "Deleted") {
                statusText.textContent = messenger.i18n.getMessage("statusTextDeleteSuccess");
            } else {
                deleteOneClicked = false; // Reset flag if delete failed
                statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
            }
        } catch (error) {
            console_error("Error deleting just this email:", error);
            deleteOneClicked = false; // Reset flag if an error occurs
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
        }
    });

    /**
     * Event listener for the "Delete All Emails from This Sender" button.
     * Sends a request to delete all emails from the same sender and updates the status text.
     */
    deleteAllBtn.addEventListener('click', async () => {
        if (deleteAllClicked) return; // Prevent multiple clicks
        deleteAllClicked = true; // Set the flag to true after the first click
        try {
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleting");
            const r = await messenger.runtime.sendMessage({
                messageId: message.id,
                author: author,
                deleteAllFromSender: true
            });
            console_log("Deleted this email response:", r);
            if (r.response === "Deleted") {
                statusText.textContent = r.count + " " + messenger.i18n.getMessage("statusTextDeleteSuccess");
            } else {
                deleteAllClicked = false; // Reset flag if delete failed
                statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
            }
        } catch (error) {
            console_error("Error deleting all emails from this sender:", error);
            deleteAllClicked = false; // Reset flag if an error occurs
            statusText.textContent = messenger.i18n.getMessage("statusTextDeleteError");
        }
    });

});
