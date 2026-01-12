/**
 * Thunderbird WebExtension API Mock
 *
 * This module provides a comprehensive mock implementation of the Thunderbird messenger API
 * for use in Jest unit tests. It simulates the behavior of the Thunderbird WebExtension APIs
 * without requiring an actual Thunderbird environment.
 *
 * Key Features:
 * - All core messenger APIs (messages, tabs, compose, identities, accounts)
 * - Event listener simulation with trigger mechanisms
 * - Pre-configured test data for common scenarios
 * - Chainable mock functions for easy test setup
 * - Helper methods for common test operations
 *
 * Usage:
 *   const messenger = require('./__mocks__/messenger.js');
 *   global.messenger = messenger;
 *
 *   // In tests:
 *   messenger.messages.getFull.mockResolvedValue({ headers: {...} });
 *   messenger.resetMocks(); // Reset all mocks between tests
 *
 * @see https://webextension-api.thunderbird.net/en/latest/
 */

/**
 * Default test identities
 * Used across multiple API mocks for consistency
 */
const DEFAULT_IDENTITIES = [
  {
    id: 'identity1',
    email: 'user1@example.com',
    name: 'Test User 1',
    label: 'Personal Account',
    accountId: 'account1',
  },
  {
    id: 'identity2',
    email: 'user2@example.com',
    name: 'Test User 2',
    label: 'Work Account',
    accountId: 'account2',
  },
];

/**
 * Default test accounts
 * Linked to default identities for realistic account structure
 */
const DEFAULT_ACCOUNTS = [
  {
    id: 'account1',
    name: 'Personal Email',
    type: 'imap',
    identities: [DEFAULT_IDENTITIES[0]],
  },
  {
    id: 'account2',
    name: 'Work Email',
    type: 'imap',
    identities: [DEFAULT_IDENTITIES[1]],
  },
];

/**
 * Thunderbird Messenger API Mock
 *
 * Structure mirrors the actual Thunderbird WebExtension API for drop-in replacement
 * in test environments. Each API namespace contains relevant methods and event listeners.
 */
const messenger = {
  /**
   * Messages API
   * Handles email message retrieval, manipulation, and querying
   * @see https://webextension-api.thunderbird.net/en/latest/messages.html
   */
  messages: {
    /**
     * Get the full content of a message including headers and body
     * @returns {Promise<Object>} Full message object with headers, body, and parts
     */
    getFull: jest.fn(),

    /**
     * Get basic message metadata (header info only)
     * @returns {Promise<Object>} Message header object
     */
    get: jest.fn(),

    /**
     * Delete one or more messages
     * @returns {Promise<void>}
     */
    delete: jest.fn(),

    /**
     * Query messages based on filter criteria
     * @returns {Promise<Array>} Array of message objects matching query
     */
    query: jest.fn(),

    /**
     * List messages in a folder
     * @returns {Promise<Object>} MessageList object with messages array
     */
    list: jest.fn(),

    /**
     * Update message properties (tags, read status, etc.)
     * @returns {Promise<void>}
     */
    update: jest.fn(),

    /**
     * Move messages to a different folder
     * @returns {Promise<void>}
     */
    move: jest.fn(),

    /**
     * Copy messages to a different folder
     * @returns {Promise<void>}
     */
    copy: jest.fn(),
  },

  /**
   * Tabs API
   * Manages Thunderbird tabs and tab activation events
   * @see https://webextension-api.thunderbird.net/en/latest/tabs.html
   */
  tabs: {
    /**
     * Event fired when tab becomes active
     * Includes custom triggerListener for simulating events in tests
     */
    onActivated: {
      /**
       * Register a listener for tab activation events
       * @param {Function} callback - Function to call when tab is activated
       */
      addListener: jest.fn((callback) => {
        messenger.tabs.onActivated.triggerListener = callback;
      }),

      /**
       * Remove a previously registered listener
       * @param {Function} callback - Function to remove
       */
      removeListener: jest.fn(),

      /**
       * Test helper: Trigger the activation event manually
       * Usage: messenger.tabs.onActivated.triggerListener({ tabId: 1, ... })
       */
      triggerListener: null,
    },

    /**
     * Get information about a specific tab
     * @returns {Promise<Object>} Tab object with id, type, and other properties
     */
    get: jest.fn(),

    /**
     * Query for tabs matching given criteria
     * @returns {Promise<Array>} Array of tab objects
     */
    query: jest.fn(),

    /**
     * Update properties of a tab
     * @returns {Promise<Object>} Updated tab object
     */
    update: jest.fn(),

    /**
     * Create a new tab
     * @returns {Promise<Object>} Created tab object
     */
    create: jest.fn(),
  },

  /**
   * Message Display API
   * Handles events and operations related to displaying messages
   * @see https://webextension-api.thunderbird.net/en/latest/messageDisplay.html
   */
  messageDisplay: {
    /**
     * Event fired when a message is displayed in a tab or window
     * Includes custom triggerListener for simulating events in tests
     */
    onMessageDisplayed: {
      /**
       * Register a listener for message display events
       * @param {Function} callback - Function to call when message is displayed
       */
      addListener: jest.fn((callback) => {
        messenger.messageDisplay.onMessageDisplayed.triggerListener = callback;
      }),

      /**
       * Remove a previously registered listener
       * @param {Function} callback - Function to remove
       */
      removeListener: jest.fn(),

      /**
       * Test helper: Trigger the message displayed event manually
       * Usage: messenger.messageDisplay.onMessageDisplayed.triggerListener(tab, message)
       */
      triggerListener: null,
    },

    /**
     * Get the currently displayed message in a given tab
     * @returns {Promise<Object|null>} Message object or null if no message displayed
     */
    getDisplayedMessage: jest.fn(),

    /**
     * Get the currently displayed messages in all tabs
     * @returns {Promise<Array>} Array of displayed message objects
     */
    getDisplayedMessages: jest.fn(),
  },

  /**
   * Message Display Action API
   * Controls the visibility and state of message display actions (toolbar buttons)
   * @see https://webextension-api.thunderbird.net/en/latest/messageDisplayAction.html
   */
  messageDisplayAction: {
    /**
     * Enable the message display action for a specific tab
     * @returns {Promise<void>}
     */
    enable: jest.fn(() => Promise.resolve()),

    /**
     * Disable the message display action for a specific tab
     * @returns {Promise<void>}
     */
    disable: jest.fn(() => Promise.resolve()),

    /**
     * Set the title (tooltip) of the action button
     * @returns {Promise<void>}
     */
    setTitle: jest.fn(() => Promise.resolve()),

    /**
     * Set the icon of the action button
     * @returns {Promise<void>}
     */
    setIcon: jest.fn(() => Promise.resolve()),

    /**
     * Set the badge text (small overlay text) on the action button
     * @returns {Promise<void>}
     */
    setBadgeText: jest.fn(() => Promise.resolve()),

    /**
     * Set the badge background color
     * @returns {Promise<void>}
     */
    setBadgeBackgroundColor: jest.fn(() => Promise.resolve()),
  },

  /**
   * Runtime API
   * Handles extension messaging and lifecycle events
   * @see https://webextension-api.thunderbird.net/en/latest/runtime.html
   */
  runtime: {
    /**
     * Event fired when a message is sent from another part of the extension
     * Includes custom triggerListener for simulating events in tests
     */
    onMessage: {
      /**
       * Register a listener for runtime messages
       * @param {Function} callback - Function to call when message is received
       */
      addListener: jest.fn((callback) => {
        messenger.runtime.onMessage.triggerListener = callback;
      }),

      /**
       * Remove a previously registered listener
       * @param {Function} callback - Function to remove
       */
      removeListener: jest.fn(),

      /**
       * Test helper: Trigger a runtime message manually
       * Usage: messenger.runtime.onMessage.triggerListener(message, sender, sendResponse)
       */
      triggerListener: null,
    },

    /**
     * Send a message to other parts of the extension
     * @returns {Promise<any>} Response from the message handler
     */
    sendMessage: jest.fn(),

    /**
     * Get the URL of a resource packaged with the extension
     * @returns {string} Full URL to the resource
     */
    getURL: jest.fn((path) => `moz-extension://test-extension/${path}`),

    /**
     * Get information about the extension
     * @returns {Object} Manifest object
     */
    getManifest: jest.fn(() => ({
      name: 'Test Extension',
      version: '1.0.0',
    })),
  },

  /**
   * Compose API
   * Handles email composition windows and operations
   * @see https://webextension-api.thunderbird.net/en/latest/compose.html
   */
  compose: {
    /**
     * Open a new compose window
     * @returns {Promise<Object>} Created compose tab
     */
    beginNew: jest.fn(),

    /**
     * Open a compose window for replying to a message
     * @returns {Promise<Object>} Created compose tab
     */
    beginReply: jest.fn(),

    /**
     * Open a compose window for forwarding a message
     * @returns {Promise<Object>} Created compose tab
     */
    beginForward: jest.fn(),

    /**
     * Get the current state of a compose window
     * @returns {Promise<Object>} Compose details object
     */
    getComposeDetails: jest.fn(),

    /**
     * Set compose window details (recipients, subject, body, etc.)
     * @returns {Promise<void>}
     */
    setComposeDetails: jest.fn(),
  },

  /**
   * Identities API
   * Manages email account identities (from addresses)
   * @see https://webextension-api.thunderbird.net/en/latest/identities.html
   */
  identities: {
    /**
     * List all identities across all accounts
     * @returns {Promise<Array>} Array of identity objects
     */
    list: jest.fn(() => Promise.resolve([...DEFAULT_IDENTITIES])),

    /**
     * Get a specific identity by ID
     * @returns {Promise<Object>} Identity object
     */
    get: jest.fn((identityId) =>
      Promise.resolve(
        DEFAULT_IDENTITIES.find((id) => id.id === identityId) || null
      )
    ),

    /**
     * Get the default identity for an account
     * @returns {Promise<Object>} Identity object
     */
    getDefault: jest.fn((accountId) =>
      Promise.resolve(
        DEFAULT_IDENTITIES.find((id) => id.accountId === accountId) ||
          DEFAULT_IDENTITIES[0]
      )
    ),
  },

  /**
   * Accounts API
   * Manages email accounts
   * @see https://webextension-api.thunderbird.net/en/latest/accounts.html
   */
  accounts: {
    /**
     * List all configured accounts
     * @returns {Promise<Array>} Array of account objects with identities
     */
    list: jest.fn(() => Promise.resolve([...DEFAULT_ACCOUNTS])),

    /**
     * Get a specific account by ID
     * @returns {Promise<Object>} Account object
     */
    get: jest.fn((accountId) =>
      Promise.resolve(
        DEFAULT_ACCOUNTS.find((acc) => acc.id === accountId) || null
      )
    ),

    /**
     * Get the default account
     * @returns {Promise<Object>} Default account object
     */
    getDefault: jest.fn(() => Promise.resolve(DEFAULT_ACCOUNTS[0])),
  },

  /**
   * Folders API
   * Manages mail folders and folder operations
   * @see https://webextension-api.thunderbird.net/en/latest/folders.html
   */
  folders: {
    /**
     * Get a specific folder by account and path
     * @returns {Promise<Object>} Folder object
     */
    get: jest.fn(),

    /**
     * Query folders matching criteria
     * @returns {Promise<Array>} Array of folder objects
     */
    query: jest.fn(),

    /**
     * Create a new folder
     * @returns {Promise<Object>} Created folder object
     */
    create: jest.fn(),

    /**
     * Rename a folder
     * @returns {Promise<void>}
     */
    rename: jest.fn(),

    /**
     * Delete a folder
     * @returns {Promise<void>}
     */
    delete: jest.fn(),
  },

  /**
   * Windows API
   * Manages Thunderbird windows
   * @see https://webextension-api.thunderbird.net/en/latest/windows.html
   */
  windows: {
    /**
     * Get information about a window
     * @returns {Promise<Object>} Window object
     */
    get: jest.fn(),

    /**
     * Get the current (focused) window
     * @returns {Promise<Object>} Window object
     */
    getCurrent: jest.fn(),

    /**
     * Create a new window
     * @returns {Promise<Object>} Created window object
     */
    create: jest.fn(),

    /**
     * Update window properties
     * @returns {Promise<Object>} Updated window object
     */
    update: jest.fn(),
  },
};

/**
 * Test Helper Methods
 * Utilities to make testing easier and more consistent
 */

/**
 * Reset all mock functions to their initial state
 * Call this in beforeEach to ensure test isolation
 *
 * @example
 * beforeEach(() => {
 *   messenger.resetMocks();
 * });
 */
messenger.resetMocks = function () {
  Object.values(this).forEach((api) => {
    if (typeof api === 'object' && api !== null) {
      Object.values(api).forEach((method) => {
        if (jest.isMockFunction(method)) {
          method.mockClear();
        }
        // Handle nested objects (like onActivated.addListener)
        if (typeof method === 'object' && method !== null) {
          Object.values(method).forEach((nestedMethod) => {
            if (jest.isMockFunction(nestedMethod)) {
              nestedMethod.mockClear();
            }
          });
        }
      });
    }
  });

  // Reset event listener triggers
  if (this.tabs.onActivated) {
    this.tabs.onActivated.triggerListener = null;
  }
  if (this.messageDisplay.onMessageDisplayed) {
    this.messageDisplay.onMessageDisplayed.triggerListener = null;
  }
  if (this.runtime.onMessage) {
    this.runtime.onMessage.triggerListener = null;
  }
};

/**
 * Create a mock message object with realistic defaults
 *
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock message object
 *
 * @example
 * const message = messenger.createMockMessage({
 *   id: 123,
 *   subject: 'Test Email',
 * });
 */
messenger.createMockMessage = function (overrides = {}) {
  return {
    id: 1,
    date: new Date(),
    author: 'sender@example.com',
    subject: 'Test Subject',
    read: false,
    flagged: false,
    folder: { accountId: 'account1', path: '/INBOX' },
    recipients: ['user1@example.com'],
    ccList: [],
    bccList: [],
    ...overrides,
  };
};

/**
 * Create a mock full message object (with headers and body)
 *
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock full message object
 *
 * @example
 * const fullMessage = messenger.createMockFullMessage({
 *   headers: { 'list-unsubscribe': ['<https://example.com/unsub>'] },
 *   body: 'Email content here...',
 * });
 */
messenger.createMockFullMessage = function (overrides = {}) {
  return {
    headers: {},
    contentType: 'text/plain',
    body: '',
    parts: [],
    ...overrides,
  };
};

/**
 * Create a mock tab object
 *
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock tab object
 */
messenger.createMockTab = function (overrides = {}) {
  return {
    id: 1,
    type: 'mail',
    active: true,
    windowId: 1,
    ...overrides,
  };
};

/**
 * Setup common test scenario: message displayed event
 * Configures mocks for a typical message display workflow
 *
 * @param {Object} message - Message object to display
 * @param {Object} fullMessage - Full message content
 *
 * @example
 * messenger.setupMessageDisplayScenario(
 *   { id: 123, subject: 'Test' },
 *   { headers: {...}, body: '...' }
 * );
 */
messenger.setupMessageDisplayScenario = function (message, fullMessage) {
  this.messages.get.mockResolvedValue(message);
  this.messages.getFull.mockResolvedValue(fullMessage);
  this.messageDisplay.getDisplayedMessage.mockResolvedValue(message);
};

module.exports = messenger;
