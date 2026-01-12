const messenger = {
  messages: {
    getFull: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  },
  tabs: {
    onActivated: {
      addListener: jest.fn((callback) => {
        messenger.tabs.onActivated.triggerListener = callback;
      }),
    },
    get: jest.fn(),
  },
  messageDisplay: {
    onMessageDisplayed: {
      addListener: jest.fn((callback) => {
        messenger.messageDisplay.onMessageDisplayed.triggerListener = callback;
      }),
    },
    getDisplayedMessage: jest.fn(),
  },
  messageDisplayAction: {
    enable: jest.fn(() => Promise.resolve()),
    disable: jest.fn(() => Promise.resolve()),
  },
  runtime: {
    onMessage: {
      addListener: jest.fn((callback) => {
        messenger.runtime.onMessage.triggerListener = callback;
      }),
    },
  },
  compose: {
    beginNew: jest.fn(),
  },
  identities: {
    list: jest.fn(() =>
      Promise.resolve([
        { id: 'identity1', email: 'user1@example.com' },
        { id: 'identity2', email: 'user2@example.com' },
      ])
    ),
  },
  accounts: {
    list: jest.fn(() =>
      Promise.resolve([
        {
          id: 'account1',
          identities: [{ id: 'identity1', email: 'user1@example.com' }],
        },
        {
          id: 'account2',
          identities: [{ id: 'identity2', email: 'user2@example.com' }],
        },
      ])
    ),
  },
};

module.exports = messenger;
