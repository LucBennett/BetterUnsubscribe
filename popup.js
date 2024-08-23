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

// Event listener that triggers when the DOM content is fully loaded.
document.addEventListener('DOMContentLoaded', async () => {
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
    emailText.textContent += author;
  } catch (error) {
    console_error(error);
  }

  // Request the unsubscribe method from the background script and display relevant details.
  messenger.runtime.sendMessage({ messageId: messageId, requestMethod: true }).then((r) => {
    let codeElement = document.createElement('code');
    codeElement.textContent = r.address;

    switch (r.method) {
      case "Post":
        detailsText.textContent = browser.i18n.getMessage("detailsTextPost") + ' ';
        detailsText.appendChild(codeElement);
        details.hidden = false;
        break;
      case "Email":
        detailsText.textContent = browser.i18n.getMessage("detailsTextEmail") + ' ';
        detailsText.appendChild(codeElement);
        details.hidden = false;
        break;
      case "Browser":
        detailsText.textContent = browser.i18n.getMessage("detailsTextWeb") + ' ';
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
    statusText.textContent = browser.i18n.getMessage("statusTextWorking"); // Update status text to show the process is ongoing
    messenger.runtime.sendMessage({ messageId: messageId, unsubscribe: true }).then((r) => {
      console_log("Response from background:", r);
      if (r.response) {
        statusText.textContent = browser.i18n.getMessage("statusTextDone"); // Update status text to show completion
        deleteButton.hidden = false; // Show the delete button if unsubscribe was successful
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
      const r = await messenger.runtime.sendMessage({ messageId: messageId, cancel: true });
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
      const r = await messenger.runtime.sendMessage({ messageId: messageId, delete: true });
      console_log("Response from background:", r);
    } catch (error) {
      console_error("Error sending delete message:", error);
    }
  });
});
