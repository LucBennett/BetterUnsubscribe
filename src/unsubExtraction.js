/**
 * Extracts unsubscribe links and sender identities from a Thunderbird
 * message: parsing the `List-Unsubscribe` header, and - when no header is
 * present - scanning the HTML or plain-text body for an embedded
 * unsubscribe link near the word "unsubscribe".
 */

/* global createLogger --
   provided by common.js, loaded earlier in manifest.json's background scripts */

// In a Node.js environment, pull in this file's dependency so it resolves
// the same way it does in the browser, where all background scripts listed
// in manifest.json's "background.scripts" share one global scope.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  Object.assign(globalThis, require('./common.js'));
}

const { log: console_log } = createLogger('unsubExtraction.js');

/**
 * Extracts an HTTPS link from the unsubscribe header.
 * @param {string} header - The unsubscribe header containing the URL.
 * @returns {URL|null} - The extracted HTTPS link if found, otherwise null.
 */
function extractHttpsLink(header) {
  const httpsLinkMatch = header.match(/<(https?:\/\/[^>]+)>/);
  return httpsLinkMatch ? new URL(httpsLinkMatch[1]) : null;
}

/**
 * Extracts a mailto link from the unsubscribe header.
 * @param {string} header - The unsubscribe header containing the mailto link.
 * @returns {URL|null} - The extracted mailto link if found, otherwise null.
 */
function extractMailtoLink(header) {
  const emailMatch = header.match(/<(mailto:[^>]+)>/i);
  if (emailMatch) {
    return new URL(emailMatch[1].replace(/^mailto:\/*/, 'mailto:'));
  }
  return null;
}

/**
 * Retrieves the MailIdentity associated with the given email's receiver.
 * @param {messenger.messages.MessageHeader} messageHeader - The message header to search for identities.
 * @returns {Promise<MailIdentity|null>} - The MailIdentity if found, otherwise null.
 */
async function retrieveIdentity(messageHeader) {
  let identity = await getIdentityReceiver(messageHeader);

  if (identity === null) {
    identity = await getIdentityForMessage(messageHeader);
    if (identity === null) {
      const identities = await messenger.identities.list();
      if (identities.length !== 0) {
        identity = identities[0];
      }
    }
  }

  if (!identity) {
    console_log('No identity found for', messageHeader);
  }

  return identity || null; // Return null if no identity is found
}

/**
 * Source pattern for matching "unsubscribe" in common variants.
 *
 * Used to detect unsubscribe text both in visible message content and in link URLs.
 * Kept as a string so we can compile multiple RegExp instances with different flags.
 *
 * Pattern notes:
 * - `\\b` word boundaries reduce false positives inside longer words.
 * - `\\W?` allows a single separator (e.g., "un-subscribe", "un subscribe").
 * - Matches "unsubscribe", "unsubscribing", and "unsubscription".
 *
 * @type {string}
 */
const unsubscribeRegexString = '\\bun\\W?(?:subscri(?:be|bing|ption))\\b';

/**
 * Global, case-insensitive matcher for locating *all* occurrences of unsubscribe text.
 * Used with `String.prototype.matchAll()` to compute proximity to URLs.
 *
 * @type {RegExp}
 */
const unsubscribeRegex = new RegExp(unsubscribeRegexString, 'gi');

/**
 * Case-insensitive *test* matcher for identifying nodes/links that mention unsubscribe.
 * Intentionally non-global to avoid statefulness issues when calling `.test()` repeatedly.
 *
 * @type {RegExp}
 */
const unsubscribeRegexTest = new RegExp(unsubscribeRegexString, 'i');

/**
 * Source pattern for matching HTTP(S) URLs in message text.
 *
 * This is intentionally conservative:
 * - avoids whitespace and common HTML delimiters
 * - caps length to avoid pathological matches
 *
 * @type {string}
 */
const urlRegexString = 'https?:\\/\\/[^\\s"\'<>]{1,1000}';

/**
 * Global, case-insensitive matcher for extracting *all* URLs from message text.
 * Used with `String.prototype.matchAll()` when computing the closest URL to "unsubscribe".
 *
 * @type {RegExp}
 */
const urlRegex = new RegExp(urlRegexString, 'gi');

/**
 * Case-insensitive *test* matcher for quickly checking whether a message contains any URL.
 * Intentionally non-global to avoid statefulness issues when calling `.test()` repeatedly.
 *
 * @type {RegExp}
 */
const urlRegexTest = new RegExp(urlRegexString, 'i');

const TEXT_NODE = (typeof Node !== 'undefined' && Node.TEXT_NODE) || 3;
const ELEMENT_NODE = (typeof Node !== 'undefined' && Node.ELEMENT_NODE) || 1;

/**
 * Recursively collects text nodes and anchor elements whose content matches a regex.
 *
 * @param {Node} element - Root element/node to search under.
 * @param {RegExp} regex - Pattern to test against text node content and anchor hrefs.
 * @param {Node[]} [results=[]] - Accumulator for matches (used for recursion).
 * @returns {Node[]} Array of matching text nodes and anchor elements.
 */
function findNodesMatchingRegex(element, regex, results = []) {
  for (const node of element.childNodes) {
    if (node.nodeType === TEXT_NODE && regex.test(node.textContent)) {
      results.push(node);
    } else if (node.nodeType === ELEMENT_NODE) {
      // Check if it's an anchor with matching href
      if (node.tagName === 'A' && node.href && regex.test(node.href)) {
        results.push(node);
      }
      findNodesMatchingRegex(node, regex, results);
    }
  }

  return results;
}

/**
 * Builds a DOM-order index for all nodes under a given root.
 *
 * This is used to compute "closeness" between a text node containing "unsubscribe"
 * and nearby anchors when multiple candidate links exist.
 *
 * @param {Node} root - Root node to traverse.
 * @returns {WeakMap<Node, number>} A WeakMap from node -> traversal index.
 */
function createNodeIndexMap(root) {
  let i = 0;
  const map = new WeakMap();

  // Manual tree traversal instead of createTreeWalker
  function traverse(node) {
    map.set(node, i++);
    for (const child of node.childNodes) {
      traverse(child);
    }
  }

  traverse(root);
  return map;
}

/**
 * Walks up the DOM tree looking for an ancestor that contains one or more anchor tags.
 *
 * @param {Element|null} element - Starting element (typically the parent of a matching text node).
 * @param {number} [maxDepth=5] - Maximum number of parent hops before giving up.
 * @returns {{ancestor: Element, links: NodeListOf<Element>}|null}
 *          Object containing the ancestor and its links, or null if none found.
 */
function searchAncestorForLinks(element, maxDepth = 5) {
  if (maxDepth < 0 || !element) {
    return null;
  }
  const links = element.querySelectorAll('a[href]');
  if (links.length > 0) {
    return { ancestor: element, links: links };
  }

  return searchAncestorForLinks(element.parentElement, maxDepth - 1);
}

/** Max dom traversal distance allowed between text match and anchor */
const MAX_DOM_DISTANCE = 10;

/**
 * Finds embedded unsubscribe links within the message body using HTML parsing and proximity-based ancestor search.
 *
 * Strategy:
 * - Parse HTML bodies
 * - locate anchor tags that match {@link unsubscribeRegexTest}.
 * - locate text nodes that match {@link unsubscribeRegexTest}.
 *   - For each matching text node, walk up the DOM a few levels looking for nearby <a> tags.
 *   - If multiple links exist in the ancestor, choose the one closest (in DOM order) to the text node.
 * @param {messenger.messages.MessagePart} messagePart - The message part to search for embedded links.
 * @returns {URL|null} - The embedded link if found, otherwise null.
 */
function findEmbeddedUnsubLinkHTML(messagePart) {
  if (messagePart && messagePart.contentType === 'text/html') {
    const parser = new DOMParser();
    const document = parser.parseFromString(messagePart.body, 'text/html');

    const order = createNodeIndexMap(document.body);
    const results = findNodesMatchingRegex(document.body, unsubscribeRegexTest);

    for (const result of results) {
      // If it's already an anchor element with matching href, return it directly
      if (result.nodeType === ELEMENT_NODE && result.tagName === 'A') {
        return new URL(result.href);
      }

      // Otherwise, it's a text node - search for nearby links
      const obj = searchAncestorForLinks(result.parentElement);
      if (obj) {
        const t = order.get(result);
        let best = null;
        let bestDist = Infinity;

        for (const a of obj.links) {
          const d = Math.abs(order.get(a) - t);
          if (d < bestDist) {
            bestDist = d;
            best = a;
          }
        }
        console_log('Best Distance', bestDist);

        if (bestDist > MAX_DOM_DISTANCE) {
          continue; // Skip this result, it's too far away
        }

        return new URL(best.href);
      }
    }
  }

  if (messagePart && messagePart.parts) {
    for (const part of messagePart.parts) {
      const embeddedLink = findEmbeddedUnsubLinkHTML(part);
      if (embeddedLink) {
        return embeddedLink;
      }
    }
  }

  return null; // No embedded link found
}

/** Max character distance allowed between text match and url */
const MAX_CHARACTER_DISTANCE = 300;

/**
 * Finds the URL closest to any occurrence of "unsubscribe" text in the message.
 * @param {messenger.messages.MessagePart} messagePart - The message part to search.
 * @returns {URL|null} - The closest unsubscribe link if found, otherwise null.
 */
function findEmbeddedUnsubLinkRegex(messagePart) {
  const body = extractBody(messagePart);
  if (!body) return null;

  // Find all occurrences of "unsubscribe" (case-insensitive)
  const unsubscribeMatches = [...body.matchAll(unsubscribeRegex)];
  const urlMatches = [...body.matchAll(urlRegex)];

  if (unsubscribeMatches.length === 0 || urlMatches.length === 0) {
    return null;
  }

  let closestUrl = null;
  let minDistance = Infinity;

  // For each unsubscribe occurrence, find the closest URL
  for (const unsubMatch of unsubscribeMatches) {
    const unsubPos = unsubMatch.index;
    const unsubEnd = unsubPos + unsubMatch[0].length;

    for (const urlMatch of urlMatches) {
      const urlPos = urlMatch.index;
      const urlEnd = urlPos + urlMatch[0].length;

      // Calculate distance (from either end of the URL to the unsubscribe text)
      let distance;
      if (urlPos > unsubPos) {
        distance = urlPos - unsubEnd;
      } else {
        distance = unsubPos - urlEnd;
        // Note: distance can be negative if 'unsubscribe' is in url
      }

      if (distance < minDistance && distance <= MAX_CHARACTER_DISTANCE) {
        minDistance = distance;
        closestUrl = urlMatch[0];
      }
    }
  }

  return closestUrl ? new URL(closestUrl) : null;
}

/**
 * Recursively extracts and concatenates all body text from message parts.
 * @param {messenger.messages.MessagePart} messagePart - The message part.
 * @returns {string|null} - Combined body text.
 */
function extractBody(messagePart) {
  let bodyText = '';

  if (messagePart && messagePart.body) {
    bodyText += messagePart.body;
  }

  if (messagePart && messagePart.parts) {
    for (const part of messagePart.parts) {
      const partBody = extractBody(part);
      if (partBody) {
        bodyText += ' ' + partBody;
      }
    }
  }

  return bodyText || null;
}

/**
 * Retrieves the MailIdentity associated with the given email headers receiver.
 * This function checks the BCC, CC, and recipient lists to find a matching identity.
 * @param {messenger.messages.MessageHeader} messageHeader - The MessageHeader associated with the message.
 * @returns {Promise<MailIdentity|null>} - The MailIdentity if found, otherwise null.
 */
async function getIdentityReceiver(messageHeader) {
  const allReceivers = new Set([
    ...messageHeader.bccList,
    ...messageHeader.ccList,
    ...messageHeader.recipients,
  ]);

  const identities = await messenger.identities.list();

  for (const identity of identities) {
    if (allReceivers.has(identity.email)) {
      return identity;
    }
  }

  return null; // Return null if no matching identity is found
}

/**
 * Retrieves the MailIdentity associated with the given message's folder.
 * This function iterates over accounts to match identities based on the folder's account ID.
 * @param {messenger.messages.MessageHeader} messageHeader - The MessageHeader associated with the message.
 * @returns {Promise<MailIdentity|null>} - The MailIdentity if found, otherwise null.
 */
async function getIdentityForMessage(messageHeader) {
  // Early return if no folder is present
  if (!messageHeader.folder) {
    return null;
  }

  const folder = messageHeader.folder;
  const accounts = await messenger.accounts.list();

  // Find the account that matches the folder's accountId
  const matchingAccount = accounts.find(
    (account) => account.id === folder.accountId
  );

  // Return the first identity of the matching account, or null if no match
  return matchingAccount?.identities?.[0] ?? null;
}

// Export module functions for testing if in a Node.js environment
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    extractHttpsLink,
    extractMailtoLink,
    retrieveIdentity,
    getIdentityReceiver,
    getIdentityForMessage,
    findEmbeddedUnsubLinkHTML,
    findEmbeddedUnsubLinkRegex,
    extractBody,
    unsubscribeRegexTest,
    urlRegexTest,
  };
}
