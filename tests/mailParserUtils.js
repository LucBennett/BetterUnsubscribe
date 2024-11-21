const { simpleParser } = require('mailparser');

/**
 *
 * @param {String} text
 * @returns {Promise<[messenger.messages.MessageHeader, messenger.messages.MessagePart]>}
 */
async function parseMessage(text) {
  // Parse the email message
  const parsedEmail = await simpleParser(text, { skipTextLinks: true });

  // Helper function to get an array of email addresses
  function getAddressList(addressField) {
    if (!addressField || !Array.isArray(addressField.value)) {
      return [];
    }
    return addressField.value.map((addr) => addr.address);
  }

  // Generate a unique ID if needed
  function generateUniqueId() {
    return 'message-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  }

  // MessageHeader object (metadata)
  const messageHeader = {
    // The sender's email address in a string format
    author: parsedEmail.from ? parsedEmail.from.text : '',

    // An array of BCC email addresses
    bccList: getAddressList(parsedEmail.bcc),

    // An array of CC email addresses
    ccList: getAddressList(parsedEmail.cc),

    // The date the email was sent
    date: parsedEmail.date || null,

    // Indicates if the message is from an external source
    external: true, // Assuming emails are external

    // Indicates if the message is flagged
    flagged: false, // Set based on your logic

    // The folder where the email is stored (optional)
    folder: undefined, // Set if you have folder information

    // The Message-ID from the email headers
    headerMessageId: parsedEmail.messageId || '',

    // Indicates if only headers are available (no body)
    headersOnly: false, // We have the full message

    // A unique identifier for the message
    id: parsedEmail.messageId || generateUniqueId(),

    // Indicates if the message is marked as junk/spam
    junk: false, // Set based on your spam detection logic

    // The spam score of the message
    junkScore: 0, // Set based on your spam detection logic

    // Indicates if the message has been read
    read: false, // Modify based on your application's logic

    // Indicates if the message is new/unread
    new: true, // Assuming it's a new message

    // An array of recipient email addresses
    recipients: getAddressList(parsedEmail.to),

    // The size of the email in bytes
    size:
      parsedEmail.size ||
      Buffer.byteLength(parsedEmail.text || parsedEmail.html || '', 'utf8'),

    // The subject of the email
    subject: parsedEmail.subject || '',

    // An array of tags associated with the message
    tags: [], // Add tags if necessary
  };

  function parseLink(value) {
    let values = [];
    if (value.hasOwnProperty('url')) {
      values.push('<' + value.url + '>');
    }

    if (value.hasOwnProperty('mail')) {
      values.push('<mailto:' + value.mail + '>');
    }

    return values.join(', ');
  }

  function parseValue(key, value) {
    if (typeof value === 'string') {
      return value;
    } else if (Array.isArray(value)) {
      let out = [];
      for (let elem of value) {
        out.push(parseValue(key, elem));
      }
      return out;
    } else if (typeof value === 'object') {
      if (value.hasOwnProperty('value')) {
        return value.value;
      } else if (value.hasOwnProperty('text')) {
        return value.text;
      } else if (value.hasOwnProperty('url') || value.hasOwnProperty('mail')) {
        return parseLink(value);
      } else {
        return parseHeaders(key, value);
      }
    }
  }

  function parseHeaders(superKey, headersMap) {
    if (!(headersMap instanceof Map)) {
      headersMap = new Map(Object.entries(headersMap));
    }
    //console.log(headersMap);
    const headers = {};
    for (let [key, value] of headersMap) {
      //let value = headersMap[key];
      //console.log(key,typeof value);
      if (superKey) {
        key = superKey + '-' + key;
      }
      const result = parseValue(key, value);
      if (Array.isArray(result)) {
        headers[key] = result;
      } else if (typeof result === 'object') {
        Object.assign(headers, result);
      } else {
        headers[key] = result;
      }
    }
    return headers;
  }

  // Function to create MessagePart objects recursively
  function createMessagePart(part, partName = '1') {
    //console.log(part);
    let messagePart = {
      body: undefined,
      contentType: part.contentType || 'text/plain',
      decryptionStatus: 'none', // Assuming no encryption
      headers: {}, // Will be populated below
      name: part.filename || undefined,
      partName: partName,
      parts: [],
      size: part.size || Buffer.byteLength(part.content || '', 'utf8'),
    };

    // Populate headers
    if (part.headers && typeof part.headers.get === 'function') {
      messagePart.headers = parseHeaders('', part.headers);
    }

    // Determine if the part is an attachment
    if (part.disposition === 'attachment') {
      // It's an attachment
      messagePart.body = part.content.toString('base64');
      messagePart.contentType = part.contentType;
      messagePart.decryptionStatus = 'none'; // Adjust if decryption is involved
      messagePart.encoding = 'base64';
      messagePart.size = part.size;
    } else if (
      part.contentType === 'text/plain' ||
      part.contentType === 'text/html' ||
      part.contentType === 'multipart/mixed'
    ) {
      // It's the email body
      messagePart.body = part.content;
      messagePart.contentType = part.contentType;
    }

    // Handle multipart content
    if (part.childNodes && part.childNodes.length > 0) {
      messagePart.parts = [];
      part.childNodes.forEach((child, index) => {
        messagePart.parts.push(
          createMessagePart(child, `${partName}.${index + 1}`)
        );
      });
    }

    return messagePart;
  }

  // Construct the root message part
  const rootPart = {
    contentType: parsedEmail.mimeType || 'multipart/mixed',
    size:
      parsedEmail.size ||
      Buffer.byteLength(parsedEmail.text || parsedEmail.html || '', 'utf8'),
    content: parsedEmail.html || parsedEmail.text || '',
    disposition: 'inline',
    headers: parsedEmail.headers,
    childNodes: parsedEmail.attachments || [],
  };

  // Create the message part hierarchy
  const messagePart = createMessagePart(rootPart);

  return [messageHeader, messagePart];
}

module.exports = {
  parseMessage,
};
