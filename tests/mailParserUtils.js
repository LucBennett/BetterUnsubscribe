/**
 * Mail Parser Utilities
 *
 * This module provides utilities for parsing raw email messages (RFC 822 format) into
 * Thunderbird WebExtension API-compatible data structures. It converts email text into
 * MessageHeader and MessagePart objects that match the Thunderbird API format.
 *
 * Primary Use Cases:
 * - Testing Thunderbird extensions with real email data
 * - Converting email corpus data (e.g., SpamAssassin) for test suites
 * - Parsing archived email messages for analysis
 *
 * Dependencies:
 * - mailparser: npm package for parsing RFC 822 email format
 *
 * @see https://webextension-api.thunderbird.net/en/latest/messages.html
 * @see https://nodemailer.com/extras/mailparser/
 */

const { simpleParser } = require('mailparser');

/**
 * Parse a raw email message into Thunderbird API-compatible structures
 *
 * This function takes a raw email string (including headers and body) and converts it
 * into MessageHeader and MessagePart objects that match the Thunderbird WebExtension API
 * format. This is particularly useful for testing and working with archived emails.
 *
 * @param {string} text - Raw email message text in RFC 822 format
 * @returns {Promise<[MessageHeader, MessagePart]>} Tuple of [messageHeader, messagePart]
 *
 * @throws {Error} If the email cannot be parsed
 *
 * @example
 * const rawEmail = `From: sender@example.com
 * To: recipient@example.com
 * Subject: Test Email
 *
 * This is the email body.`;
 *
 * const [header, part] = await parseMessage(rawEmail);
 * console.log(header.subject); // "Test Email"
 * console.log(part.body); // "This is the email body."
 *
 * @typedef {Object} MessageHeader
 * @property {string} author - Sender's email address
 * @property {string[]} bccList - BCC recipients
 * @property {string[]} ccList - CC recipients
 * @property {Date|null} date - When the email was sent
 * @property {boolean} external - Whether message is from external source
 * @property {boolean} flagged - Whether message is flagged/starred
 * @property {Object|undefined} folder - Folder information (if available)
 * @property {string} headerMessageId - RFC 822 Message-ID header
 * @property {boolean} headersOnly - Whether only headers are available
 * @property {string|number} id - Unique identifier for this message
 * @property {boolean} junk - Whether message is marked as spam
 * @property {number} junkScore - Spam score (0-100)
 * @property {boolean} read - Whether message has been read
 * @property {boolean} new - Whether message is new/unread
 * @property {string[]} recipients - To recipients
 * @property {number} size - Message size in bytes
 * @property {string} subject - Email subject line
 * @property {string[]} tags - Associated tags
 *
 * @typedef {Object} MessagePart
 * @property {string|undefined} body - Part content (text or base64 for attachments)
 * @property {string} contentType - MIME content type
 * @property {string} decryptionStatus - Encryption status ('none', 'decrypted', etc.)
 * @property {Object} headers - Part-specific headers
 * @property {string|undefined} name - Attachment filename (if applicable)
 * @property {string} partName - Part identifier (e.g., "1", "1.1", "1.2")
 * @property {MessagePart[]} parts - Child parts for multipart messages
 * @property {number} size - Part size in bytes
 * @property {string} [encoding] - Content encoding for attachments
 */
async function parseMessage(text) {
  // Parse the raw email using mailparser
  const parsedEmail = await simpleParser(text, { skipTextLinks: true });

  // Create MessageHeader from parsed email
  const messageHeader = createMessageHeader(parsedEmail);

  // Create MessagePart hierarchy from parsed email
  const messagePart = createMessagePart(parsedEmail);

  return [messageHeader, messagePart];
}

/**
 * Create a MessageHeader object from parsed email data
 *
 * Converts mailparser's parsed email format into Thunderbird's MessageHeader format,
 * providing all metadata about the email message.
 *
 * @param {Object} parsedEmail - Email object from mailparser's simpleParser
 * @returns {MessageHeader} Thunderbird-compatible message header
 * @private
 */
function createMessageHeader(parsedEmail) {
  return {
    // Sender information
    author: extractAuthor(parsedEmail.from),

    // Recipient lists
    bccList: extractAddressList(parsedEmail.bcc),
    ccList: extractAddressList(parsedEmail.cc),
    recipients: extractAddressList(parsedEmail.to),

    // Temporal information
    date: parsedEmail.date || null,

    // Flags and status
    external: true, // Parsed emails are considered external
    flagged: false,
    junk: false,
    junkScore: 0,
    read: false,
    new: true,

    // Folder information (undefined for parsed emails)
    folder: undefined,

    // Message identification
    headerMessageId: parsedEmail.messageId || '',
    id: parsedEmail.messageId || generateUniqueId(),

    // Metadata
    headersOnly: false,
    size: calculateMessageSize(parsedEmail),
    subject: parsedEmail.subject || '',
    tags: [],
  };
}

/**
 * Extract author email address from parsed email
 *
 * @param {Object|undefined} fromField - From field from mailparser
 * @returns {string} Author email address or empty string
 * @private
 */
function extractAuthor(fromField) {
  if (!fromField) {
    return '';
  }

  // Handle both text format and structured format
  if (typeof fromField.text === 'string') {
    return fromField.text;
  }

  if (fromField.value && Array.isArray(fromField.value) && fromField.value[0]) {
    return fromField.value[0].address || '';
  }

  return '';
}

/**
 * Extract an array of email addresses from an address field
 *
 * @param {Object|undefined} addressField - Address field from mailparser (to/cc/bcc)
 * @returns {string[]} Array of email addresses
 * @private
 *
 * @example
 * // Input: { value: [{ address: 'user1@example.com' }, { address: 'user2@example.com' }] }
 * // Output: ['user1@example.com', 'user2@example.com']
 */
function extractAddressList(addressField) {
  if (!addressField || !Array.isArray(addressField.value)) {
    return [];
  }

  return addressField.value
    .map((addr) => addr.address)
    .filter((address) => address); // Filter out any undefined/null addresses
}

/**
 * Generate a unique message ID
 *
 * Creates a unique identifier when the email doesn't have a Message-ID header.
 * Uses timestamp and random number to ensure uniqueness across test runs.
 *
 * @returns {string} Unique message identifier
 * @private
 *
 * @example
 * // Returns: "message-1698765432123-456"
 */
function generateUniqueId() {
  return `message-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Calculate the size of a message in bytes
 *
 * @param {Object} parsedEmail - Parsed email from mailparser
 * @returns {number} Message size in bytes
 * @private
 */
function calculateMessageSize(parsedEmail) {
  if (parsedEmail.size) {
    return parsedEmail.size;
  }

  // Calculate size from content
  const content = parsedEmail.text || parsedEmail.html || '';
  return Buffer.byteLength(content, 'utf8');
}

/**
 * Create a MessagePart hierarchy from parsed email data
 *
 * Converts the parsed email into a tree structure of MessagePart objects that
 * matches Thunderbird's format. Handles multipart messages, attachments, and
 * nested parts recursively.
 *
 * @param {Object} parsedEmail - Email object from mailparser's simpleParser
 * @returns {MessagePart} Root message part with nested parts
 * @private
 */
function createMessagePart(parsedEmail) {
  // Create root part structure
  const rootPart = {
    contentType: parsedEmail.mimeType || 'multipart/mixed',
    size: calculateMessageSize(parsedEmail),
    content: parsedEmail.html || parsedEmail.text || '',
    disposition: 'inline',
    headers: parsedEmail.headers,
    childNodes: parsedEmail.attachments || [],
  };

  // Build the message part hierarchy recursively
  return buildMessagePart(rootPart, '1');
}

/**
 * Recursively build a MessagePart object from a parsed email part
 *
 * This function creates a single MessagePart and recursively processes any child
 * parts (for multipart messages). It handles both regular content parts and
 * attachments differently.
 *
 * @param {Object} part - Email part object from mailparser
 * @param {string} partName - Part identifier in Thunderbird's numbering scheme
 * @returns {MessagePart} Message part object
 * @private
 */
function buildMessagePart(part, partName = '1') {
  const messagePart = {
    body: undefined,
    contentType: part.contentType || 'text/plain',
    decryptionStatus: 'none',
    headers: {},
    name: part.filename || undefined,
    partName: partName,
    parts: [],
    size: part.size || Buffer.byteLength(part.content || '', 'utf8'),
  };

  // Parse and populate headers if available
  if (part.headers && typeof part.headers.get === 'function') {
    messagePart.headers = parseHeaders('', part.headers);
  }

  // Handle attachments differently from inline content
  if (part.disposition === 'attachment') {
    populateAttachmentPart(messagePart, part);
  } else if (isTextContent(part.contentType)) {
    populateTextPart(messagePart, part);
  }

  // Recursively process child parts (for multipart messages)
  if (part.childNodes && part.childNodes.length > 0) {
    messagePart.parts = part.childNodes.map((child, index) =>
      buildMessagePart(child, `${partName}.${index + 1}`)
    );
  }

  return messagePart;
}

/**
 * Check if a content type represents text content
 *
 * @param {string} contentType - MIME content type
 * @returns {boolean} True if content type is text-based
 * @private
 */
function isTextContent(contentType) {
  if (!contentType) {
    return false;
  }

  const textTypes = [
    'text/plain',
    'text/html',
    'multipart/mixed',
    'multipart/alternative',
  ];
  return textTypes.some((type) => contentType.includes(type));
}

/**
 * Populate a MessagePart with attachment data
 *
 * @param {MessagePart} messagePart - Message part to populate
 * @param {Object} part - Source part data from mailparser
 * @private
 */
function populateAttachmentPart(messagePart, part) {
  messagePart.body = part.content ? part.content.toString('base64') : '';
  messagePart.contentType = part.contentType || 'application/octet-stream';
  messagePart.encoding = 'base64';
  messagePart.size = part.size || 0;
}

/**
 * Populate a MessagePart with text/HTML content
 *
 * @param {MessagePart} messagePart - Message part to populate
 * @param {Object} part - Source part data from mailparser
 * @private
 */
function populateTextPart(messagePart, part) {
  messagePart.body = part.content || '';
  messagePart.contentType = part.contentType || 'text/plain';
}

/**
 * Parse email headers into a normalized format
 *
 * Converts mailparser's header format into a flat object structure that matches
 * Thunderbird's expectations. Handles nested headers and various value types.
 *
 * @param {string} superKey - Parent key for nested headers
 * @param {Map|Object} headersMap - Headers map from mailparser
 * @returns {Object} Normalized headers object
 * @private
 */
function parseHeaders(superKey, headersMap) {
  // Convert to Map if needed
  if (!(headersMap instanceof Map)) {
    headersMap = new Map(Object.entries(headersMap));
  }

  const headers = {};

  for (const [key, value] of headersMap) {
    // Skip internal 'name' property
    if (key === 'name') {
      return value;
    }

    // Construct full key with parent prefix
    const fullKey = superKey ? `${superKey}-${key}` : key;

    // Parse the value recursively
    const result = parseHeaderValue(fullKey, value);

    // Add to headers object
    if (Array.isArray(result)) {
      headers[fullKey] = result;
    } else if (typeof result === 'object' && result !== null) {
      // Merge nested objects
      Object.assign(headers, result);
    } else if (result !== null) {
      headers[fullKey] = result;
    }
  }

  return headers;
}

/**
 * Parse a header value recursively
 *
 * Handles various header value formats including strings, arrays, objects,
 * and special link formats (URLs and email addresses).
 *
 * @param {string} key - Header key
 * @param {*} value - Header value (any type)
 * @returns {string|string[]|Object|null} Parsed value
 * @private
 */
function parseHeaderValue(key, value) {
  // Handle string values directly
  if (typeof value === 'string') {
    return value;
  }

  // Handle arrays recursively
  if (Array.isArray(value)) {
    return value
      .map((elem) => parseHeaderValue(key, elem))
      .filter((v) => v !== null);
  }

  // Handle objects
  if (typeof value === 'object' && value !== null) {
    // Extract common value patterns
    if ('value' in value) {
      return value.value;
    }

    if ('text' in value) {
      return value.text;
    }

    // Handle link objects (URLs and mailto)
    if ('url' in value || 'mail' in value) {
      return formatLinkValue(value);
    }

    // Recursively parse nested objects
    return parseHeaders(key, value);
  }

  return null;
}

/**
 * Format a link value (URL or mailto) into RFC 2369 format
 *
 * Converts link objects into angle-bracketed format used in headers like
 * List-Unsubscribe: <https://example.com>, <mailto:unsub@example.com>
 *
 * @param {Object} linkValue - Object with 'url' and/or 'mail' properties
 * @returns {string} Formatted link string
 * @private
 *
 * @example
 * formatLinkValue({ url: 'https://example.com' })
 * // Returns: "<https://example.com>"
 *
 * formatLinkValue({ url: 'https://example.com', mail: 'unsub@example.com' })
 * // Returns: "<https://example.com>, <mailto:unsub@example.com>"
 */
function formatLinkValue(linkValue) {
  const links = [];

  if (linkValue.url) {
    links.push(`<${linkValue.url}>`);
  }

  if (linkValue.mail) {
    links.push(`<mailto:${linkValue.mail}>`);
  }

  return links.join(', ');
}

/**
 * Validate a raw email message before parsing
 *
 * Performs basic validation to ensure the input is suitable for parsing.
 * Helps provide better error messages for common issues.
 *
 * @param {string} text - Raw email text to validate
 * @throws {Error} If validation fails
 * @private
 */
function validateEmailText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Email text must be a non-empty string');
  }

  if (text.trim().length === 0) {
    throw new Error('Email text cannot be empty or only whitespace');
  }

  // Check for basic email structure (headers exist)
  if (!text.includes(':')) {
    throw new Error('Invalid email format: no headers found');
  }
}

/**
 * Parse a raw email message into Thunderbird API-compatible structures (with validation)
 *
 * This is the main exported function with input validation. It wraps the core
 * parseMessage functionality with error handling and validation.
 *
 * @param {string} text - Raw email message text in RFC 822 format
 * @returns {Promise<[MessageHeader, MessagePart]>} Tuple of [messageHeader, messagePart]
 * @throws {Error} If the email cannot be parsed or is invalid
 */
async function parseMessageSafe(text) {
  validateEmailText(text);

  try {
    return await parseMessage(text);
  } catch (error) {
    throw new Error(`Failed to parse email: ${error.message}`);
  }
}

/**
 * Export both the direct and safe parsing functions
 *
 * - parseMessage: Direct parsing without validation (faster, for trusted input)
 * - parseMessageSafe: With validation and better error messages (for untrusted input)
 */
module.exports = {
  parseMessage,
  parseMessageSafe,
};
