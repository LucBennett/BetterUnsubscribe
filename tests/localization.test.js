const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const locales_files = fs.readdirSync('./src/_locales', { withFileTypes: true });

const locales = locales_files
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

const model_messages = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../src/_locales/en/messages.json'),
    'utf8'
  )
);

const required_keys = Object.keys(model_messages);
//console.log(required_keys);

// Test each locale's messages.json file
describe('Locale Messages Test', () => {
  locales.forEach((locale) => {
    let messages = {};

    // Load the messages.json file before each test for the specific locale
    beforeEach(() => {
      const messagesPath = path.join(
        __dirname,
        `../src/_locales/${locale}/messages.json`
      );
      messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
    });

    test(`All required keys should be present and non-empty in ${locale}/messages.json`, () => {
      expect(Object.keys(messages)).toStrictEqual(required_keys);

      required_keys.forEach((key) => {
        const messageObject = messages[key];

        // Check if the key exists
        expect(messageObject).toBeDefined();
        // Check if 'message' field exists and is non-empty
        expect(messageObject.message).toBeDefined();
        expect(messageObject.message).not.toBe('');

        // Check if 'description' field exists and is non-empty
        expect(messageObject.description).toBeDefined();
        expect(messageObject.description).not.toBe('');
      });
    });
  });
});

// Read all entries in the './src' directory
const src_files = fs.readdirSync('./src', { withFileTypes: true });

// Filter for files with the .html suffix and create full paths
const htmlFiles = src_files
  .filter((file) => file.isFile() && path.extname(file.name) === '.html')
  .map((file) => path.join('./src', file.name));

// Filter for files with the .js suffix and create full paths
const jsFiles = src_files
  .filter((file) => file.isFile() && path.extname(file.name) === '.js')
  .map((file) => path.join('./src', file.name));

// Jest test suite for HTML files
describe('Check HTML Files', () => {
  htmlFiles.forEach((file) => {
    test(`should have required data-i18n attributes in ${file}`, () => {
      // Read and parse HTML file synchronously
      const data = fs.readFileSync(file, 'utf8');
      const dom = new JSDOM(data);
      const document = dom.window.document;

      // Select all elements with the data-i18n attribute
      const elements = document.querySelectorAll('[data-i18n]');

      // Check each element's data-i18n attribute against required_keys
      elements.forEach((element) => {
        const i18nKey = element.getAttribute('data-i18n').trim();
        // console.log(i18nKey, required_keys.includes(i18nKey));
        expect(required_keys.includes(i18nKey)).toBeTruthy();
      });
    });
  });
});

// Jest test suite for JS files
describe('Check JS Files', () => {
  jsFiles.forEach((file) => {
    test(`should have required arguments in i18n calls in ${file}`, () => {
      // Read the JavaScript file synchronously
      const data = fs.readFileSync(file, 'utf8');

      // Regular expression to match both `messenger.i18n.getMessage` and `browser.i18n.getMessage`
      const regex = /\b(messenger|browser)\.i18n\.getMessage\("([^"]*)"\)/g;
      let match;

      // Iterate over all matches and check if arguments are in required_keys
      while ((match = regex.exec(data)) !== null) {
        const i18nKey = match[2].trim().replace(/['"`]/g, ''); // Remove quotes around the argument
        // console.log(i18nKey, required_keys.includes(i18nKey));
        expect(required_keys.includes(i18nKey)).toBeTruthy();
      }
    });
  });
});
