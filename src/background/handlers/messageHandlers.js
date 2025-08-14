// Message handlers for runtime messages

import { callGeminiTool, callGeminiUserMemoryTool, about_user_read, about_user_write, run, uploadFile } from '../api/gemini.js';
import { defaultGenerationConfig } from '../config/index.js';
import { getSummarizeState } from './contextMenus.js';
import { readUserMemory } from '../utils/userMemory.js';
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
    
    if (action === 'generate-image') {
      const { prompt, originalPrompt } = message;
      run(prompt, defaultGenerationConfig, null, 'gemini-1.5-flash', 'Image Generation Mode')
        .then(response => {
          if (response && response.imageData) {
            chrome.runtime.sendMessage({
              action: 'displayGeneratedImage',
              description: response.description,
              imageData: response.imageData,
              imagePrompt: response.imagePrompt,
            });
          } else {
            chrome.runtime.sendMessage({ action: "fullAIMessage", text: response });
          }
        })
        .catch(error => {
          chrome.runtime.sendMessage({ action: "displayError", error: error.message || "Failed to generate image." });
        });
      return true;
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

export async function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case 'callGeminiTool':
      try {
        const { functionName, args } = message.payload;
        if (functionName === 'about_user_read' || functionName === 'about_user_write') {
          const result = await callGeminiTool(functionName, args);
          sendResponse({ success: true, result });
        } else {
          sendResponse({ success: false, error: `Unknown tool function: ${functionName}` });
        }
      } catch (error) {
        console.error(`Error calling Gemini tool: ${error}`);
        sendResponse({ success: false, error: error.message });
      }
      break;
    case 'sendChatMessage':
      return handleSendChatMessage(message, sender, sendResponse);
    case 'captureImage':
      return handleCaptureImage(message, sender, sendResponse);
    case 'captureFullPage':
      return handleCaptureFullPage(message, sender, sendResponse);
    case 'listTabs':
      return handleListTabs(message, sender, sendResponse);
    case 'getTabContent':
      return handleGetTabContent(message, sender, sendResponse);
    case 'getActiveTabCubAIContext':
      return handleGetActiveTabCubAIContext(message, sender, sendResponse);
    default:
      // Handle unknown message types or log them
      console.warn(`Unknown message type received: ${message.type}`);
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      break;
  }
  return true; // Keep the message channel open for async responses
}

// Handle sending chat messages to Gemini API
async function handleSendChatMessage(message, sender, sendResponse) {
  let { messages, systemInstruction, systemContext } = message;

  // Retrieve user memory
  const userMemory = await readUserMemory();
  let memoriesContent = '';

  // Use the new paragraph format if available, otherwise fall back to old format
  if (userMemory && userMemory.userProfile && userMemory.userProfile.trim().length > 0) {
    memoriesContent = userMemory.userProfile;
    systemInstruction = `${systemInstruction}\n\nABOUT USER:\n${memoriesContent}`;
  } else if (userMemory && userMemory.memories && userMemory.memories.length > 0) {
    // Backward compatibility with old list format
    memoriesContent = userMemory.memories.join('\n');
    systemInstruction = `${systemInstruction}\n\nABOUT USER:\n${memoriesContent}`;
  } else {
    console.warn("No user memories found");
  }

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

  // 5. Add page context to the last user message's parts as a file.
  if (systemContext && contents.length > 0) {
    const lastContent = contents[contents.length - 1];
    if (lastContent.role === 'user') {
      try {
        const uploadedFile = await uploadFile(systemContext);
        lastContent.parts.push(createPartFromUri(uploadedFile.uri, uploadedFile.mimeType));
        console.log("DEBUG: systemContext uploaded as a file and added to the message parts.");
      } catch (e) {
        console.error("Error uploading file:", e);
        // As a fallback, add the context as inline text
        lastContent.parts.push({ text: `\n\n--- Page Context ---\n\n${systemContext}` });
      }
    }
  }

  // Filter out any messages that ended up with no parts
  const finalContents = contents.filter(c => c.parts.length > 0);

  try {
    // First Call (for General Response and Grounding)
    // Get the selected model from the message or default to gemini-2.5-flash
    let modelName = message.mode?.model || "gemini-2.5-flash";
    if (message.mode === "Image Generation Mode") {
      modelName = "gemini-1.5-flash";
    }
    const assistantResponse = await run(finalContents, defaultGenerationConfig, systemInstruction, modelName, message.mode);

    // Second Call (for User Memory) - After the response is complete
    console.log("Using gemini-1.5-flash for user memory processing after response completion.");

    // Create enhanced context that includes both user messages and assistant response
    const enhancedContents = [...finalContents];
    if (assistantResponse) {
      // Add the assistant's response to the context for memory processing
      enhancedContents.push({
        role: 'model',
        parts: [{ text: assistantResponse }]
      });
    }

    const userMemoryResponse = await callGeminiUserMemoryTool(enhancedContents, [about_user_read, about_user_write]);

    // Process the non-streaming response
    let functionCallExecuted = false;

    for (const result of userMemoryResponse) {
      console.log("Gemini Flash Response:", result); // Log the response
      console.log("Full result structure:", JSON.stringify(result, null, 2));

      // Check for direct functionCall in the response
      const functionCall = result.functionCall;
      if (functionCall && functionCall.name) {
        console.log(`✅ Executing direct function call: ${functionCall.name}`, functionCall.args);
        try {
          const args = typeof functionCall.args === 'string'
            ? JSON.parse(functionCall.args)
            : functionCall.args;
          await callGeminiTool(functionCall.name, args);
          functionCallExecuted = true;
        } catch (e) {
          console.error("Error processing direct function call:", e);
        }
      }

      // Check for response.candidates structure (Gemini 2.0 format)
      if (result.response && result.response.candidates && result.response.candidates.length > 0) {
        for (const candidate of result.response.candidates) {
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                console.log("✅ Executing function call from response.candidates:", part.functionCall);
                try {
                  const args = typeof part.functionCall.args === 'string'
                    ? JSON.parse(part.functionCall.args)
                    : part.functionCall.args;
                  await callGeminiTool(part.functionCall.name, args);
                  functionCallExecuted = true;
                } catch (e) {
                  console.error("Error processing function call from response.candidates:", e);
                }
              }
            }
          }
        }
      }

      // Check for legacy candidates structure (Gemini 1.5 format)
      if (result.candidates && result.candidates.length > 0) {
        for (const candidate of result.candidates) {
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                console.log("✅ Executing function call from legacy candidates:", part.functionCall);
                try {
                  const args = typeof part.functionCall.args === 'string'
                    ? JSON.parse(part.functionCall.args)
                    : part.functionCall.args;
                  await callGeminiTool(part.functionCall.name, args);
                  functionCallExecuted = true;
                } catch (e) {
                  console.error("Error processing function call from legacy candidates:", e);
                }
              }
            }
          }
        }
      }
    }

    // Fallback: If no function call was executed, extract memory directly
    if (!functionCallExecuted) {
      console.log("⚠️ No function call detected from Flash 1.5, using fallback memory extraction");

      // Extract the most recent user message
      let lastUserMessage = '';
      for (let i = enhancedContents.length - 1; i >= 0; i--) {
        if (enhancedContents[i].role === 'user') {
          lastUserMessage = enhancedContents[i].parts
            .filter(part => part.text)
            .map(part => part.text)
            .join('\n');
          break;
        }
      }

      console.log("🔍 Analyzing user message for memory extraction:", lastUserMessage);

      if (lastUserMessage) {
        // Intelligent extraction patterns - only extract meaningful personal information
        let extractedMemory = '';
        const msg = lastUserMessage.toLowerCase().trim();

        // Skip meaningless messages
        const meaninglessPatterns = [
          /^hi+$/i, /^hello$/i, /^hey$/i, /^thanks?$/i, /^ok$/i, /^okay$/i,
          /^i'?m bored$/i, /^bored$/i, /^lol$/i, /^haha$/i, /^yes$/i, /^no$/i,
          /^good$/i, /^great$/i, /^nice$/i, /^cool$/i, /^awesome$/i
        ];

        const isMeaningless = meaninglessPatterns.some(pattern => pattern.test(msg));
        if (isMeaningless) {
          console.log("Skipping meaningless message:", lastUserMessage);
          extractedMemory = ''; // Don't extract anything for meaningless messages
        }

        // Location patterns
        if (msg.includes("i'm from") || msg.includes("i am from") || msg.includes("from")) {
          const locationMatch = lastUserMessage.match(/(?:i'?m )?from (.+?)(?:\.|\,|\!|\?|$)/i);
          if (locationMatch) {
            const location = locationMatch[1].trim();
            if (location.length > 1 && location.length < 50) {
              extractedMemory = `User is from ${location}.`;
            }
          }
        }
        // Name patterns
        else if (msg.includes("my name is")) {
          const nameMatch = lastUserMessage.match(/my name is (.+?)(?:\.|\,|\!|\?|$)/i);
          if (nameMatch) {
            const name = nameMatch[1].trim();
            if (name.length > 1 && name.length < 30 && !name.includes(' ')) { // Single name, reasonable length
              extractedMemory = `User's name is ${name}.`;
            }
          }
        }
        // Relationship patterns (girlfriend, boyfriend, wife, husband, etc.)
        else if (msg.includes("girlfriend") || msg.includes("boyfriend") || msg.includes("wife") || msg.includes("husband") || msg.includes("partner")) {
          const relationshipMatch = lastUserMessage.match(/(?:my )?(girlfriend|boyfriend|wife|husband|partner)(?: is| named)? (.+?)(?:\.|\,|\!|\?|$)/i);
          if (relationshipMatch) {
            const relation = relationshipMatch[1];
            const name = relationshipMatch[2].trim();
            if (name.length > 1 && name.length < 30) {
              extractedMemory = `User has a ${relation} named ${name}.`;
            }
          }
        }
        // Pet patterns
        else if (msg.includes("dog") || msg.includes("cat") || msg.includes("pet")) {
          const petMatch = lastUserMessage.match(/(?:my )?(dog|cat|pet)(?:'s name is| is named| named)? (.+?)(?:\.|\,|\!|\?|$)/i);
          if (petMatch) {
            const petType = petMatch[1];
            const petName = petMatch[2].trim();
            if (petName.length > 1 && petName.length < 20) {
              extractedMemory = `User has a ${petType} named ${petName}.`;
            }
          }
        }
        // Professional patterns
        else if (msg.includes("ceo") || msg.includes("developer") || msg.includes("engineer") || msg.includes("work")) {
          if (msg.includes("ceo")) {
            const ceoMatch = lastUserMessage.match(/(?:i'?m (?:the )?ceo of|ceo of) (.+?)(?:\.|\,|\!|\?|$)/i);
            if (ceoMatch) {
              extractedMemory = `User is the CEO of ${ceoMatch[1].trim()}.`;
            } else if (msg.includes("i am") && msg.includes("ceo")) {
              extractedMemory = `User is a CEO.`;
            }
          } else if (msg.includes("developer") || msg.includes("engineer")) {
            const devMatch = lastUserMessage.match(/i'?m (?:a )?(.+?)(?:\.|\,|\!|\?|$)/i);
            if (devMatch && (devMatch[1].includes("developer") || devMatch[1].includes("engineer"))) {
              extractedMemory = `User is a ${devMatch[1].trim()}.`;
            }
          }
        }
        // Preference patterns (likes/dislikes)
        else if (msg.includes("i like") || msg.includes("i love") || msg.includes("i enjoy")) {
          const likeMatch = lastUserMessage.match(/i (?:like|love|enjoy) (.+?)(?:\.|\,|\!|\?|$)/i);
          if (likeMatch) {
            const item = likeMatch[1].trim();
            if (item.length > 1 && item.length < 50) {
              extractedMemory = `User likes ${item}.`;
            }
          }
        }
        else if (msg.includes("i hate") || msg.includes("i don't like") || msg.includes("i dislike")) {
          const dislikeMatch = lastUserMessage.match(/i (?:hate|don't like|dislike) (.+?)(?:\.|\,|\!|\?|$)/i);
          if (dislikeMatch) {
            const item = dislikeMatch[1].trim();
            if (item.length > 1 && item.length < 50) {
              extractedMemory = `User dislikes ${item}.`;
            }
          }
        }

        if (extractedMemory) {
          console.log("✅ Fallback extracted memory:", extractedMemory);
          await callGeminiTool('about_user_write', { memory: extractedMemory });
          console.log("✅ Memory successfully saved via fallback");
        } else {
          console.log("❌ No memory could be extracted from user message");
        }
      }
    }

    // Log the current user memory after processing
    const currentMemory = await readUserMemory();
    console.log("Current user memory after processing:", currentMemory);

    sendResponse({ success: true });
  } catch (error) {
    console.error("Error in Gemini response handling:", error);
    sendResponse({ error: error.message || "An unknown error occurred during Gemini processing." });
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
      const doc = document;
      if (!doc || !doc.body) {
        return { ok: false, error: "No document body available" };
      }
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // Find the main scrollable element
      const findScrollableElement = () => {
        const candidates = [document.documentElement, document.body];
        let bestCandidate = document.documentElement;
        
        // Check for elements with explicit overflow style
        const elements = document.querySelectorAll('*');
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            if (el.scrollHeight > el.clientHeight) {
              candidates.push(el);
            }
          }
        }

        // Determine the best candidate based on scroll height
        for (const el of candidates) {
          if (el.scrollHeight > bestCandidate.scrollHeight) {
            bestCandidate = el;
          }
        }
        return bestCandidate;
      };

      const scrollableElement = findScrollableElement();
      const totalHeight = scrollableElement.scrollHeight;
      const viewportH = window.innerHeight;
      const steps = Math.max(1, Math.ceil(totalHeight / viewportH));

      const originalScrollTop = scrollableElement.scrollTop;
      const slices = [];

      for (let i = 0; i < steps; i++) {
        const y = i * viewportH;
        scrollableElement.scrollTo({ top: y, left: 0, behavior: 'instant' });
        await sleep(200); // Increased delay for dynamic content

        const dataUrl = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "captureImage" }, (resp) => {
            resolve(resp && !chrome.runtime.lastError ? resp.dataUrl : "");
          });
        });

        if (!dataUrl) continue;

        const img = new Image();
        await new Promise((res) => { img.onload = res; img.onerror = res; img.src = dataUrl; });

        const scale = Math.min(1, maxWidth / (img.width || 1));
        const outW = Math.floor((img.width || 1) * scale);
        const outH = Math.floor((img.height || 1) * scale);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, outW, outH);
        }
        const png = canvas.toDataURL('image/png');
        slices.push({ url: png, w: outW, h: outH, index: i });
      }

      // Restore original scroll position
      scrollableElement.scrollTo({ top: originalScrollTop, left: 0, behavior: 'instant' });

      return { ok: true, slices };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
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