/**
 * Logs messages to the console with a custom prefix for better identification.
 * Used for debug and informational messages related to BetterUnsubscribe's popup.js.
 * @param {...any} args - The arguments to log to the console.
 */
function console_log(...args) {
  console.log('[BetterUnsubscribe][popup.js]', ...args);
}

/**
 * Logs error messages to the console with a custom prefix.
 * This is useful for clear and specific error reporting during development and debugging.
 * @param {...any} args - The error arguments to log to the console.
 */
function console_error(...args) {
  console.error('[BetterUnsubscribe][popup.js]', ...args);
}

async function resize_dropdown() {
  const el = document.getElementById('deleteButton');
  const dropdownList = document.getElementById('dropdownList');
  const rect = el.getBoundingClientRect();
  const available = window.innerHeight - rect.bottom;
  dropdownList.style.maxHeight = `${available}px`;
}

/**
 * Main event listener for the DOMContentLoaded event.
 * Responsible for retrieving the active tab and displayed message,
 * setting up button event listeners, and managing the unsubscribe logic.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Retrieve and cache references to various DOM elements for later use.
  const nameAddress = document.getElementById('nameAddress');
  const unsubscribeButton = document.getElementById('unsubscribeButton');
  const cancelButton = document.getElementById('cancelButton');
  const statusText = document.getElementById('statusText');
  const detailsText = document.getElementById('detailsText');
  const detailsCode = document.getElementById('dynamicCodeBlock');

  const deleteDiv = document.getElementById('deleteDiv');
  const dropdownList = document.getElementById('dropdownList');
  const deleteOneButton = document.getElementById('deleteOneButton');
  const deleteAllNameAddrButton = document.getElementById(
    'deleteAllNameAddrButton'
  );
  const deleteAllAddrButton = document.getElementById('deleteAllAddrButton');
  const deleteAllDomainButton = document.getElementById(
    'deleteAllDomainButton'
  );

  deleteDiv.addEventListener('mouseenter', resize_dropdown);
  window.addEventListener('resize', resize_dropdown);

  // Retrieve the currently active tab in the current window and get displayed message details.
  const [tab] = await messenger.tabs.query({
    active: true,
    currentWindow: true,
  });
  const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
  console_log('Message', message.id);

  // Retrieve the message's author and parse it to extract name, sender, and domain information.
  const author = message.author;
  console_log(author);

  let name = undefined;
  let sender = undefined;
  let domain = undefined;

  // Regex to match and parse email addresses with optional name prefix.
  const addressRegex = new RegExp(
    '^("?([^"]+)"?\\s+)?<?([\\w._%+-]+)@([\\w.-]+\\.[a-zA-Z]{2,})>?$'
  );
  const match = author.match(addressRegex);
  if (match) {
    name = match[2] || ''; // Optional name fallback if not present.
    sender = match[3];
    domain = match[4];
    console_log(`Name: ${name}, Sender: ${sender}, Domain: ${domain}`);
  } else {
    console_error(`Invalid email format: ${author}`);
  }

  // Display the author's email in the UI.
  nameAddress.textContent = author;

  // Update "Delete All" button text based on extracted author information.
  if (author) {
    const span = deleteAllNameAddrButton.querySelector('.scroll-x');
    span.textContent = author;
  }
  if (sender && domain) {
    const span = deleteAllAddrButton.querySelector('.scroll-x');
    span.textContent = `${sender}@${domain}`;
  }
  if (domain) {
    const span = deleteAllDomainButton.querySelector('.scroll-x');
    span.textContent = domain;
  }

  // Request the unsubscribe method details from the background script.
  messenger.runtime
    .sendMessage({ messageId: message.id, getMethod: true })
    .then((r) => {
      console_log('Received', r);

      // Update the UI based on the received unsubscribe method (Post, Email, or Browser).
      switch (r.method) {
        case 'Post':
          detailsText.textContent =
            messenger.i18n.getMessage('detailsTextPost') + ' ';
          detailsCode.textContent = r.address;
          break;
        case 'Email':
          detailsText.textContent =
            messenger.i18n.getMessage('detailsTextEmail') + ' ';
          detailsCode.textContent = r.address;
          break;
        case 'Browser':
          detailsText.textContent =
            messenger.i18n.getMessage('detailsTextWeb') + ' ';
          detailsCode.textContent = r.address;
          break;
        default:
        // No action required if no method is provided.
      }
    })
    .catch((error) => {
      console_error('Error receiving methodInfo from background:', error);
    });

  /**
   * Event listener for the "Unsubscribe" button.
   * Sends an unsubscribe request to the background script, updates UI status, and handles button state.
   */
  unsubscribeButton.addEventListener('click', async () => {
    unsubscribeButton.disabled = true;
    statusText.removeAttribute('hidden');
    statusText.textContent = messenger.i18n.getMessage('statusTextWorking');

    // Send unsubscribe request to the background script.
    messenger.runtime
      .sendMessage({ messageId: message.id, unsubscribe: true })
      .then((r) => {
        console_log('Response from background:', r);
        if (r.response === 'Unsubscribed') {
          statusText.textContent = messenger.i18n.getMessage('statusTextDone');
        } else {
          unsubscribeButton.disabled = false;
          statusText.textContent = messenger.i18n.getMessage('statusTextError');
        }
      })
      .catch((error) => {
        console_error('Error sending unsubscribe message:', error);
        statusText.textContent = messenger.i18n.getMessage('statusTextError');
      });
  });

  /**
   * Event listener for the "Cancel" button.
   * Sends a cancel request to the background script and closes the popup window upon completion.
   */
  cancelButton.addEventListener('click', async () => {
    try {
      const r = await messenger.runtime.sendMessage({
        messageId: message.id,
        cancel: true,
      });
      console_log('Response from background:', r);
      window.close();
    } catch (error) {
      console_error('Error sending cancel message:', error);
    }
  });

  // Event listeners for the "Delete" buttons, each using the getDeleteFunc utility function to handle different cases.
  deleteOneButton.addEventListener(
    'click',
    getDeleteFunc(
      message,
      statusText,
      deleteDiv,
      dropdownList,
      'deleteOneButton',
      name,
      sender,
      domain
    )
  );
  deleteAllNameAddrButton.addEventListener(
    'click',
    getDeleteFunc(
      message,
      statusText,
      deleteDiv,
      dropdownList,
      'deleteAllNameAddrButton',
      name,
      sender,
      domain
    )
  );
  deleteAllAddrButton.addEventListener(
    'click',
    getDeleteFunc(
      message,
      statusText,
      deleteDiv,
      dropdownList,
      'deleteAllAddrButton',
      name,
      sender,
      domain
    )
  );
  deleteAllDomainButton.addEventListener(
    'click',
    getDeleteFunc(
      message,
      statusText,
      deleteDiv,
      dropdownList,
      'deleteAllDomainButton',
      name,
      sender,
      domain
    )
  );
});

/**
 * Generates a function to handle deleting specific messages or message groups based on input parameters.
 * @param {Object} message - The current message object.
 * @param {HTMLElement} statusText - The status text element to update.
 * @param {HTMLElement} deleteDiv - The container for delete options.
 * @param {HTMLElement} dropdownList - The dropdown list element.
 * @param {string} type - The type of delete operation ("deleteOneButton", "deleteAllNameAddrButton", etc.).
 * @param {string} name - The name extracted from the author (if available).
 * @param {string} sender - The sender email extracted from the author (if available).
 * @param {string} domain - The domain extracted from the author (if available).
 * @returns {Function} The function to handle the specific delete operation.
 */
function getDeleteFunc(
  message,
  statusText,
  deleteDiv,
  dropdownList,
  type,
  name,
  sender,
  domain
) {
  return async () => {
    try {
      console_log('hide dropdown');
      dropdownList.style.pointerEvents = 'none';

      // Enable pointer events after a short delay for responsiveness.
      setTimeout(() => {
        dropdownList.style.pointerEvents = 'auto';
      }, 1);

      // Create a message object based on the type of delete operation.
      let message_obj = {};
      switch (type) {
        case 'deleteAllNameAddrButton':
          message_obj.name = name;
        // fall through
        case 'deleteAllAddrButton':
          message_obj.sender = sender;
        // fall through
        case 'deleteAllDomainButton':
          message_obj.domain = domain;
        // fall through
        case 'deleteOneButton':
          message_obj.delete = true;
        // fall through
        default:
          message_obj.messageId = message.id;
      }

      statusText.removeAttribute('hidden');
      statusText.textContent = messenger.i18n.getMessage('statusTextDeleting');

      // Send a delete request to the background script.
      const r = await messenger.runtime.sendMessage(message_obj);

      if (r.response === 'Deleted') {
        if (r.count) {
          statusText.textContent =
            r.count +
            ' ' +
            messenger.i18n.getMessage('statusTextDeleteSuccess');
        } else {
          statusText.textContent = messenger.i18n.getMessage(
            'statusTextDeleteSuccess'
          );
        }
        setTimeout(() => {
          window.close();
        }, 500);
      } else {
        statusText.textContent = messenger.i18n.getMessage(
          'statusTextDeleteError'
        );
      }
    } catch (error) {
      console_error('Error deleting all emails from this sender:', error);
      statusText.textContent = messenger.i18n.getMessage(
        'statusTextDeleteError'
      );
    }
  };
}
