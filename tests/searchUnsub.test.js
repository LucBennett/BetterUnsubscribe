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

describe('searchUnsub', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mock data before each test
  });

  test('should return UnsubWeb when a valid list-unsubscribe HTTPS link is found', async () => {
    // Mock the message with a valid 'list-unsubscribe' header containing an HTTPS link
    const fullMessage = {
      headers: {
        'list-unsubscribe': ['<https://unsubscribe.link/test>'],
      },
    };

    const messageHeader = {
      id: 1,
      subject: 'Test Subject',
      recipients: ['user1@example.com'],
      ccList: [],
      bccList: [],
      folder: { accountId: 'account1' },
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const result = await searchUnsub(messageHeader);

    expect(result).toBeInstanceOf(UnsubWeb);
    expect(result.link).toBe('https://unsubscribe.link/test');
  });

  test('should return UnsubMail when a valid mailto link is found', async () => {
    // Mock the message with a 'list-unsubscribe' header containing a mailto link
    const fullMessage = {
      headers: {
        'list-unsubscribe': ['<mailto:unsubscribe@test.com>'],
      },
    };

    const messageHeader = {
      id: 2,
      subject: 'Test Subject',
      recipients: ['user1@example.com'],
      ccList: [],
      bccList: [],
      folder: { accountId: 'account1' },
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    // Mock `retrieveIdentity` to return a valid identity
    //global.retrieveIdentity = jest.fn().mockResolvedValue({id: 'identity1', email: 'user1@example.com'});

    const result = await searchUnsub(messageHeader);

    expect(result).toBeInstanceOf(UnsubMail);
    expect(result.emailAddress).toBe('unsubscribe@test.com');
    expect(result.identity.id).toBe('identity1');
  });

  test('should return null when no unsubscribe information is found', async () => {
    // Mock a message without 'list-unsubscribe' header
    const fullMessage = {
      headers: {
        'other-header': ['value'],
      },
    };

    const messageHeader = {
      id: 3,
      subject: 'Test Subject',
      recipients: ['user3@example.com'],
      ccList: [],
      bccList: [],
      folder: { accountId: 'account3' },
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const result = await searchUnsub(messageHeader);

    expect(result).toBeNull();
  });

  test('should return null when an error occurs', async () => {
    const messageHeader = { id: 4, subject: 'Test Subject' };

    // Mock the messenger API to throw an error
    messenger.messages.getFull.mockRejectedValue(
      new Error('Failed to retrieve message')
    );

    await expect(searchUnsub(messageHeader)).rejects.toThrow(
      'Failed to retrieve message'
    );
  });

  test('should return UnsubWeb when an embedded unsubscribe link is found in HTML body', async () => {
    // Mock the message with HTML content containing an unsubscribe link
    const fullMessage = {
      contentType: 'text/html',
      body: '<a href="https://unsubscribe.example.com">Unsubscribe</a>',
      headers: {},
    };

    const messageHeader = {
      id: 5,
      subject: 'Test Subject',
      recipients: ['user4@example.com'],
      ccList: [],
      bccList: [],
      folder: { accountId: 'account4' },
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const result = await searchUnsub(messageHeader);

    // Normalize URLs by removing any trailing slashes
    const normalizeUrl = (url) => url.replace(/\/$/, '');

    expect(result).toBeInstanceOf(UnsubWeb);
    expect(normalizeUrl(result.link)).toBe(
      normalizeUrl('https://unsubscribe.example.com')
    );
  });

  test('should return UnsubPost when a valid list-unsubscribe-post header and HTTPS link are found', async () => {
    // Mock the message with 'list-unsubscribe' and 'list-unsubscribe-post' headers containing valid data
    const fullMessage = {
      headers: {
        'list-unsubscribe': ['<https://unsubscribe.postrequest.test>'],
        'list-unsubscribe-post': ['One-Click'],
      },
    };

    const messageHeader = {
      id: 6,
      subject: 'Test Subject',
      recipients: ['user5@example.com'],
      ccList: [],
      bccList: [],
      folder: { accountId: 'account5' },
    };

    // Mock the messenger methods to return the mocked fullMessage and messageHeader
    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const result = await searchUnsub(messageHeader);

    // Expect the result to be an instance of UnsubPost
    expect(result).toBeInstanceOf(UnsubPost);
    expect(result.weblink).toBe('https://unsubscribe.postrequest.test');
    expect(result.command).toBe('One-Click');
  });

  test('Test against db', async () => {
    let message =
      "Message-ID: <9309202.1075855690502.JavaMail.evans@thyme>\nDate: Mon, 26 Jun 2000 06:57:00 -0700 (PDT)\nFrom: phillip.allen@enron.com\nTo: keith.holst@enron.com\nSubject: Download Frogger before it hops away!\nMime-Version: 1.0\nContent-Type: text/plain; charset=us-ascii\nContent-Transfer-Encoding: 7bit\nX-From: Phillip K Allen\nX-To: Keith Holst\nX-cc: \nX-bcc: \nX-Folder: \\\\Phillip_Allen_Dec2000\\\notes Folders\\\\\\'sent mail\nX-Origin: Allen-P\nX-FileName: pallen.nsf\n\n---------------------- Forwarded by Phillip K Allen/HOU/ECT on 06/26/2000 \n01:57 PM ---------------------------\n\n\n\"the shockwave.com team\" <shockwave.com@shockwave.m0.net> on 06/23/2000 \n10:49:22 PM\nPlease respond to shockwave.com@shockwave.m0.net\nTo: pallen@enron.com\ncc:  \nSubject: Download Frogger before it hops away!\n\n\nDear Phillip,\n\nFrogger is leaving shockwave.com soon...\n\nSave it to your Shockmachine now! \n\nEvery frog has his day - games, too. Frogger had a great run as an \narcade classic, but it is leaving the shockwave.com pond soon. The \ngood news is that you can download it to your Shockmachine and \nown it forever! \n\nDon\\'t know about Shockmachine? You can download Shockmachine for free \nand save all of your downloadable favorites to play off-line, \nfull-screen, whenever you want. \n\nDownload Frogger by noon, PST on June 30th, while it\\'s still on \nthe site! \n\nthe shockwave.com team \n\n~~~~~~~~~~~~~~~~~~~~~~~~ \nUnsubscribe Instructions \n~~~~~~~~~~~~~~~~~~~~~~~~ \nSure you want to unsubscribe and stop receiving E-mail from us? All \nright... click here: \nhttp://shockwave1.m0.net/m/u/shk/s.asp?e=pallen%40enron.com\n\n\n\n\n#27279\n\n\n\n\n\n \n\n";
    const [messageHeader, fullMessage] = await parseMessage(message);
    // Mock the messenger methods to return the mocked fullMessage and messageHeader
    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const result = await searchUnsub(messageHeader);
    expect(result).toBeInstanceOf(UnsubWeb);
  });

  test('should find mailto link in list-unsubscribe header', async () => {
    const selectedMessage = {
      id: 1,
    };

    const fullMessage = {
      headers: {
        'list-unsubscribe': '<mailto:unsubscribe@example.com>',
      },
    };

    const messageHeader = {
      id: 1,
      bccList: [],
      ccList: [],
      recipients: ['user@example.com'],
    };

    const identities = [{ id: 'id1', email: 'user@example.com' }];

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);
    messenger.identities.list.mockResolvedValue(identities);

    const unsubMethod = await searchUnsub(selectedMessage);

    expect(unsubMethod).toBeInstanceOf(UnsubMail);
    expect(unsubMethod.emailAddress).toBe('unsubscribe@example.com');
    expect(unsubMethod.subject).toBe('unsubscribe');
  });

  test('should find https link in list-unsubscribe header', async () => {
    const selectedMessage = {
      id: 2,
    };

    const fullMessage = {
      headers: {
        'list-unsubscribe': '<https://example.com/unsubscribe>',
      },
    };

    const messageHeader = {
      id: 2,
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const unsubMethod = await searchUnsub(selectedMessage);

    expect(unsubMethod).toBeInstanceOf(UnsubWeb);
    expect(unsubMethod.link).toBe('https://example.com/unsubscribe');
  });

  test('should find UnsubPost method when list-unsubscribe-post header is present', async () => {
    const selectedMessage = {
      id: 3,
    };

    const fullMessage = {
      headers: {
        'list-unsubscribe':
          '<https://example.com/unsubscribe>, <mailto:unsubscribe@example.com>',
        'list-unsubscribe-post': ['List-Unsubscribe=One-Click'],
      },
    };

    const messageHeader = {
      id: 3,
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const unsubMethod = await searchUnsub(selectedMessage);

    expect(unsubMethod).toBeInstanceOf(UnsubPost);
    expect(unsubMethod.weblink).toBe('https://example.com/unsubscribe');
    expect(unsubMethod.command).toBe('List-Unsubscribe=One-Click');
  });

  test('should find embedded unsubscribe link in HTML body', async () => {
    const selectedMessage = {
      id: 4,
    };

    const fullMessage = {
      headers: {},
      contentType: 'multipart/alternative',
      parts: [
        {
          contentType: 'text/html',
          body: '<html><body>Click <a href="https://example.com/unsubscribe">here</a> to unsubscribe.</body></html>',
        },
      ],
    };

    const messageHeader = {
      id: 4,
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const unsubMethod = await searchUnsub(selectedMessage);

    expect(unsubMethod).toBeInstanceOf(UnsubWeb);
    expect(unsubMethod.link).toBe('https://example.com/unsubscribe');
  });

  test('should find embedded unsubscribe link in text body via regex', async () => {
    const selectedMessage = {
      id: 5,
    };

    const fullMessage = {
      headers: {},
      contentType: 'text/plain',
      body: 'If you wish to unsubscribe, please visit https://example.com/unsubscribe',
    };

    const messageHeader = {
      id: 5,
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const unsubMethod = await searchUnsub(selectedMessage);

    expect(unsubMethod).toBeInstanceOf(UnsubWeb);
    expect(unsubMethod.link).toBe('https://example.com/unsubscribe');
  });

  test('should return null if no unsubscribe method found', async () => {
    const selectedMessage = {
      id: 6,
    };

    const fullMessage = {
      headers: {},
      contentType: 'text/plain',
      body: 'This is a regular message with no unsubscribe link.',
    };

    const messageHeader = {
      id: 6,
    };

    messenger.messages.getFull.mockResolvedValue(fullMessage);
    messenger.messages.get.mockResolvedValue(messageHeader);

    const unsubMethod = await searchUnsub(selectedMessage);

    expect(unsubMethod).toBeNull();
  });
});
