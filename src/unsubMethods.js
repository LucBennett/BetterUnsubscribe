/* global createLogger --
   provided by common.js, loaded earlier in manifest.json's background scripts */

// In a Node.js environment, pull in this file's dependency so it resolves
// the same way it does in the browser, where all background scripts listed
// in manifest.json's "background.scripts" share one global scope.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  Object.assign(globalThis, require('./common.js'));
}

const { log: console_log } = createLogger('unsubMethods.js');

/**
 * Default settings for BetterUnsubscribe
 */
const DEFAULT_SETTINGS = {
  autoSendEmail: false, // Don't automatically send emails by default
  confirmRules: [], // No confirmation rules by default
};

/**
 * Base class for different unsubscribe methods.
 * This class is extended by specific unsubscribe action implementations.
 */
class UnsubMethod {
  /**
   * Method to be implemented by subclasses to execute the unsubscribe action.
   * @throws {Error} - If the method is not implemented by a subclass.
   */
  async call() {
    throw new Error('Method call() must be implemented by subclasses');
  }

  /**
   * Method to get details of the unsubscribe method (e.g., type, address).
   * Must be implemented by subclasses.
   * @throws {Error} - If the method is not implemented by a subclass.
   */
  getMethodDetails() {
    throw new Error(
      'Method getMethodDetails() must be implemented by subclasses'
    );
  }
}

/**
 * Class for unsubscribing via a POST request.
 * This class handles the logic for making POST requests to specified URLs for unsubscription.
 */
class UnsubPost extends UnsubMethod {
  /**
   * Constructor for UnsubPost.
   * @param {URL} weblink - The web link to send the POST request to.
   */
  constructor(weblink) {
    super();
    this.weblink = weblink;
  }

  /**
   * Executes the unsubscribe action via an HTTP POST request.
   *
   * Implements the RFC 8058 "One-Click Unsubscribe" mechanism:
   * sends a POST request to the provided URL with a form body of
   * `List-Unsubscribe=One-Click`.
   *
   * If the request completes with a non-2xx status code or the fetch
   * operation fails, this method throws an {@link Error} describing
   * the reason.
   *
   * @async
   * @throws {Error} If the network request fails or the server responds
   *         with a non-OK status code.
   * @returns {Promise<void>} Resolves when the unsubscribe request
   *          succeeds (HTTP 2xx response).
   */
  async call() {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
    };

    console_log('Fetch Options', fetchOptions);

    const response = await fetch(this.weblink, fetchOptions);
    if (!response.ok) {
      throw new Error(`Response not ok. Status: ${response.status}`);
    }
    console_log('Response', response);
  }

  /**
   * Returns details of the unsubscribe method.
   * @returns {any} - Method details, including type and address.
   */
  getMethodDetails() {
    return { method: 'Post', address: this.weblink.href };
  }
}

/**
 * Class for unsubscribing via an email.
 * This class handles composing and sending an unsubscribe email.
 */
class UnsubMail extends UnsubMethod {
  /**
   * Constructor for UnsubMail.
   * @param {MailIdentity} identity - The identity for the email.
   * @param {URL} email - The email address to send the unsubscribe request to.
   */
  constructor(identity, email) {
    super();
    this.identity = identity;
    this.email = email;
  }

  /**
   * Executes the unsubscribe action by sending an email message.
   *
   * Opens a compose window using the Thunderbird Compose API,
   * pre-filled with the standard "unsubscribe" subject and body.
   *
   * If the user's settings enable automatic sending, the message is
   * sent immediately once the compose window becomes sendable.
   * Otherwise, the compose window is left open for user review.
   *
   * The target address and optional subject line are extracted from
   * the `mailto:` URL supplied in the `List-Unsubscribe` header.
   *
   * If message composition or sending fails, this method throws an
   * {@link Error} describing the failure.
   *
   * @async
   * @throws {Error} If the compose window cannot be created or the
   *         message send operation fails.
   * @returns {Promise<void>} Resolves once the unsubscribe email
   *          has been successfully sent.
   */
  async call() {
    let details = {
      to: this.email.pathname,
      subject: this.email.searchParams.has('subject')
        ? this.email.searchParams.get('subject')
        : 'unsubscribe',
      body: this.email.searchParams.has('body')
        ? this.email.searchParams.get('body')
        : 'Please unsubscribe me from your mailing list. Thank you.',
    };

    if (this.identity) {
      details.identityId = this.identity.id;
    }

    const composeTab = await messenger.compose.beginNew(details);

    const settings = await messenger.storage.local.get(DEFAULT_SETTINGS);
    console_log('Loaded settings:', settings);

    let state;
    if (settings.autoSendEmail === true) {
      // Wait until Thunderbird says this compose window can actually send.
      for (let i = 0; i < 30; i++) {
        // 3 seconds
        state = await messenger.compose.getComposeState(composeTab.id);
        if (state?.canSendNow) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!state?.canSendNow) {
        throw new Error('Compose window did not become sendable.');
      }

      const sendMessageResult = await messenger.compose.sendMessage(
        composeTab.id,
        { mode: 'sendNow' }
      );

      if (typeof sendMessageResult.headerMessageId == 'undefined') {
        throw new Error('Message send did not return a headerMessageId.');
      }
    }
  }

  /**
   * Returns details of the unsubscribe method.
   * @returns {any} - Method details, including type and address.
   */
  getMethodDetails() {
    return { method: 'Email', address: this.email.pathname };
  }
}

/**
 * Class for unsubscribing via a web link.
 * This class handles opening a web page for unsubscription.
 */
class UnsubWeb extends UnsubMethod {
  /**
   * Constructor for UnsubWeb.
   * @param {URL} link - The web link to visit for unsubscribing.
   */
  constructor(link) {
    super();
    this.link = link;
  }

  /**
   * Executes the unsubscribe action by opening the sender's
   * unsubscribe web page in a popup browser window.
   *
   * This follows the RFC 2369 "List-Unsubscribe" web-link mechanism.
   * No network request is made automatically; the user completes
   * the process manually in the opened window.
   *
   * Throws an {@link Error} if the window cannot be created.
   *
   * @async
   * @throws {Error} If the popup window cannot be opened (for example,
   *         due to permissions or browser restrictions).
   * @returns {Promise<void>} Resolves once the popup window has been
   *          successfully opened.
   */
  async call() {
    await messenger.windows.create({
      url: this.link.href,
      type: 'popup',
    });
  }

  /**
   * Returns details of the unsubscribe method.
   * @returns {any} - Method details, including type and address.
   */
  getMethodDetails() {
    return { method: 'Browser', address: this.link.href };
  }
}

// Export module functions and classes for testing if in a Node.js environment
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    UnsubMethod,
    UnsubPost,
    UnsubMail,
    UnsubWeb,
  };
}
