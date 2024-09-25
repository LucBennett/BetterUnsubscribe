// Assign the mocked messenger object globally to simulate the Thunderbird environment
global.messenger = require('./__mocks__/messenger.js');

const { JSDOM } = require('jsdom');

// Mock DOMParser using JSDOM
global.DOMParser = class {
    parseFromString(string, contentType) {
        const { window } = new JSDOM(string);
        return window.document;
    }
};

const { searchUnsub, UnsubWeb, UnsubMail, UnsubPostRequest } = require('../background.js');

describe('searchUnsub', () => {

    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mock data before each test
        jest.spyOn(global.console, 'error').mockImplementation(() => {});
    });

    test('should return UnsubWeb when a valid list-unsubscribe HTTPS link is found', async () => {
        const selectedMessage = {id: 1, subject: "Test Subject"};

        // Mock the message with a valid 'list-unsubscribe' header containing an HTTPS link
        const fullMessage = {
            headers: {
                'list-unsubscribe': ['<https://unsubscribe.link/test>']
            }
        };

        const messageHeader = {
            id: 1,
            subject: 'Test Subject',
            recipients: ['user1@example.com'],
            ccList: [],
            bccList: [],
            folder: { accountId: 'account1' }
        };

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(selectedMessage);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link).toBe('https://unsubscribe.link/test');
    });

    test('should return UnsubMail when a valid mailto link is found', async () => {
        const selectedMessage = {id: 2, subject: "Test Subject"};

        // Mock the message with a 'list-unsubscribe' header containing a mailto link
        const fullMessage = {
            headers: {
                'list-unsubscribe': ['<mailto:unsubscribe@test.com>']
            }
        };

        const messageHeader = {
            id: 2,
            subject: 'Test Subject',
            recipients: ['user1@example.com'],
            ccList: [],
            bccList: [],
            folder: { accountId: 'account1' }
        };

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        // Mock `retrieveIdentity` to return a valid identity
        //global.retrieveIdentity = jest.fn().mockResolvedValue({id: 'identity1', email: 'user1@example.com'});

        const result = await searchUnsub(selectedMessage);

        expect(result).toBeInstanceOf(UnsubMail);
        expect(result.emailAddress).toBe('unsubscribe@test.com');
        expect(result.identity.id).toBe('identity1');
    });

    test('should return false when no unsubscribe information is found', async () => {
        const selectedMessage = {id: 3, subject: "Test Subject"};

        // Mock a message without 'list-unsubscribe' header
        const fullMessage = {
            headers: {
                'other-header': ['value']
            }
        };

        const messageHeader = {
            id: 3,
            subject: 'Test Subject',
            recipients: ['user3@example.com'],
            ccList: [],
            bccList: [],
            folder: { accountId: 'account3' }
        };

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(selectedMessage);

        expect(result).toBe(false);
    });

    test('should return false when an error occurs', async () => {
        const selectedMessage = {id: 4, subject: "Test Subject"};

        // Mock the messenger API to throw an error
        messenger.messages.getFull.mockRejectedValue(new Error('Failed to retrieve message'));

        const result = await searchUnsub(selectedMessage);

        expect(result).toBe(false);
        expect(console.error).toHaveBeenCalledWith("[BetterUnsubscribe][background.js]",expect.any(Error));
    });

    test('should return UnsubWeb when an embedded unsubscribe link is found in HTML body', async () => {
        const selectedMessage = {id: 5, subject: "Test Subject"};

        // Mock the message with HTML content containing an unsubscribe link
        const fullMessage = {
            contentType: 'text/html',
            body: '<a href="https://unsubscribe.example.com">Unsubscribe</a>',
            headers: {}
        };

        const messageHeader = {
            id: 5,
            subject: 'Test Subject',
            recipients: ['user4@example.com'],
            ccList: [],
            bccList: [],
            folder: { accountId: 'account4' }
        };

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(selectedMessage);

        // Normalize URLs by removing any trailing slashes
        const normalizeUrl = (url) => url.replace(/\/$/, '');

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(normalizeUrl(result.link)).toBe(normalizeUrl('https://unsubscribe.example.com'));
    });

});
