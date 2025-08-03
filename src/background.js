chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureImage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ error: "No active tab found." });
        return;
      }
      const activeTab = tabs; // Get the first (and only) active tab
      console.log("Capturing tab:", activeTab.id, "in window:", activeTab.windowId);
      chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message;
          sendResponse({ error: errorMessage });
        } else {
          sendResponse({ dataUrl: dataUrl });
        }
      });
    });
    return true; // Indicates that sendResponse will be called asynchronously
  }
});