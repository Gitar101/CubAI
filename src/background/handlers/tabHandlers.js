// Tab management handlers

// Open the side panel for a given tab
export function openSidePanel(tabId) {
  chrome.sidePanel.open({ tabId });
}

// Inject content script into a tab if needed
export async function ensureContentScriptInjected(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "__ping__" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Content script not present, inject it
        chrome.scripting.executeScript(
          { target: { tabId, allFrames: false }, files: ["content_script.js"] },
          () => {
            if (chrome.runtime.lastError) {
              console.error("Failed to inject content script:", chrome.runtime.lastError);
              resolve(false);
            } else {
              resolve(true);
            }
          }
        );
      } else {
        // Content script already present
        resolve(true);
      }
    });
  });
}

// Get the active tab
export function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting active tab:", chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(tabs && tabs.length > 0 ? tabs[0] : null);
    });
  });
}

// Collect context from a tab
export function collectTabContext(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "collectAndReturnContext" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        console.error("Error collecting tab context:", chrome.runtime.lastError || response?.error || "Unknown error");
        resolve(null);
        return;
      }
      resolve({
        context: response.context,
        ask: response.ask
      });
    });
  });
}