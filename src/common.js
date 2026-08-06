/**
 * Shared helpers used across the extension's background, popup, and options
 * scripts: a namespaced console logger and message-resolution logic for
 * finding "the message the user currently has open".
 */

/**
 * Creates a pair of console logging functions namespaced with a
 * module-specific prefix, so log output can be traced back to the file
 * that produced it.
 *
 * @param {string} moduleName - Name shown in the log prefix, e.g. 'background.js'.
 * @returns {{log: (...args: any[]) => void, error: (...args: any[]) => void}}
 */
function createLogger(moduleName) {
  const prefix = `[BetterUnsubscribe][${moduleName}]`;
  return {
    log: (...args) => console.log(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

const { log: console_log, error: console_error } = createLogger('common.js');

/**
 * Resolves the message a popup or context-menu action should act on.
 *
 * Tries, in order:
 * 1. A message explicitly selected when a context-menu click happened
 *    (`info.selectedMessages`) - only ever present for menu-click callers.
 * 2. The message natively displayed in the tab.
 * 3. The mail tab's current selection, if exactly one message is selected.
 *
 * @param {messenger.tabs.Tab} tab - The tab to resolve the message against.
 * @param {messenger.menus.OnClickData} [info] - Context-menu click details, if applicable.
 * @returns {Promise<messenger.messages.MessageHeader|null>}
 */
async function resolveCurrentMessage(tab, info) {
  if (info?.selectedMessages?.messages?.length === 1) {
    return info.selectedMessages.messages[0];
  }

  try {
    const displayed = await messenger.messageDisplay.getDisplayedMessage(
      tab.id
    );
    if (displayed) {
      return displayed;
    }
  } catch (e) {
    console_log('No displayed message for tab, falling back to selection', e);
  }

  try {
    const { messages } = await messenger.mailTabs.getSelectedMessages(tab.id);
    if (messages.length === 1) {
      return messages[0];
    }
  } catch (e) {
    console_error('Error retrieving selected messages', e);
  }

  return null;
}

// Export module functions for testing if in a Node.js environment. In the
// browser this file is loaded as a classic script and its declarations are
// shared globally with the other extension scripts listed in manifest.json.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { createLogger, resolveCurrentMessage };
}
