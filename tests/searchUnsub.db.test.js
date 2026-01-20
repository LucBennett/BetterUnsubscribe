/**
 * Data-Driven Integration Tests for searchUnsub Function
 *
 * This test suite validates the searchUnsub function against a curated dataset of real-world
 * emails from the SpamAssassin corpus. Each email has been manually annotated to identify
 * the type of unsubscribe mechanism present (if any).
 *
 * Dataset: SpamAssassin Public Corpus
 * Annotations: Manual review and classification of unsubscribe methods
 * Annotation Format: JSON with email text and classification choices
 *
 * Test Coverage:
 * - List-Unsubscribe headers (RFC 2369)
 * - List-Unsubscribe-Post headers (RFC 8058 One-Click)
 * - Embedded unsubscribe links in email bodies
 * - Emails with no unsubscribe mechanism
 *
 * @see https://spamassassin.apache.org/old/publiccorpus/
 */

// Mock Thunderbird messenger API
jest.mock('./__mocks__/messenger.js');
const messenger = require('./__mocks__/messenger.js');
global.messenger = messenger;

// Mock DOM parsing for HTML email content
const { JSDOM } = require('jsdom');
global.DOMParser = class {
  parseFromString(string, _contentType) {
    const { window } = new JSDOM(string);
    return window.document;
  }
};

// Suppress console.error output during tests while maintaining visibility
jest.spyOn(global.console, 'error').mockImplementation((...args) => {
  console.log(...args);
});

// Import test dependencies
const fs = require('fs');
const path = require('path');
const { parseMessage } = require('./mailParserUtils.js');
const {
  searchUnsub,
  UnsubMail,
  UnsubWeb,
  UnsubPost,
} = require('../src/background.js');

/**
 * Annotation file path
 * Contains manually annotated emails from SpamAssassin corpus
 */
const ANNOTATIONS_FILE = path.join(
  __dirname,
  'resources',
  'export-annotations.json'
);

/**
 * Load and parse email annotations
 * Creates empty annotation file if it doesn't exist
 *
 * @returns {Array<EmailAnnotation>} Array of annotated email messages
 *
 * @typedef {Object} EmailAnnotation
 * @property {string} text - Raw email message text
 * @property {number} id - Unique annotation identifier
 * @property {Object|string} choice - Classification choice(s)
 * @property {string[]} choice.choices - Array of classification labels
 * @property {number} annotator - ID of person who annotated this email
 * @property {number} annotation_id - Annotation record ID
 * @property {string} created_at - ISO timestamp of annotation creation
 * @property {string} updated_at - ISO timestamp of last update
 * @property {number} lead_time - Time spent annotating (seconds)
 */
function loadEmailAnnotations() {
  // Ensure the annotations file exists
  if (!fs.existsSync(ANNOTATIONS_FILE)) {
    const dir = path.dirname(ANNOTATIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ANNOTATIONS_FILE, '[]', 'utf8');
    console.warn(
      `Created empty annotations file at ${ANNOTATIONS_FILE}. No tests will run until annotations are added.`
    );
  }

  const rawData = fs.readFileSync(ANNOTATIONS_FILE, 'utf8');
  const annotations = JSON.parse(rawData);

  if (annotations.length === 0) {
    console.warn(
      'No email annotations found. Add annotated emails to run data-driven tests.'
    );
  }

  return annotations;
}

/**
 * Maps annotation choices to expected unsubscribe class types
 *
 * This function interprets the manual annotations and returns the expected
 * class type that searchUnsub should return for the given email.
 *
 * Priority order (when multiple choices exist):
 * 1. List-Unsubscribe One-Click (UnsubPost) - RFC 8058
 * 2. List-Unsubscribe Email Address (UnsubMail) - RFC 2369 mailto
 * 3. List-Unsubscribe Link or Embedded Link (UnsubWeb) - RFC 2369 https or embedded
 * 4. None (null) - No unsubscribe mechanism found
 *
 * @param {EmailAnnotation} annotation - The annotated email object
 * @returns {Function|null} Expected class constructor (UnsubPost, UnsubMail, UnsubWeb) or null
 */
function getExpectedUnsubscribeType(annotation) {
  let choices = [];

  // Normalize choice format (can be string or object with choices array)
  if (typeof annotation.choice === 'string') {
    choices = [annotation.choice];
  } else if (
    typeof annotation.choice === 'object' &&
    Array.isArray(annotation.choice.choices)
  ) {
    choices = annotation.choice.choices;
  } else {
    console.warn(
      `Invalid choice format in annotation ${annotation.id}:`,
      annotation.choice
    );
    return null;
  }

  // Map annotation labels to expected class types
  // Priority: One-Click > Email > Web Link > None

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

  // No unsubscribe mechanism present
  if (choices.includes('None') || choices.length === 0) {
    return null;
  }

  // Unrecognized annotation label
  console.warn(
    `Unrecognized choice(s) in annotation ${annotation.id}:`,
    choices
  );
  return null;
}

/**
 * Creates a descriptive test name from the annotation
 *
 * @param {EmailAnnotation} annotation - The annotated email object
 * @returns {string} Human-readable test description
 */
function getTestDescription(annotation) {
  const choices =
    typeof annotation.choice === 'string'
      ? [annotation.choice]
      : annotation.choice?.choices || [];

  const choiceStr = choices.length > 0 ? choices.join(', ') : 'None';
  const truncatedText =
    annotation.text.length > 50
      ? annotation.text.substring(0, 47) + '...'
      : annotation.text;

  return `ID ${annotation.id}: ${choiceStr} | "${truncatedText}"`;
}

// Load email annotations
const emailAnnotations = loadEmailAnnotations();

/**
 * Data-Driven Test Suite
 *
 * Each test represents one manually annotated email from the SpamAssassin corpus.
 * The test validates that searchUnsub correctly identifies the annotated unsubscribe method.
 */
describe('searchUnsub - Data-Driven Tests Against SpamAssassin Corpus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Skip all tests if no annotations are present
  if (emailAnnotations.length === 0) {
    test.skip('No annotations available', () => {
      // Placeholder for when annotations file is empty
    });
  }

  /**
   * Parameterized test for each annotated email
   *
   * For each email in the annotations file:
   * 1. Parse the raw email text into header and full message
   * 2. Mock the Thunderbird API responses
   * 3. Run searchUnsub to detect unsubscribe method
   * 4. Validate the result matches the manual annotation
   */
  test.each(emailAnnotations)(
    'should correctly identify unsubscribe method: $id',
    async (annotation) => {
      // Arrange: Parse the email and set up mocks
      const [messageHeader, fullMessage] = await parseMessage(annotation.text);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const expectedType = getExpectedUnsubscribeType(annotation);

      // Act: Search for unsubscribe method
      const result = await searchUnsub(messageHeader.id);

      // Assert: Verify result matches annotation
      if (expectedType) {
        expect(result).toBeInstanceOf(expectedType);

        // Additional validation based on type
        if (expectedType === UnsubWeb) {
          expect(result.link).toBeDefined();
          expect(result.link.href).toMatch(/^https?:\/\//);
        } else if (expectedType === UnsubMail) {
          expect(result.email).toBeDefined();
          expect(result.email.protocol).toBe('mailto:');
        } else if (expectedType === UnsubPost) {
          expect(result.weblink).toBeDefined();
          expect(result.weblink.href).toMatch(/^https?:\/\//);
        }
      } else {
        expect(result).toBeNull();
      }
    }
  );
});
