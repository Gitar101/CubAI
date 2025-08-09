// Message handlers for runtime messages

import { streamGeminiResponse } from '../api/gemini.js';
import { defaultGenerationConfig } from '../config/index.js';
import { getSummarizeState } from './contextMenus.js';
import { refreshYouTubeTab } from './youtubeHandlers.js';

// Flag to track image capture in progress
let isFetching = false;

// Setup message handlers
export function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message && message.action;
    const type = message && message.type;


    if (action === "sendChatMessage") {
      return handleSendChatMessage(message, sender, sendResponse);
    }
    
    if (action === "captureImage") {
      return handleCaptureImage(message, sender, sendResponse);
    }
    
    if (action === "captureFullPage") {
      return handleCaptureFullPage(message, sender, sendResponse);
    }
    
    if (action === "listTabs") {
      return handleListTabs(message, sender, sendResponse);
    }
    
    if (action === "getTabContent") {
      return handleGetTabContent(message, sender, sendResponse);
    }
    
    if (action === "getActiveTabCubAIContext") {
      return handleGetActiveTabCubAIContext(message, sender, sendResponse);
    }

    if (action === "refreshSummarization") {
      refreshYouTubeTab();
      sendResponse({ success: true });
      return true; // Keep the message channel open
    }
  });
}

// Handle sending chat messages to Gemini API
async function handleSendChatMessage(message, sender, sendResponse) {
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

  // 4. Add user-selected context from the message object.
  const lastFinalMessage = finalMessages[finalMessages.length - 1];
  if (lastFinalMessage && lastFinalMessage.contexts && lastFinalMessage.contexts.length > 0 && contents.length > 0) {
    const lastContent = contents[contents.length - 1];
    if (lastContent.role === 'user') {
      const contextString = lastFinalMessage.contexts.join('\n\n---\n\n');
      const formattedContext = `Context:\n${contextString}\n\n`;
      lastContent.parts.unshift({ text: formattedContext });
    }
  }

  // 5. Add page context to the last user message's parts.
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

  try {
    await streamGeminiResponse(finalContents, defaultGenerationConfig, systemInstruction);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error in streamGeminiResponse:", error);
    sendResponse({ error: error.message || "An unknown error occurred during Gemini streaming." });
  }

  return true; // Keep message channel open for streaming
}

// Handle capturing visible tab image
function handleCaptureImage(message, sender, sendResponse) {
  const { lastSummarizeTabId } = getSummarizeState();
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

// Handle capturing full page screenshot
function handleCaptureFullPage(message, sender, sendResponse) {
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

// Handle listing tabs for "Add page context" drop-up
function handleListTabs(message, sender, sendResponse) {
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

// Handle extracting full page text content of a selected tab
function handleGetTabContent(message, sender, sendResponse) {
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

// Handle getting active tab page-context via content_script
function handleGetActiveTabCubAIContext(message, sender, sendResponse) {
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

// Export for use in other modules
export function setIsFetching(value) {
  isFetching = value;
}

export function getIsFetching() {
  return isFetching;
}