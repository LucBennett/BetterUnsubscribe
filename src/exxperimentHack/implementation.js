//core logic
function get3panewindow(services) {
  let e = services.wm.getEnumerator('mail:3pane');
  while (e.hasMoreElements()) {
    let win = e.getNext();
    // In Supernova, we might need to dig into the tab's chromeBrowser
    for (let i = 0; i < win.length; i++) {
      if (win[i].location.href === 'about:3pane') return win[i];
    }
  }
  return null; //couldn't find the win... TODO: handle this better (error?)
}

async function initInjectionsImpl(Services, eventPasser, context) {
  // Monitor windows for about:3pane
  //TODO:
  //this code for observing newly opened windows is untested.
  //is it even necessary if the main email tab cannot be closed?
  const observer = {
    onOpenWindow(xulWindow) {
      const domWindow = xulWindow
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindow);

      domWindow.addEventListener(
        'load',
        () => {
          if (domWindow.location.href === 'about:3pane') {
            injectLogic(domWindow);
          }
        },
        { once: true }
      );
    },
  };

  const injectLogic = (win) => {
    // The Thread Pane in Supernova is an <table is="thread-pane">
    // We use a MutationObserver to catch new rows as they are rendered
    const threadPane = win.document.querySelector(
      '[is="tree-view-table-body"]'
    );
    if (!threadPane) return;

    //add button to every currently visible mail card
    for (let c of threadPane.querySelectorAll('.card-layout')) {
      modifyRow(c, win);
    }

    const rowObserver = new win.MutationObserver((mutations) => {
      for (let mutation of mutations) {
        for (let node of mutation.addedNodes) {
          if (
            node.nodeName === 'tr' &&
            node.classList.contains('card-layout')
          ) {
            modifyRow(node, win);
          }
        }
      }
    });

    rowObserver.observe(threadPane, { childList: true });
  };

  const modifyRow = (row, win) => {
    // Get message key/ID from the row attribute
    const rowId = row.getAttribute('id');
    const rowNo = parseInt(rowId.match(/\d+$/)[0]);

    // Find a cell to inject into (e.g., the subject cell)
    const subjectCell = row.querySelector('.thread-card-subject-container');
    if (!subjectCell || row.querySelector('.my-custom-btn')) return;

    const btn = win.document.createElement('button');
    btn.className = 'my-custom-btn';
    btn.textContent = '⚡';
    let btnId = `${rowId}-btn`;
    btn.setAttribute('id', btnId);
    btn.style.marginLeft = '5px';
    btn.style.display = 'none';

    btn.onclick = (e) => {
      e.stopPropagation(); // Don't select the row
      // Fire the event back to background.js
      eventPasser.pass(rowNo); //notify background.js about button click
    };

    subjectCell.appendChild(btn);
    eventPasser.buttonPass(rowNo); //notify background.js about adding of new button
    subjectCell.style.display = 'flex';
  };

  // Initialize for existing windows
  const panewin = get3panewindow(Services);
  injectLogic(panewin);

  Services.wm.addListener(observer);

  //clean up all the stateful injections by reloading the window
  context.callOnClose({
    close() {
      panewin.location.reload();
    },
  });
}

async function enableButtonImpl(services, rowNo) {
  let win = get3panewindow(services);
  let el = win.document.querySelector(`#threadTree-row${rowNo}-btn`);
  if (el) {
    el.style.display = 'block';
  }
}

//generated boilerplate (https://darktrojan.github.io/generator/generator.html)
var threadPaneButtons = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    //hacky object for passing events from the dom to the background. Am pleasantly
    //surprised that this works but there's probably a better way to do this tbh.
    const eventPasser = {
      callback: null,
      buttonCallback: null,
      pass() {
        if (this.callback) {
          this.callback(...arguments);
        }
      },
      async buttonPass() {
        if (this.buttonCallback) {
          this.buttonCallback(...arguments);
        }
      },
    };
    const Services =
      globalThis.Services ||
      ChromeUtils.import('resource://gre/modules/Services.jsm').Services;
    return {
      threadPaneButtons: {
        async initInjections() {
          await initInjectionsImpl(Services, eventPasser, context);
        },
        async enableButton(rowNo) {
          await enableButtonImpl(Services, rowNo);
        },
        onButtonClicked: new ExtensionCommon.EventManager({
          context,
          name: 'threadPaneButtons.onButtonClicked',
          register(fire) {
            let listener = (rowNo) => {
              // Fire any listeners registered with addListener.
              fire.async(rowNo);
            };
            // Register the listener.
            eventPasser.callback = listener;
            return () => {
              // Return a way to unregister the listener.
              eventPasser.callback = null;
            };
          },
        }).api(),
        onButtonProduced: new ExtensionCommon.EventManager({
          context,
          name: 'threadPaneButtons.onButtonProduced',
          register(fire) {
            let listener = (rowNo) => {
              // Fire any listeners registered with addListener.
              fire.async(rowNo);
            };
            // Register the listener.
            eventPasser.buttonCallback = listener;
            return () => {
              // Return a way to unregister the listener.
              eventPasser.buttonCallback = null;
            };
          },
        }).api(),
      },
    };
  }
};
