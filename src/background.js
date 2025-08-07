
// Service worker boot log
console.log("[CubAI] Background service worker started");

chrome.action.onClicked.addListener((tab) => {
  console.log("[CubAI] chrome.action.onClicked -> open side panel for window", tab?.windowId);
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Use Vite-injected env var (ensure .env has VITE_GEMINI_API_KEY and the background is bundled by Vite)
const GEMINI_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY)
  ? import.meta.env.VITE_GEMINI_API_KEY
  : undefined;

// Create context menu items
chrome.runtime.onInstalled.addListener(() => {
  console.log("[CubAI] onInstalled -> creating context menus");
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
  console.log("[CubAI] Context menus created");
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

// On click for context menus
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("[CubAI] contextMenus.onClicked", info?.menuItemId, "tabId=", tab?.id, "url=", tab?.url);
  if (info.menuItemId === "explainWithCubAI") {
    // 1) Open the side panel on the current window
    if (tab && tab.windowId != null) {
      console.log("[CubAI] Opening side panel for window", tab.windowId);
      chrome.sidePanel.open({ windowId: tab.windowId });
    }

    // IMPORTANT: ensure content script is present by programmatically injecting it when needed.
    // Some sites may not have our content script yet due to timing/navigation. MV3 service worker can't directly access DOM,
    // so we use chrome.scripting to inject our compiled content script file (public/content_script.js is moved to extension root at build).
    const trySend = () => {
      if (tab && tab.id != null) {
        console.log("[CubAI] Sending message to tab to collectPageContext", tab.id);
        chrome.tabs.sendMessage(tab.id, { action: "collectPageContext" }, (resp) => {
          if (chrome.runtime.lastError) {
            console.warn("[CubAI] collectPageContext error:", chrome.runtime.lastError.message);
            return;
          }
          console.log("[CubAI] collectPageContext resp:", resp);
          try {
            console.log("[CubAI] Requesting payload for panel via collectPageContextForPanel");
            chrome.tabs.sendMessage(tab.id, { action: "collectPageContextForPanel" }, (resp2) => {
              if (chrome.runtime.lastError) {
                console.warn("[CubAI] collectPageContextForPanel error:", chrome.runtime.lastError.message, "-> trying fallback collectAndReturnContext");
                chrome.tabs.sendMessage(tab.id, { action: "collectAndReturnContext" }, (resp3) => {
                  console.log("[CubAI] collectAndReturnContext resp:", resp3);
                  if (resp3 && resp3.ok && resp3.context && resp3.ask) {
                    const line1 = `user-message: ${resp3.context}`;
                    const line2 = `user-message: "${resp3.ask}"`;
                    console.log("[CubAI] Prepared request (fallback):\n", line1, "\n", line2);
                    chrome.runtime.sendMessage({ action: "appendSystemContext", text: line1 });
                    chrome.runtime.sendMessage({ action: "appendUserMessage", text: line2 });
                  } else {
                    console.log("[CubAI] No payload returned from content script (fallback). Response:", resp3);
                  }
                });
                return;
              }
              console.log("[CubAI] collectPageContextForPanel resp:", resp2);
              if (resp2 && resp2.ok && resp2.context && resp2.ask) {
                const line1 = `user-message: ${resp2.context}`;
                const line2 = `user-message: "${resp2.ask}"`;
                console.log("[CubAI] Prepared request:\n", line1, "\n", line2);
                chrome.runtime.sendMessage({ action: "appendSystemContext", text: line1 });
                chrome.runtime.sendMessage({ action: "appendUserMessage", text: line2 });
              } else {
                console.log("[CubAI] No payload returned from content script. Response:", resp2);
              }
            });
          } catch (e) {
            console.log("[CubAI] Exception while requesting panel payload:", e);
          }
        });
      } else {
        console.warn("[CubAI] No valid tab to message for context collection");
      }
    };

    if (tab && tab.id != null) {
      chrome.tabs.sendMessage(tab.id, { action: "__ping__" }, () => {
        if (chrome.runtime.lastError) {
          // No receiver yet: inject our content script explicitly, then retry
          console.warn("[CubAI] No content script receiver, injecting script then retrying...", chrome.runtime.lastError.message);
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id, allFrames: false },
              files: ["content_script.js"]
            },
            () => {
              if (chrome.runtime.lastError) {
                console.error("[CubAI] executeScript failed:", chrome.runtime.lastError.message);
                return;
              }
              console.log("[CubAI] content_script injected, retrying send");
              // small delay to allow script bootstrap
              setTimeout(trySend, 50);
            }
          );
        } else {
          // Receiver exists, proceed
          trySend();
        }
      });
    }
    return;
  }

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

// Unified background message handler for UI integrations (captureImage + listTabs + getTabContent)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message && message.action;

  // 1) Capture image (existing behavior preserved)
  if (action === "captureImage") {
    const useTabId = lastSummarizeTabId;
    const proceedWithCapture = (tab) => {
      if (!tab) {
        sendResponse({ error: "No eligible tab to capture." });
        return;
      }
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          sendResponse({
            error: msg.includes("'<all_urls>'") || msg.includes("'activeTab'")
              ? "Permission missing for the current tab. Open the side panel on the target tab (click the extension icon in that tab), or grant <all_urls> host permission."
              : msg
          });
        } else {
          sendResponse({ dataUrl });
        }
      });
    };

    if (useTabId != null) {
      chrome.tabs.get(useTabId, (tab) => {
        if (chrome.runtime.lastError) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => proceedWithCapture(tabs[0]));
        } else {
          proceedWithCapture(tab);
        }
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => proceedWithCapture(tabs[0]));
    }
    return true;
  }

  // 2) List tabs for "Add page context" drop-up
  if (action === "listTabs") {
    chrome.tabs.query({ windowType: "normal" }, (tabs) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      const mapped = (tabs || []).map(t => ({
        id: t.id, title: t.title, url: t.url, windowId: t.windowId, active: t.active, favIconUrl: t.favIconUrl
      }));
      sendResponse({ tabs: mapped });
    });
    return true;
  }

  // 3) Extract full page text content of a selected tab
  if (action === "getTabContent") {
    const targetId = message.tabId ?? sender?.tab?.id;
    if (!targetId) {
      sendResponse({ error: "No tabId provided" });
      return; // sync
    }

    // Executed in the page
    const extractor = () => {
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let text = "";
        let node;
        while ((node = walker.nextNode())) {
          const t = (node.nodeValue || "").replace(/\s+/g, " ").trim();
          if (t) text += t + "\n";
        }
        const title = document.title || "";
        const desc = document.querySelector('meta[name="description"]')?.content || "";
        return { ok: true, content: [title, desc, text].filter(Boolean).join("\n\n") };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    };

    if (chrome.scripting && chrome.scripting.executeScript) {
      chrome.scripting.executeScript({ target: { tabId: targetId }, func: extractor }, (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        const res = results && results[0] && results[0].result;
        if (!res) {
          sendResponse({ error: "No result from content extraction" });
          return;
        }
        if (res.ok) sendResponse({ content: res.content });
        else sendResponse({ error: res.error || "Unknown extraction error" });
      });
    } else {
      // MV2 fallback if ever needed
      chrome.tabs.executeScript(targetId, { code: `(${extractor})();` }, (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        const res = results && results[0];
        if (res && res.ok) sendResponse({ content: res.content });
        else sendResponse({ error: (res && res.error) || "Unknown extraction error" });
      });
    }
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