// Assign the mocked messenger object globally to simulate the Thunderbird environment
jest.mock('./__mocks__/messenger.js');

const messenger = require('./__mocks__/messenger.js');

// Assign the mocked messenger object globally to simulate the Thunderbird environment
global.messenger = messenger;

const { JSDOM } = require('jsdom');
// Mock DOMParser using JSDOM
global.DOMParser = class {
  parseFromString(string, _contentType) {
    const { window } = new JSDOM(string);
    return window.document;
  }
};

jest.spyOn(global.console, 'error').mockImplementation((...args) => {
  console.log(...args);
});

const { parseMessage } = require('./mailParserUtils.js');
const {
  searchUnsub,
  UnsubMail,
  UnsubWeb,
  UnsubPost,
} = require('../src/background.js');

// Read and parse the JSON file
const fs = require('fs');

if (!fs.existsSync('tests/resources/export-annotations.json')) {
  fs.writeFileSync('tests/resources/export-annotations.json', '[]', 'utf8');
}

const rawData = fs.readFileSync(
  'tests/resources/export-annotations.json',
  'utf8'
);
const emailMessages = JSON.parse(rawData); //.slice(14,15);

describe('searchUnsub', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mock data before each test
  });

  // Step 2: Create parameterized tests with test.each
  test.each(emailMessages)('Test message %# against db', async (message) => {
    // console.log(message.text);
    const [messageHeader, fullMessage] = await parseMessage(message.text); // Use message.message if it's the correct field

    // Mock the messenger methods to return the mocked fullMessage and messageHeader
    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const expected = getChoice(message);
    // console.log('Expecting:', expected);
    const result = await searchUnsub(messageHeader);
    if (expected) {
      expect(result).toBeInstanceOf(expected);
    } else {
      expect(result).toBeNull();
    }
  });
});

function getChoice(obj) {
  let choices = [];

  if (typeof obj.choice === 'string') {
    choices = [obj.choice];
  } else if (
    typeof obj.choice === 'object' &&
    Array.isArray(obj.choice.choices)
  ) {
    choices = obj.choice.choices;
  } else {
    // Unknown or invalid format
    return null;
  }

  if (choices.includes('List-Unsubscribe One-Click')) {
    return UnsubPost;
  }

  if (choices.includes('List-Unsubscribe Email Address')) {
    return UnsubMail;
  }

  if (
    choices.includes('List-Unsubscribe Link') ||
    choices.includes('Embedded Unsubscribe Link')
  ) {
    return UnsubWeb;
  }

  // Return null if "None" or unknown values are present
  if (choices.includes('None') || choices.length === 0) {
    return null;
  }

  // Return null if none of the conditions are met
  return null;
}
