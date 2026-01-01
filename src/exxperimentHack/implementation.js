//core logic
async function initInjectionsImpl(Services, eventPasser){
 // Monitor windows for about:3pane
          const observer = {
            onOpenWindow(xulWindow) {
              const domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                         .getInterface(Ci.nsIDOMWindow);
              
              domWindow.addEventListener("load", () => {
                if (domWindow.location.href === "about:3pane") {
                  injectLogic(domWindow);
                }
              }, { once: true });
            }
          };

          const injectLogic = (win) => {
            // The Thread Pane in Supernova is an <table is="thread-pane">
            // We use a MutationObserver to catch new rows as they are rendered
            const threadPane = win.document.querySelector('[is="tree-view-table-body"]');
            if (!threadPane) return;

            //add button to every currently visible mail card
            for(let c of threadPane.querySelectorAll(".card-layout")){
              modifyRow(c, win);
            }

            const rowObserver = new win.MutationObserver((mutations) => {
              
              for (let mutation of mutations) {
                for (let node of mutation.addedNodes) {
                  if (node.nodeName === "tr" && node.classList.contains("card-layout")) {
                    modifyRow(node, win);
                  }
                }
              }
            });

            rowObserver.observe(threadPane, { childList: true });
          };

          const modifyRow = (row, win) => {
            // Get message key/ID from the row attribute
            const rowId = row.getAttribute("id");
            
            // Find a cell to inject into (e.g., the subject cell)
            const subjectCell = row.querySelector(".thread-card-subject-container");
            if (!subjectCell || row.querySelector(".my-custom-btn")) return;

            const btn = win.document.createElement("button");
            btn.className = "my-custom-btn";
            btn.textContent = "⚡";
            let btnId = `${rowId}-btn`;
            btn.setAttribute("id", btnId);
            btn.style.marginLeft = "5px";
            
            btn.onclick = (e) => {
              e.stopPropagation(); // Don't select the row
              // Fire the event back to background.js
              eventPasser.pass(parseInt(rowId.match(/\d+$/)[0]), btnId);
            };

            subjectCell.appendChild(btn);
            subjectCell.style.display = "flex";
          };

          // Initialize for existing windows
          let e = Services.wm.getEnumerator("mail:3pane");
          while (e.hasMoreElements()) {
            let win = e.getNext();
            // In Supernova, we might need to dig into the tab's chromeBrowser
            for(let i = 0; i < win.length; i++){
              if(win[i].location.href === "about:3pane") injectLogic(win[i]);
            }
          }
          
          Services.wm.addListener(observer);
}


//generated boilerplate (https://darktrojan.github.io/generator/generator.html)
var threadPaneButtons = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const eventPasser = {
      callback: null,
      pass(){
        if(this.callback){
          this.callback(...arguments);
        }
      }
    };
    const Services = globalThis.Services || 
      ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
    return {
      threadPaneButtons: {
        async initInjections() {
          await initInjectionsImpl(Services, eventPasser);
        },
        onButtonClicked: new ExtensionCommon.EventManager({
          context,
          name: "threadPaneButtons.onButtonClicked",
          register(fire) {
            let listener = (rowId, btnId) => { 
              // Fire any listeners registered with addListener.
              fire.async(rowId, btnId);
           };
           // Register the listener.
           eventPasser.callback = listener;
           return () => {
             // Return a way to unregister the listener.
             eventPasser.callback = null;
           };
          },
        }).api()
      }
    };
  }
};