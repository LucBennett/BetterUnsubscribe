// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  const emailText = document.getElementById('emailText');
  const unsubscribeButton = document.getElementById('unsubscribeButton');
  const cancelButton = document.getElementById('cancelButton');
  const deleteButton = document.getElementById('deleteButton');
  const statusText = document.getElementById('statusText');

  // Retrieve the email address passed from the background script
  try {
    const r = await messenger.runtime.sendMessage({requestEmail: true});
    let email = r.email;
    emailText.textContent += "\n" + email;
  } catch (error) {
    console.error("Error receiving email from background:", error);
  }

  unsubscribeButton.addEventListener('click', async () => {
    try {
      
      unsubscribeButton.disabled = true;
      statusText.textContent = browser.i18n.getMessage("statusTextWorking");
      const r = await messenger.runtime.sendMessage({unsubscribe: true});
      console.log("Response from background:", r);
      if(r.response){
        statusText.textContent = browser.i18n.getMessage("statusTextDone");
        deleteButton.hidden=false;
      } else{
        unsubscribeButton.disabled = false;
        statusText.textContent = browser.i18n.getMessage("statusTextError");
      }
      
      //window.close();
    } catch (error) {
      console.error("Error sending unsubscribe message:", error);
    }
  });

  cancelButton.addEventListener('click', async () => {
    try {
      const r = await messenger.runtime.sendMessage({cancel: true});
      console.log("Response from background:", r);
      window.close();
    } catch (error) {
      console.error("Error sending cancel message:", error);
    }
  });

  deleteButton.addEventListener('click',async ()=>{
    try{
      deleteButton.disabled = true;
      const r = await messenger.runtime.sendMessage({delete: true});
      console.log("Response from background:", r);
    } catch (error) {
      console.error("Error sending delete message:", error);
    }
  })
});
