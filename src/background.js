
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Use Vite-injected env var (ensure .env has VITE_GEMINI_API_KEY and the background is bundled by Vite)
const GEMINI_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY)
  ? import.meta.env.VITE_GEMINI_API_KEY
  : undefined;

// Create context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "summarizeWithCubAI",
    title: "Summarize using CubAI",
    contexts: ["page"],
    documentUrlPatterns: ["*://*.youtube.com/*"]
  });
});

// Streaming summary to the side panel so conversation can continue
async function callGeminiSummary(formattedTranscript, videoTitle = "") {
  // Use the REST non-streaming endpoint for a single summary response; UI will insert it as an AI message.
 const endpointBase = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
  const prompt = [
    `You are CubAI. Summarize the YouTube video transcript comprehensively with accurate timing references.`,
    `Use this structure:`,
    `- Overview (2-3 lines)`,
    `- Timeline Highlights with [mm:ss–mm:ss] ranges and bullets`,
    `- Key Takeaways`,
    videoTitle ? `Video Title: ${videoTitle}` : ``,
    ``,
    `Transcript (with timestamps):`,
    formattedTranscript
  ].filter(Boolean).join("\n");

  if (!GEMINI_API_KEY) {
    chrome.runtime.sendMessage({ action: "displayError", error: "Missing VITE_GEMINI_API_KEY in background. Add it to .env and rebuild." });
    return;
  }
  const url = `${endpointBase}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, topP: 0.95, topK: 64, maxOutputTokens: 4096 }
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} ${err?.error?.message || ''}`.trim());
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No summary generated.";
    chrome.runtime.sendMessage({ action: "appendAIMessage", text });
  } catch (e) {
    chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
  }
}

// Helper: mm:ss from seconds
function toClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

// Format YouTube timedtext JSON into lines "[mm:ss] text"
function formatTranscriptWithTimestamps(json) {
  if (!json?.events?.length) return "";
  const lines = [];
  for (const ev of json.events) {
    if (!ev?.segs?.length) continue;
    const start = typeof ev.tStartMs === "number" ? ev.tStartMs / 1000 : 0;
    const text = ev.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push(`[${toClock(start)}] ${text}`);
  }
  return lines.join("\n");
}

// Prevent duplicate summaries per click
let summarizeInProgress = false;
let lastSummarizeTs = 0;
const SUMMARIZE_DEBOUNCE_MS = 3000;

// Track last tab we summarized for and a per-tab token to correlate reload -> timedtext
let lastSummarizeTabId = null;
let activeSummarizeToken = null;

function newToken() {
  return Math.random().toString(36).slice(2);
}

// On click: open panel and trigger timedtext fetch by reloading watch pages
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "summarizeWithCubAI") return;

  const now = Date.now();
  if (summarizeInProgress || (now - lastSummarizeTs) < SUMMARIZE_DEBOUNCE_MS) return;

  summarizeInProgress = true;
  lastSummarizeTs = now;
  lastSummarizeTabId = tab?.id ?? null;
  activeSummarizeToken = newToken();

  chrome.sidePanel.open({ windowId: tab.windowId });
  if (tab?.url?.includes("youtube.com/watch")) {
    // Set a tab-specific flag so only timedtext after this reload is processed
    chrome.tabs.reload(tab.id, {}, () => {
      // Safety release if no timedtext arrives
      setTimeout(() => { summarizeInProgress = false; activeSummarizeToken = null; }, 8000);
    });
  } else {
    summarizeInProgress = false;
    activeSummarizeToken = null;
    chrome.runtime.sendMessage({ action: "displayError", error: "Not a YouTube video page." });
  }
});

// Support captureImage passthrough
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureImage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ error: "No active tab found." });
        return;
      }
      const activeTab = tabs[0];
      chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ dataUrl });
        }
      });
    });
    return true;
  }
});

let isFetching = false;

// Intercept YouTube timedtext requests, fetch JSON, format with timestamps, then call Gemini
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    // Only consider timedtext
    if (!details.url.includes("https://www.youtube.com/api/timedtext")) return;

    // Only handle when a summarize is active; ignore background YouTube requests
    if (!summarizeInProgress || !activeSummarizeToken) return;

    // Debounce: ignore if already fetching
    if (isFetching) return;
    isFetching = true;
    try {
      if (!GEMINI_API_KEY) {
        chrome.runtime.sendMessage({ action: "displayError", error: "Missing VITE_GEMINI_API_KEY for Gemini API in background. Set it in .env and rebuild." });
        return;
      }
      const resp = await fetch(details.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("Could not parse transcription JSON");
      }
      const formatted = formatTranscriptWithTimestamps(data);
      if (!formatted) {
        chrome.runtime.sendMessage({ action: "displayError", error: "No transcript text found." });
      } else {
        await callGeminiSummary(formatted, "");
        chrome.runtime.sendMessage({ action: "appendSystemContext", text: `YouTube Transcript:\n${formatted}` });
      }
    } catch (e) {
      chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
    } finally {
      // Release locks; any further timedtext for this reload will be ignored because summarizeInProgress is false
      summarizeInProgress = false;
      activeSummarizeToken = null;
      setTimeout(() => { isFetching = false; }, 500);
    }
  },
  { urls: ["*://*.youtube.com/*"] }
);