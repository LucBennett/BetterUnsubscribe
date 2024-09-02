/**
 * Logs messages to the console with a custom prefix.
 * @param {...any} args - The arguments to log.
 */
function console_log(...args) {
    console.log("[BetterUnsubscribe][popup.js]", ...args);
}

/**
 * Logs error messages to the console with a custom prefix.
 * @param {...any} args - The error arguments to log.
 */
function console_error(...args) {
    console.error("[BetterUnsubscribe][popup.js]", ...args);
}

// Listen for theme changes
messenger.theme.onUpdated.addListener(({theme}) => {
    applyTheme(theme);
});

/**
 * Applies the current Thunderbird theme to the extension's UI.
 *
 * This function updates various CSS variables to match the color scheme
 * of the active Thunderbird theme. It dynamically adjusts the UI elements
 * based on the theme's color properties to ensure visual consistency and
 * accessibility.
 *
 * The function is called when a theme is first applied or when there are
 * updates to the theme settings.
 *
 * @param {ThemeType} theme - The current theme object provided by Thunderbird.
 */
function applyTheme(theme) {
    console_log("Apply Theme");

    // Update background color for the entire page
    if (theme && theme.colors && theme.colors.popup) {
        console_log("using theme for background color");
        document.documentElement.style.setProperty('--in-content-page-background-color', theme.colors.popup);
    } else {
        //--in-content-page-background-color: #f0f0f0;
        document.documentElement.style.setProperty('--in-content-page-background-color', '#f0f0f0');
    }

    // Update primary text color
    if (theme && theme.colors && theme.colors.popup_text) {
        console_log("using theme for primary text color");
        document.documentElement.style.setProperty('--in-content-primary-text-color', theme.colors.popup_text);
    } else {
        //--in-content-primary-text-color: #1a1a1a;
        document.documentElement.style.setProperty('--in-content-primary-text-color', '#1a1a1a');
    }
    //--in-content-button-color: white;
    document.documentElement.style.setProperty('--in-content-button-color', 'white');

    if(theme && theme.colors && theme.colors.toolbar_field_text) {
        console_log("using theme for secondary text color");
        document.documentElement.style.setProperty('--in-content-secondary-text-color', theme.colors.toolbar_field_text);
    }else{
        //--in-content-secondary-text-color: #5f6368;
        document.documentElement.style.setProperty('--in-content-secondary-text-color', '#5f6368');
    }

    // Update button colors
    if (theme && theme.colors && theme.colors.button_background_active) {
        console_log("using theme for button background color");
        document.documentElement.style.setProperty('--in-content-button-background-color', theme.colors.button_background_active);
    } else {
        //--in-content-button-background-color: #0078d7;
        document.documentElement.style.setProperty('--in-content-button-background-color', '#0078d7');
    }

    // Update code block background and text color
    if (theme && theme.colors && theme.colors.toolbar_field) {
        console_log("using theme for code background color");
        document.documentElement.style.setProperty('--in-content-code-background-color', theme.colors.toolbar_field);
    } else {
        document.documentElement.style.setProperty('--in-content-code-background-color', '#f8f9fa');
    }

    if (theme && theme.colors && theme.colors.sidebar_text) {
        console_log("using theme for code text color");
        document.documentElement.style.setProperty('--in-content-code-color', theme.colors.sidebar_text);
    } else {
        document.documentElement.style.setProperty('--in-content-code-color', '#212529');
    }

    // Update box background and border colors
    if (theme && theme.colors && theme.colors.toolbar) {
        console_log("using theme for details background color");
        document.documentElement.style.setProperty('--in-content-box-background-color', theme.colors.toolbar);
    } else {
        //--in-content-box-background-color: #ffffff;
        document.documentElement.style.setProperty('--in-content-box-background-color', '#ffffff');
    }

    if (theme && theme.colors && theme.colors.sidebar_border) {
        console_log("using theme for details border color");
        document.documentElement.style.setProperty('--in-content-box-border-color', theme.colors.sidebar_border);
    } else {
        //--in-content-box-border-color: #dcdcdc;
        document.documentElement.style.setProperty('--in-content-box-border-color', '#dcdcdc');
    }

    //--button-danger-background-color: #d9534f;
    document.documentElement.style.setProperty('--button-danger-background-color', '#d9534f');
    // Update additional button styles for different button types
    /*
    if (theme.colors && idk) {
        //document.documentElement.style.setProperty('--button-danger-background-color', )
    } else {
        document.documentElement.style.setProperty('--button-danger-background-color', '#d9534f');
    }*/

    //--button-secondary-background-color: #6c757d;
    document.documentElement.style.setProperty('--button-secondary-background-color', '#6c757d');
    /*
    if (theme.colors && idk) {
        //document.documentElement.style.setProperty('--button-secondary-background-color', );

    } else {
        document.documentElement.style.setProperty('--button-secondary-background-color', '#5bc0de');
    }*/

    //--button-success-background-color: #28a745;
    document.documentElement.style.setProperty('--button-success-background-color', '#28a745');
    /*
    if (theme.colors && idk) {
        //document.documentElement.style.setProperty('--button-success-background-color', );

    } else {
        document.documentElement.style.setProperty('--button-success-background-color', '#5cb85c');
    }*/



    //--in-content-button-hover-background-color: #005a9e;
    //--in-content-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);


    // Determine if the current theme is dark or light

    const isDarkTheme = theme && theme.colors &&
        (theme.colors.toolbar_text === 'white' || theme.colors.toolbar_text === '#ffffff');

    // Toggle class based on theme type
    if (isDarkTheme) {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
    } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    }
}


// Event listener that triggers when the DOM content is fully loaded.
document.addEventListener('DOMContentLoaded', async () => {
    applyTheme(await messenger.theme.getCurrent());

    const params = new URLSearchParams(window.location.search);
    const messageId = parseInt(params.get('messageId'));
    console_log("MessageId:", messageId);

    const emailText = document.getElementById('emailText'); // Element to display the user's email
    const unsubscribeButton = document.getElementById('unsubscribeButton'); // Button to trigger unsubscribe action
    const cancelButton = document.getElementById('cancelButton'); // Button to cancel the action and close the popup
    const deleteButton = document.getElementById('deleteButton'); // Button to delete the email or subscription
    const statusText = document.getElementById('statusText'); // Element to display the current status of the operation
    const details = document.getElementById('detailsDropDown'); // Dropdown to show details of the unsubscribe method
    const detailsText = document.getElementById('detailsText'); // Text element to display details about the unsubscribe method

    try {
        let messageHeader = await messenger.messages.get(messageId);

        // Extract the author information from the message header
        let author = messageHeader.author;
        emailText.textContent += "\t" + author;
    } catch (error) {
        console_error(error);
    }

    // Request the unsubscribe method from the background script and display relevant details.
    messenger.runtime.sendMessage({messageId: messageId, getMethod: true}).then((r) => {
        let codeElement = document.createElement('code');
        codeElement.textContent = r.address;

        switch (r.method) {
            case "Post":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextPost") + ' ';
                detailsText.appendChild(codeElement);
                details.hidden = false;
                break;
            case "Email":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextEmail") + ' ';
                detailsText.appendChild(codeElement);
                details.hidden = false;
                break;
            case "messenger":
                detailsText.textContent = messenger.i18n.getMessage("detailsTextWeb") + ' ';
                detailsText.appendChild(codeElement);
                details.hidden = false;
                break;
            default:
            // If no method is provided, do nothing.
        }
    }).catch((error) => {
        console_error("Error receiving methodInfo from background:", error);
    });

    // Event listener for the unsubscribe button.
    unsubscribeButton.addEventListener('click', async () => {
        unsubscribeButton.disabled = true; // Disable the button to prevent multiple clicks
        statusText.textContent = messenger.i18n.getMessage("statusTextWorking"); // Update status text to show the process is ongoing
        messenger.runtime.sendMessage({messageId: messageId, unsubscribe: true}).then((r) => {
            console_log("Response from background:", r);
            if (r.response === "Unsubscribed") {
                statusText.textContent = messenger.i18n.getMessage("statusTextDone"); // Update status text to show completion
                deleteButton.hidden = false; // Show the delete button if unsubscribe was successful
            } else {
                unsubscribeButton.disabled = false; // Re-enable the unsubscribe button if there was an error
                statusText.textContent = messenger.i18n.getMessage("statusTextError"); // Update status text to show an error occurred
            }
        }).catch((error) => {
            console_error("Error sending unsubscribe message:", error);
        });
    });

    // Event listener for the cancel button.
    cancelButton.addEventListener('click', async () => {
        try {
            const r = await messenger.runtime.sendMessage({messageId: messageId, cancel: true});
            console_log("Response from background:", r);
            window.close(); // Close the popup window after cancelling
        } catch (error) {
            console_error("Error sending cancel message:", error);
        }
    });

    // Event listener for the delete button.
    deleteButton.addEventListener('click', async () => {
        try {
            deleteButton.disabled = true; // Disable the delete button to prevent multiple clicks
            const r = await messenger.runtime.sendMessage({messageId: messageId, delete: true});
            console_log("Response from background:", r);
        } catch (error) {
            console_error("Error sending delete message:", error);
        }
    });
});
