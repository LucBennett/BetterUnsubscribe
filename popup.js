// popup.js

function console_log() {
  console.log("[BetterUnsubscribe][popup.js]", ...arguments);
}

function console_error() {
  console.error("[BetterUnsubscribe][popup.js]", ...arguments);
}

document.addEventListener('DOMContentLoaded', async () => {
  const emailText = document.getElementById('emailText');
  const unsubscribeButton = document.getElementById('unsubscribeButton');
  const cancelButton = document.getElementById('cancelButton');
  const deleteButton = document.getElementById('deleteButton');
  const statusText = document.getElementById('statusText');
  const details = document.getElementById('detailsDropDown');
  const detailsText = document.getElementById('detailsText');
  
  messenger.runtime.sendMessage({requestEmail: true}).then((r) => {
    emailText.textContent += "\n" + r.email;
  }).catch((error)=>{
    console_error("Error receiving email from background:", error);
  });

  messenger.runtime.sendMessage({ requestMethod: true }).then((r) => {
    switch(r.method){
      case "Post":
        detailsText.innerHTML = browser.i18n.getMessage("detailsTextPost") + `<code>${r.address}</code>`;
        details.hidden=false;
        break;
      case "Email":
        detailsText.innerHTML = browser.i18n.getMessage("detailsTextEmail") + `<code>${r.address}</code>`;
        details.hidden=false;
        break;
      case "Browser":
        detailsText.innerHTML = browser.i18n.getMessage("detailsTextWeb") + `<code>${r.address}</code>`;
        details.hidden=false;
        break;
      default:
        //nothing?
    }
  }).catch((error) => {
    console.error("Error receiving methodInfo from background:", error);
  });

  unsubscribeButton.addEventListener('click', async () => {
      unsubscribeButton.disabled = true;
      statusText.textContent = browser.i18n.getMessage("statusTextWorking");
      messenger.runtime.sendMessage({unsubscribe: true}).then((r)=>{
        console_log("Response from background:", r);
        if(r.response){
          statusText.textContent = browser.i18n.getMessage("statusTextDone");
          deleteButton.hidden=false;
        } else{
          unsubscribeButton.disabled = false;
          statusText.textContent = browser.i18n.getMessage("statusTextError");
        }
      }).catch((error)=>{
        console_error("Error sending unsubscribe message:", error);
      });
  });

  cancelButton.addEventListener('click', async () => {
    try {
      const r = await messenger.runtime.sendMessage({cancel: true});
      console_log("Response from background:", r);
      window.close();
    } catch (error) {
      console_error("Error sending cancel message:", error);
    }
  });

  deleteButton.addEventListener('click',async ()=>{
    try{
      deleteButton.disabled = true;
      const r = await messenger.runtime.sendMessage({delete: true});
      console_log("Response from background:", r);
    } catch (error) {
      console_error("Error sending delete message:", error);
    }
  });
});
