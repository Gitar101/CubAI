// Context menu handlers

import { SUMMARIZE_DEBOUNCE_MS } from '../config/index.js';
import { callGeminiSummary } from '../api/gemini.js';
import { formatTranscriptWithTimestamps, newToken } from '../utils/helpers.js';
import { GEMINI_API_KEY } from '../config/index.js';
import { openSidePanel, ensureContentScriptInjected, collectTabContext } from './tabHandlers.js';

// Summarization state
let summarizeState = {
  summarizeInProgress: false,
  lastSummarizeTs: 0,
  lastSummarizeTabId: null,
  activeSummarizeToken: null,
  lastSummarizeVideoId: null,
  summarizeDebounceTimer: null
};

// Create context menu items
export function setupContextMenus() {
  chrome.runtime.onInstalled.addListener(() => {
    // Existing YouTube summarize (kept)
    chrome.contextMenus.create({
      id: "summarizeWithCubAI",
      title: "Summarize using CubAI",
      contexts: ["page"],
      documentUrlPatterns: ["*://*.youtube.com/*"]
    });
    // New generic context action to prepare CubAI messages with page context
    chrome.contextMenus.create({
      id: "explainWithCubAI",
      title: "Explain Using CubAI",
      contexts: ["all"]
    });
    // New context menu for adding selected text to context
    chrome.contextMenus.create({
      id: "add_to_context",
      title: "Add to CubAI context",
      contexts: ["selection"]
    });
  });

  // On click for context menus
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "add_to_context") {
      // Get the existing context, add the new selection, and save it.
      chrome.storage.local.get('cubext', (data) => {
        const existingContext = data.cubext || [];
        const newContext = [...existingContext, info.selectionText];
        chrome.storage.local.set({ cubext: newContext });
      });
      // Open the side panel for the correct window
      chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
    if (info.menuItemId === "explainWithCubAI") {
      // Open the side panel immediately in response to user gesture
      openSidePanel(tab.id);
      // Then handle the rest of the logic asynchronously
      handleExplainWithCubAI(info, tab);
      return;
    }

    if (info.menuItemId !== "summarizeWithCubAI") return;

    const now = Date.now();
    if (summarizeState.summarizeInProgress || (now - summarizeState.lastSummarizeTs) < SUMMARIZE_DEBOUNCE_MS) {
      console.log("[CubAI] Summarization already in progress or too recent");
      return;
    }

    console.log("[CubAI] Context menu: Starting summarization for tab", tab?.id);

    // Set the summarization state
    summarizeState.summarizeInProgress = true;
    summarizeState.lastSummarizeTs = now;
    summarizeState.lastSummarizeTabId = tab?.id || null;
    summarizeState.lastSummarizeVideoId = null; // Reset so we can process current video
    summarizeState.activeSummarizeToken = newToken();

    // Open the side panel
    openSidePanel(tab.id);

    // Refresh the YouTube page to ensure the latest transcript is available
    // This will trigger the timedtext request that our handler is now listening for
    if (tab && tab.id) {
      chrome.tabs.reload(tab.id);
    }

    // Reset summarize state after a timeout (fallback in case something goes wrong)
    setTimeout(() => {
      console.log("[CubAI] Timeout: Resetting summarization state");
      resetSummarizeState();
    }, SUMMARIZE_DEBOUNCE_MS * 4); // Longer timeout to allow for transcript processing
  });
}

// Handle "Explain with CubAI" context menu item
async function handleExplainWithCubAI(info, tab) {
  if (!tab || !tab.id) return;

  // Ensure content script is injected
  const contentScriptInjected = await ensureContentScriptInjected(tab.id);
  if (!contentScriptInjected) {
    console.error("[CubAI] Failed to inject content script");
    return;
  }


  // Collect context from the page
  chrome.tabs.sendMessage(tab.id, { action: "collectAndReturnContext" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      console.error("[CubAI] Error collecting context:", chrome.runtime.lastError || response?.error || "Unknown error");
      return;
    }

    // Prepare the context and user query
    const context = response.context || "";
    const userQuery = response.ask || info.selectionText || "Explain this page";

    // Send the context and query to the side panel after a short delay to ensure side panel is ready
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: "setUiMode",
        mode: "explain",
        context: context,
        query: userQuery
      });
    }, 200); // 200ms delay
  });
}

// Reset the summarize state
function resetSummarizeState() {
  console.log("[CubAI] Resetting summarization state");
  summarizeState.summarizeInProgress = false;
  summarizeState.lastSummarizeTabId = null;
  summarizeState.lastSummarizeVideoId = null;
  summarizeState.activeSummarizeToken = null;
  if (summarizeState.summarizeDebounceTimer) {
    clearTimeout(summarizeState.summarizeDebounceTimer);
    summarizeState.summarizeDebounceTimer = null;
  }
}

// Get the current summarize state
export function getSummarizeState() {
  return { ...summarizeState };
}

// Update the summarize state
export function setSummarizeState(newState) {
  summarizeState = { ...summarizeState, ...newState };
}

// Listen for reset messages from the Gemini API
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "resetSummarizeState") {
    resetSummarizeState();
  }
});