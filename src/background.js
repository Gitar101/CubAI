
import { GoogleGenerativeAI } from "@google/generative-ai";

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

// Configure the client
const ai = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define the grounding tool
const groundingTool = {
  googleSearch: {},
};

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
  const endpointBase = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent";
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

  const extractJson = (str) => {
    let braceCount = 0;
    let inString = false;
    const jsonStart = str.indexOf('{');
    if (jsonStart === -1) return null;

    for (let i = jsonStart; i < str.length; i++) {
      const char = str[i];
      if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
        inString = !inString;
      } else if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
      }
      if (!inString && braceCount === 0 && i >= jsonStart) {
        const jsonStr = str.substring(jsonStart, i + 1);
        const rest = str.substring(i + 1);
        try {
          return [JSON.parse(jsonStr), rest];
        } catch (e) {
          // Invalid JSON, continue searching from the next character
        }
      }
    }
    return null;
  };

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

    chrome.runtime.sendMessage({ action: "startAIStream" });
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const result = extractJson(buffer);
        if (!result) break;

        const [jsonObj, restOfBuffer] = result;
        buffer = restOfBuffer;

        const textChunk = jsonObj?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (textChunk) {
          chrome.runtime.sendMessage({ action: "appendAIMessageChunk", text: textChunk });
        }
      }
    }
    chrome.runtime.sendMessage({ action: "endAIStream" });
  } catch (e) {
    chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
    chrome.runtime.sendMessage({ action: "endAIStream" });
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
                    // Force UI to Explain mode when invoked from context menu
                    chrome.runtime.sendMessage({ action: "setMode", mode: "explain" });
                    chrome.runtime.sendMessage({ action: "appendSystemContext", text: line1 });
                    chrome.runtime.sendMessage({ action: "appendUserMessage", text: line2 });
                    // Add hidden context URL token for pill rendering in bubble
                    if (tab && tab.url) {
                      chrome.runtime.sendMessage({ action: "appendUserMessage", text: `//context-url: ${tab.url}` });
                    }
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
                // Tell panel to switch into Explain-with-context mode
                chrome.runtime.sendMessage({ action: "setMode", mode: "explain" });
                // Provide the system context immediately
                chrome.runtime.sendMessage({ action: "appendSystemContext", text: line1 });
                // Show context preview pill before any user send
                const tabMeta = { title: tab?.title || "", url: tab?.url || "", favIconUrl: tab?.favIconUrl || "", id: tab?.id };
                chrome.runtime.sendMessage({ action: "setContextPreview", preview: tabMeta });
                // Seed only the initial ask line; also add a hidden context URL token line for pill rendering in bubble
                chrome.runtime.sendMessage({ action: "appendUserMessage", text: line2 });
                if (tabMeta.url) {
                  chrome.runtime.sendMessage({ action: "appendUserMessage", text: `//context-url: ${tabMeta.url}` });
                }
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

// Unified background message handler for UI integrations (captureImage + listTabs + getTabContent + getActiveTabCubAIContext)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message && message.action;

  if (action === "sendChatMessage") {
    const { messages, systemInstruction, systemContext } = message;

    // 1. Merge consecutive messages to ensure strict user/model alternation.
    const merged = [];
    if (messages && messages.length > 0) {
      // Filter out empty messages
      const sourceMessages = messages.filter(m => m.content && m.content.some(p => (p.text || p.url)));
      if (sourceMessages.length > 0) {
        // Deep copy first message
        merged.push(JSON.parse(JSON.stringify(sourceMessages[0])));
        for (let i = 1; i < sourceMessages.length; i++) {
          const currentMsg = sourceMessages[i];
          const lastMergedMsg = merged[merged.length - 1];
          if (currentMsg.role === lastMergedMsg.role) {
            // Merge content with last message
            lastMergedMsg.content.push(...JSON.parse(JSON.stringify(currentMsg.content)));
          } else {
            // Add new message
            merged.push(JSON.parse(JSON.stringify(currentMsg)));
          }
        }
      }
    }

    // 2. Ensure conversation starts with 'user' role, preserving context from initial AI messages.
    let finalMessages = [];
    if (merged.length > 0) {
      const firstUserIndex = merged.findIndex(m => m.role === 'user');
      
      if (firstUserIndex === -1) {
        chrome.runtime.sendMessage({ action: "displayError", error: "Cannot send a message without user input." });
        return;
      }
      
      // If there are AI messages before the first user message (e.g., a summary),
      // combine their text content and prepend it to the first user message.
      if (firstUserIndex > 0) {
        const aiContextMessages = merged.slice(0, firstUserIndex);
        const firstUserMessage = merged[firstUserIndex];
        const restOfMessages = merged.slice(firstUserIndex + 1);
        
        // Extract text from AI context messages
        const aiText = aiContextMessages
          .map(aiMsg => aiMsg.content.map(p => p.text || '').join('\n'))
          .join('\n\n');
        
        // Prepend AI context to the first user message's content
        firstUserMessage.content.unshift({ type: 'text', text: `Given the summary:\n${aiText}\n\n---\n\n` });
        
        finalMessages = [firstUserMessage, ...restOfMessages];
      } else {
        // No preceding AI messages, use the merged list as is.
        finalMessages = merged;
      }
    }

    // 3. Convert to the final API format.
    const contents = finalMessages.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: msg.content
        .map(part => {
          if (part.type === 'image' && part.url) {
            const match = part.url.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/);
            if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
            return null; // Skip invalid image URLs
          }
          if (part.type === 'text' && part.text) return { text: part.text };
          return null; // Skip other part types or empty text
        })
        .filter(Boolean) // Remove nulls
    }));

    // 4. Add page context to the last user message's parts.
    if (systemContext && contents.length > 0) {
      const lastContent = contents[contents.length - 1];
      if (lastContent.role === 'user') {
        const userTextPart = lastContent.parts.find(p => p.text && !p.text.startsWith('//'));
        
        // The context from `explainWithCubAI` is already formatted as "user-message: ...".
        // Raw context comes from other flows.
        const formattedContext = systemContext.startsWith('user-message:')
          ? systemContext
          : `user-message: ${systemContext}`;

        if (userTextPart) {
          const userQuestion = userTextPart.text;
          userTextPart.text = `${formattedContext}\nuser-message: "${userQuestion}"`;
        } else {
          // If user only sent an image, add context as a text part.
          lastContent.parts.unshift({ text: formattedContext });
        }
      }
    }

    // Filter out any messages that ended up with no parts
    const finalContents = contents.filter(c => c.parts.length > 0);

    const generationConfig = {
      temperature: 0.7,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
    };

    streamGeminiResponse(finalContents, generationConfig, systemInstruction);
    return true; // Keep message channel open for streaming
  }
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

  // 1b) Capture FULL PAGE stitched screenshot with compression
  if (action === "captureFullPage") {
    const quality = typeof message.quality === "number" ? Math.min(0.95, Math.max(0.3, message.quality)) : 0.6;
    const maxWidth = typeof message.maxWidth === "number" ? Math.min(2000, Math.max(512, message.maxWidth)) : 1024;

    // Note: The following function executes IN PAGE CONTEXT. Do not reference variables from SW scope.
    const captureSlices = async (maxWidth, quality) => {
      try {
        // Defensive window/document resolution
        const doc = document;
        const root = doc && (doc.documentElement || doc.body || null);
        if (!root) {
          return { ok: false, error: "No document root available" };
        }
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // Compute total height safely
        const docEl = doc.documentElement || {};
        const body = doc.body || {};
        const totalHeight = Math.max(
          Number(docEl.scrollHeight) || 0,
          Number(body.scrollHeight) || 0,
          Number(docEl.offsetHeight) || 0,
          Number(body.offsetHeight) || 0,
          Number(docEl.clientHeight) || 0
        );
        const viewportH = Math.max(1, window.innerHeight || 0);
        const steps = Math.max(1, Math.ceil(totalHeight / viewportH));

        // Freeze overflow to keep layout stable
        const original = {
          scrollX: window.scrollX || 0,
          scrollY: window.scrollY || 0,
          overflowY: docEl.style ? docEl.style.overflowY : '',
          bodyOverflowY: body && body.style ? body.style.overflowY : ''
        };
        if (docEl && docEl.style) docEl.style.overflowY = 'hidden';
        if (body && body.style) body.style.overflowY = 'hidden';

        const slices = [];

        for (let i = 0; i < steps; i++) {
          const y = i * viewportH;
          try {
            window.scrollTo({ top: y, left: 0, behavior: 'instant' });
          } catch {}
          await sleep(150);

          // Ask background to capture current viewport
          const dataUrl = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage({ action: "captureImage" }, (resp) => {
                if (!resp || chrome.runtime.lastError) {
                  resolve("");
                  return;
                }
                resolve(resp.dataUrl || "");
              });
            } catch {
              resolve("");
            }
          });
          if (!dataUrl) continue;

          // Downscale and recompress to fit budget
          const img = new Image();
          await new Promise((res) => { img.onload = res; img.onerror = () => res(); img.src = dataUrl; });

          const w = Math.max(1, img.width || 1);
          const scale = Math.min(1, maxWidth / w);
          const outW = Math.floor(w * scale);
          const outH = Math.floor((img.height || 1) * scale);
          const canvas = document.createElement('canvas');
          canvas.width = outW; canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (ctx && typeof ctx.imageSmoothingQuality !== 'undefined') ctx.imageSmoothingQuality = 'high';
          try { ctx.drawImage(img, 0, 0, outW, outH); } catch (e) {
            return { ok: false, error: "Canvas draw failed: " + (e && e.message ? e.message : String(e)) };
          }
          const jpeg = canvas.toDataURL('image/jpeg', quality);

          slices.push({ url: jpeg, w: outW, h: outH, index: i });
        }

        // Restore overflow/scroll
        try { window.scrollTo(original.scrollX || 0, original.scrollY || 0); } catch {}
        if (docEl && docEl.style) docEl.style.overflowY = original.overflowY || '';
        if (body && body.style) body.style.overflowY = original.bodyOverflowY || '';

        return { ok: true, slices };
      } catch (e) {
        return { ok: false, error: (e && e.message) ? e.message : String(e) };
      }
    };

    // Instrument the SW side for easier diagnostics
    try { console.log("[CaptureFullPage][SW] Start", { quality, maxWidth }); } catch {}

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        try { console.warn("[CaptureFullPage][SW] tabs.query error:", chrome.runtime.lastError.message); } catch {}
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      const tab = (tabs && tabs[0]) || null;
      if (!tab || tab.id == null) {
        try { console.warn("[CaptureFullPage][SW] No active tab"); } catch {}
        sendResponse({ error: "No active tab" });
        return;
      }

      const run = () => {
        // Note: Full page scroll capture for PDFs might not work reliably due to how browsers render them
        // (e.g., within embedded viewers that don't expose standard scroll properties to the main document).
        // This attempts to capture slices for all pages, including PDFs, but may only capture the visible viewport for PDFs.
        try { console.log("[CaptureFullPage][SW] Executing captureSlices in tab", tab.id); } catch {}
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureSlices, args: [maxWidth, quality] }, (results) => {
          if (chrome.runtime.lastError) {
            try { console.warn("[CaptureFullPage][SW] executeScript error:", chrome.runtime.lastError.message); } catch {}
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          const res = results && results[0] && results[0].result;
          try { console.log("[CaptureFullPage][SW] Received result", { hasRes: !!res, ok: res?.ok, slices: res?.slices?.length }); } catch {}
          if (!res || !res.ok || !Array.isArray(res.slices) || res.slices.length === 0) {
            sendResponse({ error: res?.error || "Failed to capture slices" });
            return;
          }
          sendResponse({ ok: true, slices: res.slices });
        });
      };

      // Ensure content_script present to handle captureImage messages from page context
      chrome.tabs.sendMessage(tab.id, { action: "__ping__" }, () => {
        if (chrome.runtime.lastError) {
          try { console.log("[CaptureFullPage][SW] Injecting content_script.js before run"); } catch {}
          chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: false }, files: ["content_script.js"] }, () => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
              return;
            }
            setTimeout(run, 80);
          });
        } else {
          run();
        }
      });
    });
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

  // 4) For App side-panel: get active tab page-context via content_script
  if (action === "getActiveTabCubAIContext") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      const tab = (tabs && tabs[0]) || null;
      if (!tab || tab.id == null) {
        sendResponse({ error: "No active tab" });
        return;
      }

      const finalize = () => {
        chrome.tabs.sendMessage(tab.id, { action: "collectAndReturnContext" }, (resp) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          if (!resp || !resp.ok) {
            sendResponse({ error: resp?.error || "Failed to collect page context" });
            return;
          }
          const tabMeta = {
            id: tab.id,
            title: tab.title || "",
            url: tab.url || "",
            favIconUrl: tab.favIconUrl || ""
          };
          sendResponse({ ok: true, context: resp.context, ask: resp.ask, tabMeta });
        });
      };

      // Ensure content_script is present
      chrome.tabs.sendMessage(tab.id, { action: "__ping__" }, () => {
        if (chrome.runtime.lastError) {
          // Inject then retry
          chrome.scripting.executeScript(
            { target: { tabId: tab.id, allFrames: false }, files: ["content_script.js"] },
            () => {
              if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
              }
              setTimeout(finalize, 50);
            }
          );
        } else {
          finalize();
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

// Helper to stream Gemini responses
async function streamGeminiResponse(contents, generationConfig, systemInstruction) {
  if (!GEMINI_API_KEY) {
    chrome.runtime.sendMessage({ action: "displayError", error: "Missing VITE_GEMINI_API_KEY in background. Add it to .env and rebuild." });
    return;
  }

  const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

  const request = { contents, generationConfig, tools: [groundingTool] };
  if (systemInstruction) {
    request.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  }

  try {
    chrome.runtime.sendMessage({ action: "startAIStream" });
    const result = await model.generateContentStream(request);
    for await (const chunk of result.stream) {
      const textChunk = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (textChunk) {
        chrome.runtime.sendMessage({ action: "appendAIMessageChunk", text: textChunk });
      }
    }
    chrome.runtime.sendMessage({ action: "endAIStream" });
  } catch (e) {
    chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
    chrome.runtime.sendMessage({ action: "endAIStream" });
  }
}