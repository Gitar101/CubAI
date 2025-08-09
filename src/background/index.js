// Main entry point for background service worker
// Imports and initializes all background modules

import './api/gemini.js';
import './handlers/contextMenus.js';
import './handlers/messageHandlers.js';
import './handlers/youtubeHandlers.js';
import { setupContextMenus } from './handlers/contextMenus.js';
import { setupMessageHandlers } from './handlers/messageHandlers.js';
import { setupYoutubeIntegration } from './handlers/youtubeHandlers.js';
import { openSidePanel } from './handlers/tabHandlers.js';

// Service worker boot log
console.log("[CubAI] Background service worker started");

// Initialize all handlers
setupContextMenus();
setupMessageHandlers();
setupYoutubeIntegration();

// Handle side panel opening
chrome.action.onClicked.addListener(async (tab) => {
  console.log("[CubAI] chrome.action.onClicked -> open side panel for tab", tab?.id);
  // The user gesture context can be lost after an async call.
  // It's safer and more direct to open the panel for the specific tab that was clicked.
  await chrome.sidePanel.open({ tabId: tab.id });
});