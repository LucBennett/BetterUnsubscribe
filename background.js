let storedUnsub; //function with an object which stores the parameters

/**
 * opens dialog for user to confirm unsub action
 */
browser.messageDisplayAction.onClicked.addListener(async (tab) => {
  //Create Popup and wait for response


  let rv = await createPopup(messenger.i18n.getMessage("unsubPopup")
    , { yes: true, no: true });
  //If you want to continue
  if (rv === "yes") {
    storedUnsub();
  }

});

/**
 * triggers when selected mail is changed
 */
browser.mailTabs.onSelectedMessagesChanged.addListener(async (tab, messageList) => {

  searchForUnsub(messageList)

});

/**
 * triggers search for unsubscribe funktions and displays a button, if a matching option is found
 * @param {currently selected emails} messageList 
 */
async function searchForUnsub(messageList) {
  //If more than one message is selected
  if (messageList.messages.length > 1) {
    browser.messageDisplayAction.disable();
  } else {
    //First message is in context
    this.selectedMessage = messageList.messages[0];
    try {
      //let message = await browser.messages.getFull(messageList.messages[0].id)
      //console.log(message.parts[0]['contentType'])
      let result = await searchUnsub()
      if (result) {
        browser.messageDisplayAction.enable();
      } else {
        browser.messageDisplayAction.disable();
      }

    } catch (error) {
      console.log(error)
      browser.messageDisplayAction.disable()
    }
  }

}
/**
 * checks the header for unsubribe options and stores a matching funktion for later use
 * @returns true when unsub is found and stored, false if no valid header is found
 */
async function searchUnsub() {
  try {
    /* options for unsubscribing:
    * #1 - via post request using 'List-Unsubscribe=One-Click'
    * #2 - manual email with prepared content browser.compose.beginNew
    * #3 - open website in browser
    */

    let message = await browser.messages.getFull(this.selectedMessage.id)
    console.log(message.headers)

    if (message.headers.hasOwnProperty('list-unsubscribe-post')) { //header has post command required for #1 method
      console.log('has unsub post #1 solution is possible')

      let postCommand = message.headers['list-unsubscribe-post'][0]
      let unbsubString = message.headers['list-unsubscribe'][0]
      let separators = ['\\\<', '\\\>'] //list unsubscribe gets split for isolating post link and mail address
      let entries = unbsubString.split(new RegExp(separators.join('|'), 'g'))

      for (let i = 0; entries.length - 1; i++) {
        if (entries[i].includes('https')) { //searches for hyperlink
          console.log('post link found!')
          console.log(entries[i])
          let postRequest = { weblink: entries[i], command: postCommand } 
          storedUnsub = unsubPostRequst.bind(postRequest) //prepares unsubscribe via push command for later use

          return true //unsub is prepared therefore no further actions are necessary
        }
      }
    } else {
      console.log('post request is not possible')
    }

    if (message.headers.hasOwnProperty('list-unsubscribe')) { //unsub header necessary for method #2 and #3
      let unbsubString = message.headers['list-unsubscribe'][0] //check for missing entry before calling
      let emailSeperators = ['\\\:', '\\\?']

      let entries = unbsubString.replace(/<|>/g, "");
      entries = entries.split(",")
      console.log(entries)

      //method 2
      for (let i = 0; i <= entries.length - 1; i++) {
        if (entries[i].includes('@')) {
          let emailAddress = ""
          let subject = "unsubscribe" //Default value
          //email adress for unsubscribe is found, method no. 2 is prepared and stored
          let emailParts = entries[i].split(new RegExp(emailSeperators.join('|'), 'g'))
          for (let e = 0; e < emailParts.length; e++) {
            if (emailParts[e].includes('@')) {
              emailAddress = emailParts[e]
            } else if (emailParts[e].includes('subject=')) {
              //After the equals sign the subject is present
              subject = emailParts[e].split('=')[1]
            }
          }

          let checkForValidAddress = await getIdentetyId(emailAddress) //makes sure, that the email address in the header is not equal to an address linked to the account itself
          if (checkForValidAddress != undefined ) {                  //if the entry matches a local address, the entry gets skipped
            console.log(`invalid email found, makes no sense to unsub from own email ${checkForValidAddress}`)
            continue
          }

          console.log(entries[i])
          let unsubMailData = { message: message, emailAddress: emailAddress, subject: subject } 
          storedUnsub = unsubMail.bind(unsubMailData) //prepares unsubscribe via email for later use
          return true
        }
      }

      //method 3
      for (let i = 0; i <= entries.length - 1; i++) {
        if (entries[i].includes('https://') || entries[i].includes('http://')) {
          console.log(entries[i])
          // hyperlink is 
          let unsublink = { link: entries[i] } 
          storedUnsub = unsubWeb.bind(unsublink) //prepares unsubscribe via website for later use
          return true
        }
      }
    }
    return false
  } catch (error) {
    console.log(error)
    return false
  }
}

/**
 * this function needs an object attached with a weblink and post command in order to work
 */
async function unsubPostRequst() {

  fetch(this.weblink, { mode: 'no-cors', method: 'POST', body: this.command }) //post request for unsub, no-cors is necessary because some servers dont allow responds
    .then(function (response) {
      console.log(response)
    })

}

/**
 * this function needs an object attached with a message, a recipient and and subject in order to work
 */
async function unsubMail() {
  await createPopup(messenger.i18n.getMessage("unsubMail"))
  //It is assumed, that the message is send directly toward the receiver
  let emailRecipient = this.message.headers["to"][0]
  let identityId = await getIdentetyId(emailRecipient)
  //If identity is not found
  if (identityId === undefined) {
    browser.compose.beginNew({ to: this.emailAddress, "subject": this.subject })
  } else {
    browser.compose.beginNew({ to: this.emailAddress, "subject": this.subject, "identityId": identityId })
  }
}

/**
 * this function needs an object attached with a web address in order to work
 */
async function unsubWeb() {
  messenger.windows.create({
    url: this.link,
    type: "popup"
  });
}

async function getIdentetyId(emailAddress) {
  //Get all accounts
  let accounts = await messenger.accounts.list();
  for (let i = 0; i < accounts.length; i++) {
    //Check all identities of one account, if the email address is found
    let identities = accounts[i].identities;
    for (let p = 0; p < identities.length; p++) {
      if (identities[p].email === emailAddress) {
        return identities[p].id;
      }
    }
  }
  return undefined;
}

/**
 * @summary Creates an popup with a given text and returns the return value to the calling function.
 * @description First creates a window with the popup.html. Afterwards it waits for the popup to return ok state, to be done with the setup. If the setup is done, the text and button values are send to the popup, to update the properties. As this is done the function waits for a return value from the popup and returns this.
 * @param {String} text The text that should be displayed on the popup
 * @param {Object} buttons An object including all Buttons that should be present. For each button a true value has to be present. Valid buttons are yes, no and ok.
 * @param {Object} defaultClose An object including the default closeMode.
 * @param {number} height The height of the popup. Default is 200.
 * @param {number} width The width of the popup. Default is 375.
 * 
 * @returns {String} Returns a string containing the information about the pushed button on the popup.
 */
async function createPopup(text, buttons = { ok: true }, defaultClose = { closeMode: "no" }, height = 200, width = 375) {
  //create popup window
  //Cant be created minimized (Don't know why), so just in normal state
  let popup = await messenger.windows.create({
    url: "popup.html",
    type: "popup",
    height: height,
    width: width,
    state: "normal"
  });
  //Wait for response, that setup is done
  //If no wait here, there is an error when sending a message
  let firstMessage = await waitForMessage(popup, { done: false });
  //If any error
  if (!firstMessage.done) {
    messenger.windows.remove(popup.id);
    return defaultClose.closeMode;
  }
  //Send message with relevant information
  await messenger.runtime.sendMessage({
    id: popup.id,
    text: text,
    buttons: buttons
  });
  //Wait for response
  let rv = await waitForMessage(popup, { closeMode: defaultClose });
  try {
    //Popup is no longer needed
    await messenger.windows.remove(popup.id);
  } catch (e) {
    //window does not exist, assumed allready closed
  }
  return rv.closeMode;
}

/**
 * @summary Waits for a window to send a message and then returns the message
 * @description First checks, if the window is present. If it is, returns a promise, which resolves the send message from the popup. If closed without sending a message then returns the default value.
 * @param {Object} popup The window object of the popup, where we want to wait for a message.
 * @param {object} defalutReturn The default return object.
 * @returns {Promise} Returns a promise which resloves the clicked value. If closed without click, the default value is returned.
 */
async function waitForMessage(popup, defalutReturn) {
  let id = popup.id;
  try {
    await messenger.windows.get(id);
  } catch (e) {
    //window does not exist, assume closed
    return defalutReturn;
  }

  return new Promise(resolve => {
    //If the window is closed unexpected the default mode is returned and the listeners are removed
    function windowRemoveListener(closedId) {
      if (id == closedId) {
        messenger.windows.onRemoved.removeListener(windowRemoveListener);
        messenger.runtime.onMessage.removeListener(messageListener);
        resolve(defalutReturn);
      }
    }
    //If the popup returns a message the popup is closed and the listeners are removed
    //Afterwards the received message is returned
    function messageListener(request, sender, sendResopnse) {
      if (sender.tab.windowId == id && request) {
        messenger.windows.onRemoved.removeListener(windowRemoveListener);
        messenger.runtime.onMessage.removeListener(messageListener);
        resolve(request);
      }
    }
    //Register listeners for the reception of a message and on unexpected close of the window
    messenger.runtime.onMessage.addListener(messageListener);
    messenger.windows.onRemoved.addListener(windowRemoveListener);
  })
}