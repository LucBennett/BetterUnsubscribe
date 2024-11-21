const messenger = {
  messages: {
    getFull: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  },
  messageDisplay: {
    onMessageDisplayed: {
      addListener: jest.fn((callback) => {
        messenger.messageDisplay.onMessageDisplayed.triggerListener = callback;
      }),
    },
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
        // Mock returning a list of identities
        { id: 'identity1', email: 'user1@example.com' },
        { id: 'identity2', email: 'user2@example.com' },
      ])
    ),
  },
  accounts: {
    list: jest.fn(() =>
      Promise.resolve([
        // Mock returning a list of accounts
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
