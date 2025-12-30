var threadPaneButtons = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const Services = globalThis.Services || 
      ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
    return {
      threadPaneButtons: {
        async initInjections() {
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
            const threadPane = win.document.getElementById("threadPane");
            if (!threadPane) return;

            const rowObserver = new win.MutationObserver((mutations) => {
              for (let mutation of mutations) {
                for (let node of mutation.addedNodes) {
                  if (node.nodeName === "TR" && node.classList.contains("collapsed")) {
                    modifyRow(node, win);
                  }
                }
              }
            });

            rowObserver.observe(threadPane.querySelector("tbody"), { childList: true });
          };

          const modifyRow = (row, win) => {
            // Get message key/ID from the row attribute
            const messageKey = row.getAttribute("data-id");
            
            // Find a cell to inject into (e.g., the subject cell)
            const subjectCell = row.querySelector(".subject-column");
            if (!subjectCell || row.querySelector(".my-custom-btn")) return;

            const btn = win.document.createElement("button");
            btn.className = "my-custom-btn";
            btn.textContent = "⚡";
            btn.style.marginLeft = "5px";
            
            btn.onclick = (e) => {
              e.stopPropagation(); // Don't select the row
              // Fire the event back to background.js
              context.emit("onButtonClicked", messageKey, "lightning-action");
            };

            subjectCell.appendChild(btn);
          };

          // Initialize for existing windows
          let e = Services.wm.getEnumerator("mail:3pane");
          while (e.hasMoreElements()) {
            let win = e.getNext();
            // In Supernova, we might need to dig into the tab's chromeBrowser
            if (win.gTabmail) {
              for (let tab of win.gTabmail.tabInfo) {
                if (tab.currentAbout3Pane) injectLogic(tab.currentAbout3Pane);
              }
            }
          }
          
          Services.wm.addListener(observer);
        }
      }
    };
  }
};