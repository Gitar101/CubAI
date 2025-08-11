// YouTube integration handlers

import { callGeminiSummary } from '../api/gemini.js';
import { SUMMARIZE_DEBOUNCE_MS } from '../config/index.js';
import { formatTranscriptWithTimestamps } from '../utils/helpers.js';
import { getSummarizeState, setSummarizeState } from './contextMenus.js';

// Setup YouTube integration
export function setupYoutubeIntegration() {
  // Intercept YouTube timedtext requests to get transcripts
  chrome.webRequest.onBeforeRequest.addListener(
    handleYoutubeTimedTextRequest,
    { urls: ["*://*.youtube.com/api/timedtext*"] },
    ["requestBody"]
  );
}

export function refreshYouTubeTab() {
  console.log("[CubAI] Attempting to find and refresh YouTube tab");
  chrome.tabs.query({ url: ["*://*.youtube.com/*"], active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("[CubAI] Error querying tabs:", chrome.runtime.lastError);
      return;
    }
    
    console.log("[CubAI] Tab query results:", tabs);
    
    if (!tabs || tabs.length === 0) {
      console.log("[CubAI] No active YouTube tab found");
      return;
    }

    const youtubeTabId = tabs[0].id;
    if (!youtubeTabId) {
      console.error("[CubAI] YouTube tab found but no valid ID");
      return;
    }

    console.log("[CubAI] Found YouTube tab to reload:", youtubeTabId);
    chrome.tabs.reload(youtubeTabId, () => {
      if (chrome.runtime.lastError) {
        console.error("[CubAI] Error reloading tab:", chrome.runtime.lastError);
      } else {
        console.log("[CubAI] YouTube tab reload successful");
      }
    });
  });
}

// Handle YouTube timedtext requests to get transcripts
function handleYoutubeTimedTextRequest(details) {
  // Skip if not a GET request
  if (details.method !== "GET") return;

  // Skip if not from a tab (e.g., from a service worker)
  if (!details.tabId || details.tabId === -1) return;

  // Skip if not a transcript request (must have both lang and v params)
  const url = new URL(details.url);
  const params = url.searchParams;
  if (!params.has("lang") || !params.has("v")) return;

  // Skip if not a format we can parse
  if (params.has("fmt") && params.get("fmt") !== "json3") return;

  // Get the summarize state
  const { summarizeInProgress, lastSummarizeTabId, lastSummarizeVideoId, summarizeDebounceTimer, activeSummarizeToken } = getSummarizeState();

  // ONLY process if user has explicitly requested summarization
  // Skip if no active summarization is in progress
  if (!summarizeInProgress) {
    console.log("[CubAI] Skipping timedtext request - no active summarization requested");
    return;
  }

  // Skip if this isn't the tab we're waiting for
  if (lastSummarizeTabId !== details.tabId) {
    console.log("[CubAI] Skipping timedtext request - wrong tab", details.tabId, "expected", lastSummarizeTabId);
    return;
  }

  const videoId = params.get("v");

  // Skip if we've already processed this video
  if (lastSummarizeVideoId === videoId) {
    console.log("[CubAI] Skipping timedtext request - already processed video", videoId);
    return;
  }

  console.log("[CubAI] Processing timedtext request for video", videoId, "on tab", details.tabId);

  // Clear any existing debounce timer
  if (summarizeDebounceTimer) {
    clearTimeout(summarizeDebounceTimer);
  }

  // Set a new debounce timer
  const newTimer = setTimeout(() => {
    // Fetch the transcript
    fetch(details.url)
      .then(response => response.json())
      .then(data => {
        // Format the transcript
        const formattedTranscript = formatTranscriptWithTimestamps(data);
        if (!formattedTranscript) {
          console.log("[CubAI] No transcript data found");
          return;
        }

        // Get the tab info
        chrome.tabs.get(details.tabId, tab => {
          if (chrome.runtime.lastError || !tab) {
            console.error("[CubAI] Error getting tab info:", chrome.runtime.lastError);
            return;
          }

          console.log("[CubAI] Successfully got transcript, calling Gemini API");

          // Update the summarize state to mark this video as processed
          setSummarizeState({
            lastSummarizeVideoId: videoId,
            summarizeDebounceTimer: null
          });

          // Call the Gemini API to summarize the transcript
          callGeminiSummary(formattedTranscript, tab.title, tab.url);

          // Stop listening for more requests by clearing the summarization state
          // This prevents multiple summarizations from the same video
          setTimeout(() => {
            console.log("[CubAI] Clearing summarization state after processing");
            setSummarizeState({
              summarizeInProgress: false,
              lastSummarizeTabId: null,
              activeSummarizeToken: null
            });
          }, 1000); // Small delay to ensure the API call has started
        });
      })
      .catch(error => {
        console.error("[CubAI] Error fetching YouTube transcript:", error);
        setSummarizeState({
          summarizeDebounceTimer: null,
          summarizeInProgress: false,
          lastSummarizeTabId: null,
          activeSummarizeToken: null
        });
      });
  }, SUMMARIZE_DEBOUNCE_MS);

  // Update the summarize state with the new timer
  setSummarizeState({
    summarizeDebounceTimer: newTimer
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "summarize" && sender.tab) {
    const tabId = sender.tab.id;
    const youtubeUrl = sender.tab.url;

    if (youtubeUrl && youtubeUrl.includes("youtube.com/watch")) {
      console.log("[CubAI] User requested summarization for tab", tabId);

      // Set the summarization state to start listening for timedtext requests
      setSummarizeState({
        summarizeInProgress: true,
        lastSummarizeTabId: tabId,
        lastSummarizeVideoId: null, // Reset video ID so we can process the current video
        activeSummarizeToken: Date.now() // Use timestamp as token
      });

      // Reload the YouTube page to trigger the webRequest interceptor
      chrome.tabs.update(tabId, { url: youtubeUrl, active: true }, () => {
        console.log(`[CubAI] Reloading YouTube tab ${tabId} for summarization.`);
        // The handleYoutubeTimedTextRequest will be triggered when YouTube loads transcript
      });
    }
  }
});