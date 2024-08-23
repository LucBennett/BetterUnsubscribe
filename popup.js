window.addEventListener("load", onLoad);
window.addEventListener("close",onClose);

async function onLoad(){
  let buttons = document.getElementsByTagName("button");
  for (let i = 0; i < buttons.length; i++) {
    const element = buttons[i];
    element.addEventListener("click", notifyMode);
  }
  messenger.runtime.onMessage.addListener(messageListener);
  await messenger.runtime.sendMessage({done : true});
}

async function notifyMode(event){
  await messenger.runtime.sendMessage({closeMode : event.target.getAttribute("value")});
}

async function messageListener(request, sender, senderResponse) {
  if(request.id !== undefined){
    setupText(request.text);
    setupButtons(request.buttons);
  }
}

async function onClose(){
  messenger.runtime.onMessage.removeListener(messageListener);
}

function setupText(text){
  document.getElementById("text").innerHTML = text;
}

function setupButtons(buttons) {
	document.getElementById("button_yes").innerText = messenger.i18n.getMessage("unsubYes");
	document.getElementById("button_no").innerText = messenger.i18n.getMessage("unsubNo");
	document.getElementById("button_ok").innerText = messenger.i18n.getMessage("unsubOk");
  if(buttons.yes){
    document.getElementById("button_yes").style.display = "block";
  }else{
    document.getElementById("button_yes").style.display = "none";
  }
  if(buttons.no){
    document.getElementById("button_no").style.display = "block";
  }else{
    document.getElementById("button_no").style.display = "none";
  }
  if(buttons.ok){
    document.getElementById("button_ok").style.display = "block";
  }else{
    document.getElementById("button_ok").style.display = "none";
  }
}