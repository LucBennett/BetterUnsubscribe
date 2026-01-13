// Assign the mocked messenger object globally to simulate the Thunderbird environment
global.messenger = require('./__mocks__/messenger.js');

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
  UnsubWeb,
  UnsubMail,
  UnsubPost,
} = require('../src/background.js');

/**
 * Test suite for searchUnsub function
 *
 * This function searches for unsubscribe methods in email messages following RFC 2369 (list-unsubscribe)
 * and RFC 8058 (one-click unsubscribe) standards, as well as embedded links in message bodies.
 *
 * Unsubscribe methods tested:
 * - UnsubWeb: HTTPS links in list-unsubscribe header or embedded in body
 * - UnsubMail: mailto links in list-unsubscribe header
 * - UnsubPost: One-click unsubscribe via list-unsubscribe-post header
 */
describe('searchUnsub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper function to create a mock message header
   */
  const createMockMessageHeader = (id, overrides = {}) => ({
    id,
    subject: 'Test Subject',
    recipients: ['user@example.com'],
    ccList: [],
    bccList: [],
    folder: { accountId: `account${id}` },
    ...overrides,
  });

  /**
   * Helper function to create a mock full message
   */
  const createMockFullMessage = (overrides = {}) => ({
    headers: {},
    contentType: 'text/plain',
    body: '',
    ...overrides,
  });

  /**
   * Helper function to normalize URLs by removing trailing slashes
   */
  const normalizeUrl = (url) => url.replace(/\/$/, '');

  describe('List-Unsubscribe Header (RFC 2369)', () => {
    describe('UnsubWeb - HTTPS links', () => {
      test('should return UnsubWeb when a valid list-unsubscribe HTTPS link is found', async () => {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': ['<https://unsubscribe.link/test>'],
          },
        });

        const messageHeader = createMockMessageHeader(1);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe('https://unsubscribe.link/test');
      });

      test('should extract HTTPS link from list-unsubscribe header with angle brackets', async () => {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': '<https://example.com/unsubscribe>',
          },
        });

        const messageHeader = createMockMessageHeader(2);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe('https://example.com/unsubscribe');
      });

      test('should handle list-unsubscribe header with multiple links and prefer mail', async () => {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': [
              '<mailto:unsubscribe@example.com>, <https://example.com/unsubscribe>',
            ],
          },
        });

        const messageHeader = createMockMessageHeader(3);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        // Should prefer mail-based unsubscribe when multiple options exist
        expect(result).toBeInstanceOf(UnsubMail);
        expect(result.email.pathname).toBe('unsubscribe@example.com');
      });

      test('should handle list-unsubscribe with query parameters', async () => {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': [
              '<https://example.com/unsubscribe?user=123&token=abc>',
            ],
          },
        });

        const messageHeader = createMockMessageHeader(4);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe(
          'https://example.com/unsubscribe?user=123&token=abc'
        );
      });
    });

    describe('UnsubMail - mailto links', () => {
      test('should return UnsubMail when a valid mailto link is found', async () => {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': ['<mailto:unsubscribe@test.com>'],
          },
        });

        const messageHeader = createMockMessageHeader(5);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubMail);
        expect(result.email.pathname).toBe('unsubscribe@test.com');
        expect(result.identity.id).toBe('identity1');
      });

      test('should find mailto link and match correct identity', async () => {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': '<mailto:unsubscribe@example.com>',
          },
        });

        const messageHeader = createMockMessageHeader(6, {
          recipients: ['user@example.com'],
        });

        const identities = [{ id: 'id1', email: 'user@example.com' }];

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);
        messenger.identities.list.mockResolvedValue(identities);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubMail);
        expect(result.email.pathname).toBe('unsubscribe@example.com');
      });

      test('should handle mailto link with subject parameter', async () => {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': [
              '<mailto:unsubscribe@example.com?subject=Remove%20Me>',
            ],
          },
        });

        const messageHeader = createMockMessageHeader(7);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubMail);
        expect(result.email.pathname).toBe('unsubscribe@example.com');
        expect(result.email.search).toContain('subject=Remove%20Me');
      });
    });
  });

  describe('List-Unsubscribe-Post Header (RFC 8058)', () => {
    test('should return UnsubPost when valid list-unsubscribe-post header and HTTPS link are found', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe': ['<https://unsubscribe.postrequest.test>'],
          'list-unsubscribe-post': ['One-Click'],
        },
      });

      const messageHeader = createMockMessageHeader(8);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeInstanceOf(UnsubPost);
      expect(normalizeUrl(result.weblink.href)).toBe(
        'https://unsubscribe.postrequest.test'
      );
    });

    test('should return UnsubPost with List-Unsubscribe=One-Click format', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe':
            '<https://example.com/unsubscribe>, <mailto:unsubscribe@example.com>',
          'list-unsubscribe-post': ['List-Unsubscribe=One-Click'],
        },
      });

      const messageHeader = createMockMessageHeader(9);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeInstanceOf(UnsubPost);
      expect(result.weblink.href).toBe('https://example.com/unsubscribe');
    });

    test('should prioritize UnsubPost over UnsubWeb when both headers present', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe': [
            '<mailto:unsubscribe@send.reviewmgr.com?subject=http://track.reviewmgr.com/mt/u/PATH>,<https://u42156316.ct.sendgrid.net/lu/unsubscribe?oc=DATA>',
          ],
          'list-unsubscribe-post': ['One-Click'],
        },
      });

      const messageHeader = createMockMessageHeader(10);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeInstanceOf(UnsubPost);
      expect(normalizeUrl(result.weblink.href)).toBe(
        'https://u42156316.ct.sendgrid.net/lu/unsubscribe?oc=DATA'
      );
    });

    test('should handle malformed list-unsubscribe-post header values', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe': ['<https://example.com/unsubscribe>'],
          'list-unsubscribe-post': ['Invalid-Value'],
        },
      });

      const messageHeader = createMockMessageHeader(11);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      // Should still attempt to process or fallback appropriately
      expect(result).toBeDefined();
    });
  });

  describe('Embedded Unsubscribe Links', () => {
    describe('HTML body parsing', () => {
      test('should find embedded unsubscribe link in HTML body', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'text/html',
          body: '<a href="https://unsubscribe.example.com">Unsubscribe</a>',
        });

        const messageHeader = createMockMessageHeader(12);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(normalizeUrl(result.link.href)).toBe(
          'https://unsubscribe.example.com'
        );
      });

      test('should find unsubscribe link in multipart/alternative HTML part', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'multipart/alternative',
          parts: [
            {
              contentType: 'text/html',
              body: '<html><body>Click <a href="https://example.com/unsubscribe">here</a> to unsubscribe.</body></html>',
            },
          ],
        });

        const messageHeader = createMockMessageHeader(13);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe('https://example.com/unsubscribe');
      });

      test('should find unsubscribe link when text is not in anchor element', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'multipart/alternative',
          parts: [
            {
              contentType: 'text/html',
              body: '<html><body><span>Unsubscribe <a href="https://example.com/remove_user_from_mailing_list?userid=123">Here</a></span></body></html>',
            },
          ],
        });

        const messageHeader = createMockMessageHeader(14);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe(
          'https://example.com/remove_user_from_mailing_list?userid=123'
        );
      });

      test('should select correct unsubscribe link when multiple similar links exist', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'multipart/alternative',
          parts: [
            {
              contentType: 'text/html',
              body: '<html><body><span>Learn More <a href="https://example.com/learn_more?userid=123">Here</a></span><span>Unsubscribe <a href="https://example.com/remove_user_from_mailing_list?userid=123">Here</a></span></body></html>',
            },
          ],
        });

        const messageHeader = createMockMessageHeader(15);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe(
          'https://example.com/remove_user_from_mailing_list?userid=123'
        );
      });

      test('should handle case-insensitive unsubscribe text matching', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'text/html',
          body: '<a href="https://example.com/unsub">UNSUBSCRIBE NOW</a>',
        });

        const messageHeader = createMockMessageHeader(16);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe('https://example.com/unsub');
      });
    });

    describe('Plain text body parsing', () => {
      test('should find embedded unsubscribe link in text body via regex', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'text/plain',
          body: 'If you wish to unsubscribe, please visit https://example.com/unsubscribe',
        });

        const messageHeader = createMockMessageHeader(18);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe('https://example.com/unsubscribe');
      });

      test('should extract URL from plain text with unsubscribe keyword nearby', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'text/plain',
          body: 'To unsubscribe from future emails, click: https://example.com/remove?id=456',
        });

        const messageHeader = createMockMessageHeader(19);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe('https://example.com/remove?id=456');
      });

      test('should handle multiple URLs and select the one near unsubscribe keyword', async () => {
        const fullMessage = createMockFullMessage({
          contentType: 'text/plain',
          body: 'Visit our site: https://example.com/home. To unsubscribe: https://example.com/remove_user_from_mailing_list?userid=123',
        });

        const messageHeader = createMockMessageHeader(20);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        expect(result).toBeInstanceOf(UnsubWeb);
        expect(result.link.href).toBe(
          'https://example.com/remove_user_from_mailing_list?userid=123'
        );
      });
    });
  });

  describe('Real-world email examples', () => {
    test('should parse unsubscribe link from real Enron email', async () => {
      const message =
        "Message-ID: <9309202.1075855690502.JavaMail.evans@thyme>\nDate: Mon, 26 Jun 2000 06:57:00 -0700 (PDT)\nFrom: phillip.allen@enron.com\nTo: keith.holst@enron.com\nSubject: Download Frogger before it hops away!\nMime-Version: 1.0\nContent-Type: text/plain; charset=us-ascii\nContent-Transfer-Encoding: 7bit\nX-From: Phillip K Allen\nX-To: Keith Holst\nX-cc: \nX-bcc: \nX-Folder: \\\\Phillip_Allen_Dec2000\\\notes Folders\\\\\\'sent mail\nX-Origin: Allen-P\nX-FileName: pallen.nsf\n\n---------------------- Forwarded by Phillip K Allen/HOU/ECT on 06/26/2000 \n01:57 PM ---------------------------\n\n\n\"the shockwave.com team\" <shockwave.com@shockwave.m0.net> on 06/23/2000 \n10:49:22 PM\nPlease respond to shockwave.com@shockwave.m0.net\nTo: pallen@enron.com\ncc:  \nSubject: Download Frogger before it hops away!\n\n\nDear Phillip,\n\nFrogger is leaving shockwave.com soon...\n\nSave it to your Shockmachine now! \n\nEvery frog has his day - games, too. Frogger had a great run as an \narcade classic, but it is leaving the shockwave.com pond soon. The \ngood news is that you can download it to your Shockmachine and \nown it forever! \n\nDon\\'t know about Shockmachine? You can download Shockmachine for free \nand save all of your downloadable favorites to play off-line, \nfull-screen, whenever you want. \n\nDownload Frogger by noon, PST on June 30th, while it\\'s still on \nthe site! \n\nthe shockwave.com team \n\n~~~~~~~~~~~~~~~~~~~~~~~~ \nUnsubscribe Instructions \n~~~~~~~~~~~~~~~~~~~~~~~~ \nSure you want to unsubscribe and stop receiving E-mail from us? All \nright... click here: \nhttp://shockwave1.m0.net/m/u/shk/s.asp?e=pallen%40enron.com\n\n\n\n\n#27279\n\n\n\n\n\n \n\n";
      const [messageHeader, fullMessage] = await parseMessage(message);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeInstanceOf(UnsubWeb);
      expect(result.link.href).toBe(
        'http://shockwave1.m0.net/m/u/shk/s.asp?e=pallen%40enron.com'
      );
    });
  });

  describe('Edge cases and error handling', () => {
    test('should return null when no unsubscribe information is found', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'other-header': ['value'],
        },
      });

      const messageHeader = createMockMessageHeader(21);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeNull();
    });

    test('should return null for message with no unsubscribe method', async () => {
      const fullMessage = createMockFullMessage({
        contentType: 'text/plain',
        body: 'This is a regular message with no unsubscribe link.',
      });

      const messageHeader = createMockMessageHeader(22);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeNull();
    });

    test('should throw error when message retrieval fails', async () => {
      const messageHeader = createMockMessageHeader(23);

      messenger.messages.getFull.mockRejectedValue(
        new Error('Failed to retrieve message')
      );

      await expect(searchUnsub(messageHeader)).rejects.toThrow(
        'Failed to retrieve message'
      );
    });

    test('should handle empty list-unsubscribe header', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe': [''],
        },
      });

      const messageHeader = createMockMessageHeader(24);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeNull();
    });

    test('should handle malformed URLs in list-unsubscribe header', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe': ['<not-a-valid-url>'],
        },
      });

      const messageHeader = createMockMessageHeader(25);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      // Should handle gracefully without throwing
      expect(result).toBeDefined();
    });

    test('should handle missing message parts array', async () => {
      const fullMessage = createMockFullMessage({
        contentType: 'multipart/alternative',
        parts: undefined,
      });

      const messageHeader = createMockMessageHeader(26);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      // Should not crash
      expect(result).toBeDefined();
    });

    test('should handle HTML with no links', async () => {
      const fullMessage = createMockFullMessage({
        contentType: 'text/html',
        body: '<html><body><p>This email has no links at all.</p></body></html>',
      });

      const messageHeader = createMockMessageHeader(27);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeNull();
    });
  });

  describe('Priority and precedence', () => {
    test('should prioritize list-unsubscribe-post over other methods', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe': ['<https://example.com/unsubscribe>'],
          'list-unsubscribe-post': ['One-Click'],
        },
        contentType: 'text/html',
        body: '<a href="https://example.com/other-unsubscribe">Unsubscribe</a>',
      });

      const messageHeader = createMockMessageHeader(29);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      // Should return UnsubPost, not UnsubWeb from embedded link
      expect(result).toBeInstanceOf(UnsubPost);
    });

    test('should prioritize list-unsubscribe header over embedded links', async () => {
      const fullMessage = createMockFullMessage({
        headers: {
          'list-unsubscribe': ['<https://header.example.com/unsubscribe>'],
        },
        contentType: 'text/html',
        body: '<a href="https://body.example.com/unsubscribe">Unsubscribe</a>',
      });

      const messageHeader = createMockMessageHeader(30);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeInstanceOf(UnsubWeb);
      expect(result.link.href).toBe('https://header.example.com/unsubscribe');
    });
  });

  describe('Security and validation', () => {
    test('should only accept http: and https: protocols for web unsubscribe', async () => {
      const protocols = ['ftp', 'file', 'data'];

      for (const protocol of protocols) {
        const fullMessage = createMockFullMessage({
          headers: {
            'list-unsubscribe': [`<${protocol}://example.com/unsubscribe>`],
          },
        });

        const messageHeader = createMockMessageHeader(32);

        messenger.messages.getFull.mockResolvedValue(fullMessage);
        messenger.messages.get.mockResolvedValue(messageHeader);

        const result = await searchUnsub(messageHeader);

        // Should not accept non-http(s) protocols
        if (result instanceof UnsubWeb) {
          expect(result.link.protocol).toMatch(/^https?:/);
        }
      }
    });
  });

  describe('Performance and limits', () => {
    test('should handle very long HTML bodies efficiently', async () => {
      // Create a large HTML body with unsubscribe link at the end
      const largeHtml =
        '<html><body>' +
        '<p>Content</p>'.repeat(10000) +
        '<a href="https://example.com/unsubscribe">Unsubscribe</a>' +
        '</body></html>';

      const fullMessage = createMockFullMessage({
        contentType: 'text/html',
        body: largeHtml,
      });

      const messageHeader = createMockMessageHeader(33);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const startTime = Date.now();
      const result = await searchUnsub(messageHeader);
      const endTime = Date.now();

      expect(result).toBeInstanceOf(UnsubWeb);
      // Should complete in reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    test('should handle multiple multipart levels', async () => {
      const fullMessage = createMockFullMessage({
        contentType: 'multipart/mixed',
        parts: [
          {
            contentType: 'multipart/alternative',
            parts: [
              {
                contentType: 'text/html',
                body: '<a href="https://example.com/unsubscribe">Unsubscribe</a>',
              },
            ],
          },
        ],
      });

      const messageHeader = createMockMessageHeader(34);

      messenger.messages.getFull.mockResolvedValue(fullMessage);
      messenger.messages.get.mockResolvedValue(messageHeader);

      const result = await searchUnsub(messageHeader);

      expect(result).toBeInstanceOf(UnsubWeb);
      expect(result.link.href).toBe('https://example.com/unsubscribe');
    });
  });
});
