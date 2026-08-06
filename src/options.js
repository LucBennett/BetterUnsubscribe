/* global createLogger --
   provided by common.js, loaded earlier in options.html */

const { log: console_log, error: console_error } = createLogger('options.js');

/**
 * Default settings for BetterUnsubscribe
 */
const DEFAULT_SETTINGS = {
  autoSendEmail: false, // Don't automatically send emails by default
  confirmRules: [], // No confirmation rules by default
};

/**
 * Validates a regular expression pattern
 * @param {string} pattern - The regex pattern to validate
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateRegex(pattern) {
  // Empty pattern is valid (means no confirmation)
  if (!pattern || pattern.trim() === '') {
    return { valid: true };
  }

  try {
    new RegExp(pattern, 'i');
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Renders the rules list from an array of {regex, description} objects.
 * @param {{regex: string, description: string}[]} rules
 */
function renderRules(rules) {
  const list = document.getElementById('rulesList');
  list.innerHTML = '';
  rules.forEach((rule) => {
    list.appendChild(createRuleRow(rule.regex, rule.description));
  });
  updateEmptyState();
}

/**
 * Creates a single rule row DOM element.
 * @param {string} [regex=''] - The regex pattern value.
 * @param {string} [description=''] - The warning message value.
 * @returns {HTMLDivElement}
 */
function createRuleRow(regex = '', description = '') {
  const row = document.createElement('div');
  row.className = 'rule-row';

  const regexInput = document.createElement('input');
  regexInput.type = 'text';
  regexInput.className = 'rule-regex';
  regexInput.placeholder = 'e.g. groups\\.google\\.com';
  regexInput.value = regex;
  regexInput.addEventListener('input', () => {
    const v = validateRegex(regexInput.value.trim());
    const invalid = !v.valid && regexInput.value.trim() !== '';
    regexInput.style.borderColor = invalid ? 'red' : '';
    regexInput.title = invalid ? `Invalid regex: ${v.error}` : '';
  });

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.className = 'rule-description';
  descInput.placeholder = 'Warning shown in confirmation dialog (optional)';
  descInput.value = description;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'button-remove';
  removeBtn.textContent = '❌';
  removeBtn.setAttribute('aria-label', 'Remove rule');
  removeBtn.addEventListener('click', () => {
    row.remove();
    updateEmptyState();
  });

  row.appendChild(regexInput);
  row.appendChild(descInput);
  row.appendChild(removeBtn);
  return row;
}

/**
 * Shows or hides the empty state message and column headers based on whether any rules exist.
 */
function updateEmptyState() {
  const hasRules = document.querySelectorAll('.rule-row').length > 0;
  document.getElementById('rulesEmpty').hidden = hasRules;
  document.getElementById('rulesHeader').hidden = !hasRules;
}

/**
 * Collects the current rules from the DOM.
 * @returns {{regex: string, description: string}[]}
 */
function collectRules() {
  return Array.from(document.querySelectorAll('.rule-row'))
    .map((row) => ({
      regex: row.querySelector('.rule-regex').value.trim(),
      description: row.querySelector('.rule-description').value.trim(),
    }))
    .filter((r) => r.regex !== '');
}

/**
 * Loads settings from storage and updates the UI
 */
async function loadSettings() {
  try {
    const settings = await messenger.storage.local.get(DEFAULT_SETTINGS);
    console_log('Loaded settings:', settings);

    document.getElementById('autoSendEmail').checked = settings.autoSendEmail;

    if (
      Array.isArray(settings.confirmRules) &&
      settings.confirmRules.length > 0
    ) {
      renderRules(settings.confirmRules);
    } else {
      renderRules([]);
    }
  } catch (error) {
    console_error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

/**
 * Saves settings to storage
 */
async function saveSettings() {
  const autoSendEmail = document.getElementById('autoSendEmail').checked;
  const confirmRules = collectRules();

  for (const rule of confirmRules) {
    const validation = validateRegex(rule.regex);
    if (!validation.valid) {
      showStatus(
        `Invalid regular expression "${rule.regex}": ${validation.error}`,
        'error',
        5000
      );
      return;
    }
  }

  const settings = { autoSendEmail, confirmRules };

  try {
    await messenger.storage.local.set(settings);
    console_log('Settings saved:', settings);
    showStatus(
      messenger.i18n.getMessage('settingsSaved') ||
        'Settings saved successfully!',
      'success',
      3000
    );
  } catch (error) {
    console_error('Error saving settings:', error);
    showStatus('Error saving settings', 'error', 5000);
  }
}

/**
 * Resets settings to defaults
 */
async function resetSettings() {
  try {
    await messenger.storage.local.set(DEFAULT_SETTINGS);
    console_log('Settings reset to defaults');

    document.getElementById('autoSendEmail').checked =
      DEFAULT_SETTINGS.autoSendEmail;
    renderRules(DEFAULT_SETTINGS.confirmRules);

    showStatus(
      messenger.i18n.getMessage('settingsReset') ||
        'Settings reset to defaults',
      'success',
      3000
    );
  } catch (error) {
    console_error('Error resetting settings:', error);
    showStatus('Error resetting settings', 'error', 5000);
  }
}

/**
 * Shows a status message
 * @param {string} message - The message to display
 * @param {string} type - The type of message ('success' or 'error')
 * @param {number} duration - How long to show the message (ms), 0 = indefinite
 */
function showStatus(message, type = 'success', duration = 3000) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';

  if (duration > 0) {
    setTimeout(() => {
      status.style.display = 'none';
    }, duration);
  }
}

/**
 * Initialize the options page
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  document.getElementById('save').addEventListener('click', saveSettings);
  document.getElementById('reset').addEventListener('click', resetSettings);
  document.getElementById('addRule').addEventListener('click', () => {
    document.getElementById('rulesList').appendChild(createRuleRow());
    updateEmptyState();
  });
});
