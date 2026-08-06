/**
 * Logic for the extension's toolbar/context-menu popup: resolves the
 * message to act on, requests its unsubscribe method details from
 * background.js, and wires up the unsubscribe/cancel/delete buttons.
 */

/* global createLogger, resolveCurrentMessage --
   provided by common.js, loaded earlier in popup.html */

const { log: popupLog, error: popupError } = createLogger('popup.js');

/**
 * Default settings for BetterUnsubscribe
 */
const DEFAULT_SETTINGS = {
  autoSendEmail: false, // Don't automatically send emails by default
  confirmRules: [], // No confirmation rules by default
};

/**
 * Resizes the delete-options dropdown so it fits within the visible
 * viewport below the delete button, instead of overflowing the popup.
 */
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
  const questionHeading = document.getElementById('unsubscribeQuestionHeading');
  const nameAddress = document.getElementById('nameAddress');
  const unsubscribeButton = document.getElementById('unsubscribeButton');
  const cancelButton = document.getElementById('cancelButton');
  const statusText = document.getElementById('statusText');
  const detailsText = document.getElementById('detailsText');
  const detailsCode = document.getElementById('dynamicCodeBlock');
  const detailsCodeContainer = document.getElementById('dynamicCodeContainer');

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

  const settings = await messenger.storage.local.get(DEFAULT_SETTINGS);
  popupLog('Loaded settings:', settings);

  // Resolve the message to act on. When opened via a `messageId` URL param
  // (context-menu triggered, standalone window - see background.js) look
  // that message up directly, since a fresh window has no mail tab to
  // inspect. Otherwise resolve via the active tab (toolbar action popup),
  // falling back from the natively displayed message to the mail tab's
  // selection.
  const messageIdParam = new URLSearchParams(window.location.search).get(
    'messageId'
  );

  let message = null;
  if (messageIdParam) {
    try {
      message = await messenger.messages.get(parseInt(messageIdParam, 10));
    } catch (e) {
      popupError('Error fetching message for messageId param', e);
    }
  } else {
    const [tab] = await messenger.tabs.query({
      active: true,
      currentWindow: true,
    });
    message = await resolveCurrentMessage(tab);
  }

  if (!message) {
    // No message is displayed or selected (e.g. the message_display_action
    // toolbar button was clicked from a window where the reading pane's
    // native display is unavailable). Show a friendly state instead of
    // wiring up handlers that assume a message exists.
    popupLog('No message resolved for this popup');
    questionHeading.hidden = true;
    nameAddress.textContent = messenger.i18n.getMessage('noMessageSelected');
    unsubscribeButton.hidden = true;
    cancelButton.hidden = true;
    deleteDiv.hidden = true;
    return;
  }

  popupLog('Message', message.id);

  // Retrieve the message's author and parse it to extract name, sender, and domain information.
  const author = message.author;
  popupLog(author);

  let name = undefined;
  let sender = undefined;
  let domain = undefined;

  // Populated once the getMethod response arrives; used for confirmation rule matching.
  let unsubAddress = null;

  // Use parseMailboxString (available since TB 137) to parse the author field.
  // https://webextension-api.thunderbird.net/en/latest/messengerUtilities.html
  if (messenger.messengerUtilities?.parseMailboxString) {
    try {
      const parsed =
        await messenger.messengerUtilities.parseMailboxString(author);
      if (parsed?.length > 0) {
        const { name: parsedName, email } = parsed[0];
        name = parsedName || '';
        if (email) {
          const atIndex = email.lastIndexOf('@');
          if (atIndex !== -1) {
            sender = email.substring(0, atIndex);
            domain = email.substring(atIndex + 1);
          }
        }
        popupLog(`Name: ${name}, Sender: ${sender}, Domain: ${domain}`);
      }
    } catch (e) {
      popupError('parseMailboxString failed, falling back to regex', e);
    }
  }

  // Fallback: regex parsing for compatibility with TB < 137.
  if (sender === undefined) {
    const addressRegex = new RegExp(
      '^("?([^"\\n]*)"?[\\t ]+)?<?("[^"\\n]*"|[^@\\s]+)@(\\S+\\.[a-zA-Z]{2,})>?$'
    );
    const match = author.match(addressRegex);
    if (match) {
      name = match[2] || ''; // Optional name fallback if not present.
      sender = match[3];
      domain = match[4];
      popupLog(`Name: ${name}, Sender: ${sender}, Domain: ${domain}`);
    } else {
      popupError(`Invalid email format: ${author}`);
    }
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
      popupLog('Received', r);
      unsubAddress = r.address || null;

      // Update the UI based on the received unsubscribe method (Post, Email, or Browser).
      switch (r.method) {
        case 'Post':
          detailsText.textContent =
            messenger.i18n.getMessage('detailsTextPost');
          detailsCode.textContent = r.address;
          detailsCodeContainer.hidden = false;
          break;
        case 'Email':
          detailsText.textContent =
            messenger.i18n.getMessage('detailsTextEmail');
          detailsCode.textContent = r.address;
          detailsCodeContainer.hidden = false;
          break;
        case 'Browser':
          detailsText.textContent = messenger.i18n.getMessage('detailsTextWeb');
          detailsCode.textContent = r.address;
          detailsCodeContainer.hidden = false;
          break;
        case 'None':
          detailsText.textContent =
            messenger.i18n.getMessage('detailsTextNone');
          break;
        default:
        // No action required if no method is provided.
      }
    })
    .catch((error) => {
      popupError('Error receiving methodInfo from background:', error);
    });

  /**
   * Sends the unsubscribe request to the background script and updates UI status.
   */
  async function doUnsubscribe() {
    unsubscribeButton.disabled = true;
    statusText.removeAttribute('hidden');
    statusText.textContent = messenger.i18n.getMessage('statusTextWorking');

    messenger.runtime
      .sendMessage({ messageId: message.id, unsubscribe: true })
      .then((r) => {
        popupLog('Response from background:', r);
        if (r.response === 'Unsubscribed') {
          statusText.textContent = messenger.i18n.getMessage('statusTextDone');
        } else if (r.response === 'Failed') {
          unsubscribeButton.disabled = false;
          statusText.textContent =
            messenger.i18n.getMessage('statusTextError') +
            (r.error ? ': ' + r.error : '');
          statusText.title = r.error; // Full error on hover
        }
      })
      .catch((error) => {
        popupError('Error sending unsubscribe message:', error);
        statusText.textContent = messenger.i18n.getMessage('statusTextError');
      });
  }

  /**
   * Event listener for the "Unsubscribe" button.
   * Checks confirmation rules first; if a rule matches, shows the confirmation
   * section instead of unsubscribing immediately.
   */
  unsubscribeButton.addEventListener('click', async () => {
    const rules = Array.isArray(settings.confirmRules)
      ? settings.confirmRules
      : [];
    const matchedRule = findMatchingRule(rules, author, unsubAddress);

    if (matchedRule) {
      document.getElementById('confirmWarning').textContent =
        matchedRule.description ||
        messenger.i18n.getMessage('confirmUnsubscribeWarning');
      document.getElementById('confirmAuthor').textContent = author;
      document.getElementById('confirmTarget').textContent = unsubAddress;
      document.getElementById('unsubSection').hidden = true;
      document.getElementById('confirmSection').hidden = false;
      return;
    }

    await doUnsubscribe();
  });

  /**
   * Event listener for the "Yes, Unsubscribe" button in the confirmation section.
   */
  document
    .getElementById('confirmYesButton')
    .addEventListener('click', async () => {
      document.getElementById('confirmSection').hidden = true;
      document.getElementById('unsubSection').hidden = false;
      await doUnsubscribe();
    });

  /**
   * Event listener for the "Cancel" button in the confirmation section.
   * Returns to the main unsubscribe view without taking action.
   */
  document.getElementById('confirmNoButton').addEventListener('click', () => {
    document.getElementById('confirmSection').hidden = true;
    document.getElementById('unsubSection').hidden = false;
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
      popupLog('Response from background:', r);
      window.close();
    } catch (error) {
      popupError('Error sending cancel message:', error);
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
 * Finds the first confirmation rule whose regex matches the sender or unsubscribe address.
 * @param {{regex: string, description: string}[]} rules
 * @param {string} author - Sender string from the message header.
 * @param {string|null} address - Unsubscribe URL or email address, if known.
 * @returns {{regex: string, description: string}|null}
 */
function findMatchingRule(rules, author, address) {
  for (const rule of rules) {
    if (!rule.regex) continue;
    try {
      const re = new RegExp(rule.regex, 'i');
      if ((author && re.test(author)) || (address && re.test(address))) {
        return rule;
      }
    } catch (e) {
      // Skip rules with invalid regex
    }
  }
  return null;
}

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
      popupLog('hide dropdown');
      // Force close the dropdown
      deleteDiv.classList.add('dropdown-closing');

      setTimeout(() => {
        deleteDiv.classList.remove('dropdown-closing');
      }, 100);

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
        }, 1000);
      } else {
        statusText.textContent = messenger.i18n.getMessage(
          'statusTextDeleteError'
        );
      }
    } catch (error) {
      popupError('Error deleting all emails from this sender:', error);
      statusText.textContent = messenger.i18n.getMessage(
        'statusTextDeleteError'
      );
    }
  };
}
