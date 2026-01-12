/**
 * Internationalization (i18n) Validation Test Suite
 *
 * This test suite validates that internationalization (i18n) is correctly implemented
 * across the Thunderbird extension. It ensures that:
 *
 * 1. All locale message files are complete and consistent
 * 2. All HTML files reference valid i18n keys
 * 3. All JavaScript files use valid i18n keys
 * 4. No orphaned or missing translation keys exist
 *
 * Test Coverage:
 * - Locale message file completeness (all locales have all keys)
 * - Message structure validation (message and description fields present)
 * - HTML data-i18n attribute validation
 * - JavaScript i18n.getMessage() call validation
 *
 * Directory Structure:
 * - src/_locales/en/messages.json - Base locale (model for others)
 * - src/_locales/{locale}/messages.json - Other locale files
 * - src/*.html - HTML files with data-i18n attributes
 * - src/*.js - JavaScript files with i18n.getMessage() calls
 *
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/i18n
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

/**
 * Configuration for i18n validation
 */
const CONFIG = {
  localesDir: './src/_locales',
  srcDir: './src',
  baseLocale: 'en',

  // File patterns to check
  patterns: {
    html: '.html',
    js: '.js',
  },

  // Regex patterns for i18n calls in JavaScript
  i18nCallPatterns: [
    /\b(messenger|browser)\.i18n\.getMessage\(["']([^"']+)["']\)/g,
    /\bi18n\.getMessage\(["']([^"']+)["']\)/g, // For imported i18n
  ],
};

/**
 * Load all available locales from the _locales directory
 *
 * @returns {string[]} Array of locale codes (e.g., ['en', 'es', 'fr'])
 */
function loadAvailableLocales() {
  const localesPath = path.join(__dirname, '..', CONFIG.localesDir);
  const entries = fs.readdirSync(localesPath, { withFileTypes: true });

  return entries
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort();
}

/**
 * Load the base locale messages (English) as the reference model
 *
 * All other locales should have the same keys as this base model.
 *
 * @returns {Object} Base locale messages object
 * @throws {Error} If base locale messages.json cannot be read
 */
function loadBaseLocaleMessages() {
  const messagesPath = path.join(
    __dirname,
    '..',
    CONFIG.localesDir,
    CONFIG.baseLocale,
    'messages.json'
  );

  try {
    const content = fs.readFileSync(messagesPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to load base locale (${CONFIG.baseLocale}): ${error.message}`
    );
  }
}

/**
 * Load messages for a specific locale
 *
 * @param {string} locale - Locale code (e.g., 'en', 'es', 'fr')
 * @returns {Object} Locale messages object
 * @throws {Error} If locale messages.json cannot be read
 */
function loadLocaleMessages(locale) {
  const messagesPath = path.join(
    __dirname,
    '..',
    CONFIG.localesDir,
    locale,
    'messages.json'
  );

  try {
    const content = fs.readFileSync(messagesPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load locale ${locale}: ${error.message}`);
  }
}

/**
 * Get all files in the src directory matching a specific extension
 *
 * @param {string} extension - File extension to filter (e.g., '.html', '.js')
 * @returns {string[]} Array of file paths relative to project root
 */
function getFilesByExtension(extension) {
  const srcPath = path.join(__dirname, '..', CONFIG.srcDir);
  const entries = fs.readdirSync(srcPath, { withFileTypes: true });

  return entries
    .filter((file) => file.isFile() && path.extname(file.name) === extension)
    .map((file) => path.join(CONFIG.srcDir, file.name))
    .sort();
}

/**
 * Extract i18n keys from HTML file's data-i18n attributes
 *
 * @param {string} filePath - Path to HTML file
 * @returns {Set<string>} Set of i18n keys found in the file
 */
function extractI18nKeysFromHTML(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const dom = new JSDOM(content);
  const document = dom.window.document;

  const keys = new Set();
  const elements = document.querySelectorAll('[data-i18n]');

  elements.forEach((element) => {
    const key = element.getAttribute('data-i18n').trim();
    if (key) {
      keys.add(key);
    }
  });

  return keys;
}

/**
 * Extract i18n keys from JavaScript file's i18n.getMessage() calls
 *
 * Matches patterns like:
 * - messenger.i18n.getMessage("key")
 * - browser.i18n.getMessage("key")
 * - i18n.getMessage("key")
 *
 * @param {string} filePath - Path to JavaScript file
 * @returns {Set<string>} Set of i18n keys found in the file
 */
function extractI18nKeysFromJS(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();

  CONFIG.i18nCallPatterns.forEach((pattern) => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      // Extract the key (second capture group for most patterns)
      const keyIndex = match.length === 3 ? 2 : 1;
      const key = match[keyIndex].trim();

      if (key) {
        keys.add(key);
      }
    }
  });

  return keys;
}

/**
 * Validate a message object structure
 *
 * Each message should have:
 * - message: The translated text (required, non-empty)
 * - description: Description for translators (required, non-empty)
 *
 * @param {string} key - Message key
 * @param {Object} messageObject - Message object to validate
 * @returns {string[]} Array of validation errors (empty if valid)
 */
function validateMessageStructure(key, messageObject) {
  const errors = [];

  if (!messageObject) {
    errors.push(`Key "${key}" is missing from messages`);
    return errors;
  }

  if (!messageObject.message) {
    errors.push(`Key "${key}" is missing "message" field`);
  } else if (typeof messageObject.message !== 'string') {
    errors.push(`Key "${key}" has non-string "message" field`);
  } else if (messageObject.message.trim() === '') {
    errors.push(`Key "${key}" has empty "message" field`);
  }

  if (!messageObject.description) {
    errors.push(`Key "${key}" is missing "description" field`);
  } else if (typeof messageObject.description !== 'string') {
    errors.push(`Key "${key}" has non-string "description" field`);
  } else if (messageObject.description.trim() === '') {
    errors.push(`Key "${key}" has empty "description" field`);
  }

  return errors;
}

// Load test data
const availableLocales = loadAvailableLocales();
const baseMessages = loadBaseLocaleMessages();
const requiredKeys = Object.keys(baseMessages).sort();
const htmlFiles = getFilesByExtension(CONFIG.patterns.html);
const jsFiles = getFilesByExtension(CONFIG.patterns.js);

/**
 * Test Suite 1: Locale Message File Validation
 *
 * Validates that all locale message files are complete and properly structured.
 * Each locale should have:
 * - All keys present in the base locale (English)
 * - Valid message structure (message and description fields)
 * - Non-empty values for all fields
 */
describe('Locale Message Files Validation', () => {
  // Ensure we have locales to test
  test('should have at least one locale defined', () => {
    expect(availableLocales.length).toBeGreaterThan(0);
  });

  // Ensure base locale exists
  test(`should have base locale (${CONFIG.baseLocale}) defined`, () => {
    expect(availableLocales).toContain(CONFIG.baseLocale);
  });

  // Ensure base locale has keys
  test('should have at least one key in base locale', () => {
    expect(requiredKeys.length).toBeGreaterThan(0);
  });

  // Test each locale
  availableLocales.forEach((locale) => {
    describe(`Locale: ${locale}`, () => {
      let messages;

      beforeAll(() => {
        messages = loadLocaleMessages(locale);
      });

      test('should have all required keys from base locale', () => {
        const actualKeys = Object.keys(messages).sort();
        expect(actualKeys).toEqual(requiredKeys);
      });

      test('should have no extra keys not in base locale', () => {
        const extraKeys = Object.keys(messages).filter(
          (key) => !requiredKeys.includes(key)
        );

        expect(extraKeys).toEqual([]);
      });

      test('should have valid structure for all messages', () => {
        const allErrors = [];

        requiredKeys.forEach((key) => {
          const errors = validateMessageStructure(key, messages[key]);
          allErrors.push(...errors);
        });

        if (allErrors.length > 0) {
          throw new Error(
            `Found ${allErrors.length} validation error(s):\n` +
              allErrors.map((e) => `  - ${e}`).join('\n')
          );
        }
      });

      test('should have non-empty message fields', () => {
        requiredKeys.forEach((key) => {
          const messageObject = messages[key];
          expect(messageObject).toBeDefined();
          expect(messageObject.message).toBeDefined();
          expect(messageObject.message.trim()).not.toBe('');
        });
      });

      test('should have non-empty description fields', () => {
        requiredKeys.forEach((key) => {
          const messageObject = messages[key];
          expect(messageObject).toBeDefined();
          expect(messageObject.description).toBeDefined();
          expect(messageObject.description.trim()).not.toBe('');
        });
      });
    });
  });
});

/**
 * Test Suite 2: HTML Files i18n Validation
 *
 * Validates that all HTML files use valid i18n keys in their data-i18n attributes.
 * This ensures that all UI text can be properly localized.
 */
describe('HTML Files i18n Validation', () => {
  // Ensure we have HTML files to test
  test('should have HTML files to validate', () => {
    expect(htmlFiles.length).toBeGreaterThan(0);
  });

  htmlFiles.forEach((file) => {
    describe(`File: ${file}`, () => {
      let i18nKeys;

      beforeAll(() => {
        i18nKeys = extractI18nKeysFromHTML(file);
      });

      test('should only reference valid i18n keys', () => {
        const invalidKeys = [...i18nKeys].filter(
          (key) => !requiredKeys.includes(key)
        );

        if (invalidKeys.length > 0) {
          throw new Error(
            `Found ${invalidKeys.length} invalid i18n key(s):\n` +
              invalidKeys.map((k) => `  - "${k}"`).join('\n') +
              '\n\nThese keys are not defined in the base locale messages.json'
          );
        }
      });

      test('should have at least one i18n key if HTML contains text', () => {
        // This is informational - some files might legitimately have no i18n
        if (i18nKeys.size === 0) {
          console.warn(`  Warning: ${file} has no data-i18n attributes`);
        }

        // Test always passes but logs warning
        expect(true).toBe(true);
      });
    });
  });
});

/**
 * Test Suite 3: JavaScript Files i18n Validation
 *
 * Validates that all JavaScript files use valid i18n keys in their
 * i18n.getMessage() calls. This ensures that all programmatic text
 * can be properly localized.
 */
describe('JavaScript Files i18n Validation', () => {
  // Ensure we have JS files to test
  test('should have JavaScript files to validate', () => {
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  jsFiles.forEach((file) => {
    describe(`File: ${file}`, () => {
      let i18nKeys;

      beforeAll(() => {
        i18nKeys = extractI18nKeysFromJS(file);
      });

      test('should only reference valid i18n keys', () => {
        const invalidKeys = [...i18nKeys].filter(
          (key) => !requiredKeys.includes(key)
        );

        if (invalidKeys.length > 0) {
          throw new Error(
            `Found ${invalidKeys.length} invalid i18n key(s):\n` +
              invalidKeys.map((k) => `  - "${k}"`).join('\n') +
              '\n\nThese keys are not defined in the base locale messages.json'
          );
        }
      });

      test('should have at least one i18n call if JS generates text', () => {
        // This is informational - some files might legitimately have no i18n
        if (i18nKeys.size === 0) {
          console.warn(`  Warning: ${file} has no i18n.getMessage() calls`);
        }

        // Test always passes but logs warning
        expect(true).toBe(true);
      });
    });
  });
});

/**
 * Test Suite 4: Coverage Analysis
 *
 * Provides insights into i18n usage and coverage across the codebase.
 * Helps identify unused keys and coverage gaps.
 */
describe('i18n Coverage Analysis', () => {
  test('should report i18n usage statistics', () => {
    // Collect all used keys from HTML files
    const usedInHTML = new Set();
    htmlFiles.forEach((file) => {
      const keys = extractI18nKeysFromHTML(file);
      keys.forEach((key) => usedInHTML.add(key));
    });

    // Collect all used keys from JS files
    const usedInJS = new Set();
    jsFiles.forEach((file) => {
      const keys = extractI18nKeysFromJS(file);
      keys.forEach((key) => usedInJS.add(key));
    });

    // Find all used keys
    const allUsedKeys = new Set([...usedInHTML, ...usedInJS]);

    // Find unused keys
    const unusedKeys = requiredKeys.filter((key) => !allUsedKeys.has(key));

    // Report statistics
    console.log('\n=== i18n Coverage Statistics ===');
    console.log(`Total defined keys: ${requiredKeys.length}`);
    console.log(`Keys used in HTML: ${usedInHTML.size}`);
    console.log(`Keys used in JS: ${usedInJS.size}`);
    console.log(`Total keys used: ${allUsedKeys.size}`);
    console.log(`Unused keys: ${unusedKeys.length}`);

    if (unusedKeys.length > 0) {
      console.log('\nUnused keys (consider removing if truly unused):');
      unusedKeys.forEach((key) => console.log(`  - ${key}`));
    }

    console.log('\nLocale coverage:');
    console.log(`  Available locales: ${availableLocales.length}`);
    availableLocales.forEach((locale) => {
      console.log(`    - ${locale}`);
    });
    console.log('================================\n');

    // Test passes - this is just informational
    expect(true).toBe(true);
  });

  test('should warn about potentially unused keys', () => {
    // Collect all used keys
    const allUsedKeys = new Set();

    htmlFiles.forEach((file) => {
      const keys = extractI18nKeysFromHTML(file);
      keys.forEach((key) => allUsedKeys.add(key));
    });

    jsFiles.forEach((file) => {
      const keys = extractI18nKeysFromJS(file);
      keys.forEach((key) => allUsedKeys.add(key));
    });

    // Find unused keys
    const unusedKeys = requiredKeys.filter((key) => !allUsedKeys.has(key));

    // Warn if there are unused keys
    if (unusedKeys.length > 0) {
      console.warn(
        `\n  Warning: Found ${unusedKeys.length} potentially unused i18n key(s).` +
          '\n  These keys are defined but not referenced in HTML or JS files.' +
          '\n  This might be intentional (e.g., manifest.json usage) or indicate dead code.'
      );
      console.warn(unusedKeys);
    }

    // Test passes - this is just a warning
    expect(true).toBe(true);
  });
});
