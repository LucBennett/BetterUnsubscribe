const { simpleParser } = require('mailparser');

/**
 *
 * @param text
 * @returns {Promise<[messenger.messages.MessageHeader, messenger.messages.MessagePart]>}
 */
async function parseMessage(text) {
    // Replace escaped newlines with actual newlines
    const formattedMessage = text.replace(/\\n/g, '\n');

    // Parse the email message
    const parsedEmail = await simpleParser(formattedMessage);

    // MessageHeader object (metadata)
    const messageHeader = {
        author: parsedEmail.from ? parsedEmail.from.text : '',
        bccList: parsedEmail.bcc ? parsedEmail.bcc.map(bcc => bcc.text).join(', ') : '',
        ccList: parsedEmail.cc ? parsedEmail.cc.map(cc => cc.text).join(', ') : '',
        date: parsedEmail.date || null,
        external: true,
        flagged: false,
        folder: undefined,
        headerMessageId: parsedEmail.messageId || '',
        headersOnly: false,
        id: parsedEmail.messageId || '',
        junk: false,
        junkScore: 0,
        read: undefined, // You can modify this based on your logic if needed
        new: false,
        recipients: parsedEmail.to ? parsedEmail.to.text : '',
        size: parsedEmail.size || 0, // If available, otherwise you may calculate manually
        subject: parsedEmail.subject || '',
        tags: []
    };

    // MessagePart object (email body and attachments)
    const messagePart = {
        body: parsedEmail.html || parsedEmail.text || '',  // Use HTML if available, fallback to plain text
        contentType: parsedEmail.html ? 'text/html' : 'text/plain', // Determines if it's HTML or plain text
        decryptionStatus: 'none', // Set default to 'none', update if your logic requires it
        headers: Object.fromEntries(parsedEmail.headers.entries()), // Convert headers Map to a plain object
        name: undefined, // Only for attachments, we don't need it for the body part
        partName: 'body', // Part of the email (could be body, header, etc.)
        parts: parsedEmail.attachments.map(att => ({
            body: att.content.toString('base64'), // Assuming attachment body is a buffer, encode as base64
            contentType: att.contentType,
            decryptionStatus: 'none', // Attachments don't have decryption status unless encrypted
            headers: {}, // Attachments typically don't have headers in this context
            name: att.filename,
            partName: att.filename,
            size: att.size,
        })),
        size: parsedEmail.size || 0, // Size can be set based on the total size of the email
    };

    return [messageHeader, messagePart];
}

module.exports = {
    parseMessage
}