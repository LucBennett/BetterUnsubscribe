const fs = require('fs');
const path = require('path');

const directoryPath = './_locales'; // replace with your directory path

const files = fs.readdirSync(directoryPath, { withFileTypes: true })

const locales = files
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

model_messages = JSON.parse(fs.readFileSync(path.join(__dirname, "../_locales/en/messages.json"), 'utf8'));

required_keys = Object.keys(model_messages);

// Test each locale's messages.json file
describe('Locale Messages Test', () => {
    locales.forEach(locale => {
        let messages = {};

        // Load the messages.json file before each test for the specific locale
        beforeEach(() => {
            const messagesPath = path.join(__dirname, `../_locales/${locale}/messages.json`);
            messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
        });

        test(`All required keys should be present and non-empty in ${locale}/messages.json`, () => {
            expect(Object.keys(messages)).toStrictEqual(required_keys);

            required_keys.forEach(key => {
                const messageObject = messages[key];

                // Check if the key exists
                expect(messageObject).toBeDefined();
                if (messageObject) {
                    // Check if 'message' field exists and is non-empty
                    expect(messageObject.message).toBeDefined();
                    expect(messageObject.message).not.toBe('');

                    // Check if 'description' field exists and is non-empty
                    expect(messageObject.description).toBeDefined();
                    expect(messageObject.description).not.toBe('');
                }
            });
        });
    });
});