// popup.js

/**
 * Logs messages to the console with a custom prefix.
 * @param {...any} arguments - The arguments to log.
 */
function console_log() {
  console.log("[BetterUnsubscribe][popup.js]", ...arguments);
}

/**
 * Logs error messages to the console with a custom prefix.
 * @param {...any} arguments - The error arguments to log.
 */
function console_error() {
  console.error("[BetterUnsubscribe][popup.js]", ...arguments);
}

// Event listener that triggers when the DOM content is fully loaded.
document.addEventListener('DOMContentLoaded', async () => {
  const emailText = document.getElementById('emailText'); // Element to display the user's email
  const unsubscribeButton = document.getElementById('unsubscribeButton'); // Button to trigger unsubscribe action
  const cancelButton = document.getElementById('cancelButton'); // Button to cancel the action and close the popup
  const deleteButton = document.getElementById('deleteButton'); // Button to delete the email or subscription
  const statusText = document.getElementById('statusText'); // Element to display the current status of the operation
  const details = document.getElementById('detailsDropDown'); // Dropdown to show details of the unsubscribe method
  const detailsText = document.getElementById('detailsText'); // Text element to display details about the unsubscribe method
  
  // Request the user's email from the background script and display it.
  messenger.runtime.sendMessage({requestEmail: true}).then((r) => {
    emailText.textContent += "\n" + r.email;
  }).catch((error) => {
    console_error("Error receiving email from background:", error);
  });

  // Request the unsubscribe method from the background script and display relevant details.
  messenger.runtime.sendMessage({ requestMethod: true }).then((r) => {
    switch(r.method){
      case "Post":
        detailsText.innerHTML = browser.i18n.getMessage("detailsTextPost") + `<code>${r.address}</code>`;
        details.hidden = false;
        break;
      case "Email":
        detailsText.innerHTML = browser.i18n.getMessage("detailsTextEmail") + `<code>${r.address}</code>`;
        details.hidden = false;
        break;
      case "Browser":
        detailsText.innerHTML = browser.i18n.getMessage("detailsTextWeb") + `<code>${r.address}</code>`;
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
    statusText.textContent = browser.i18n.getMessage("statusTextWorking"); // Update status text to show the process is ongoing
    messenger.runtime.sendMessage({unsubscribe: true}).then((r) => {
      console_log("Response from background:", r);
      if(r.response) {
        statusText.textContent = browser.i18n.getMessage("statusTextDone"); // Update status text to show completion
        deleteButton.hidden = false; // Show the delete button if the unsubscribe was successful
      } else {
        unsubscribeButton.disabled = false; // Re-enable the unsubscribe button if there was an error
        statusText.textContent = browser.i18n.getMessage("statusTextError"); // Update status text to show an error occurred
      }
    }).catch((error) => {
      console_error("Error sending unsubscribe message:", error);
    });
  });

  // Event listener for the cancel button.
  cancelButton.addEventListener('click', async () => {
    try {
      const r = await messenger.runtime.sendMessage({cancel: true});
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
      const r = await messenger.runtime.sendMessage({delete: true});
      console_log("Response from background:", r);
    } catch (error) {
      console_error("Error sending delete message:", error);
    }
  });
});
