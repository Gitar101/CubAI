// Gemini API integration

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY, groundingTool } from '../config/index.js';

// Configure the client
export const ai = new GoogleGenerativeAI(GEMINI_API_KEY);

// Helper to stream Gemini responses
export async function streamGeminiResponse(contents, generationConfig, systemInstruction) {
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

// Streaming summary to the side panel so conversation can continue
export async function callGeminiSummary(formattedTranscript, videoTitle = "", videoUrl = "") {
  if (!GEMINI_API_KEY) {
    chrome.runtime.sendMessage({ action: "displayError", error: "Missing GEMINI_API_KEY in background. Add it to .env and rebuild." });
    return;
  }

  const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const prompt = [
    `You are CubAI. Summarize the YouTube video transcript comprehensively with accurate timing references. You should use Google Search to ground your responses when necessary.`,
    `Use this structure:`,
    `- Overview (2-3 lines)`,
    `- Timeline Highlights with [mm:ss–mm:ss] ranges and bullets`,
    `- Key Takeaways`,
    videoTitle ? `Video Title: ${videoTitle}` : ``,
    videoUrl ? `Video URL: ${videoUrl}` : ``,
    ``,
    `Transcript (with timestamps):`,
    formattedTranscript
  ].filter(Boolean).join('\n');

  try {
    chrome.runtime.sendMessage({ action: "startAIStream" });
    chrome.runtime.sendMessage({ action: "setMode", mode: "summarize" });

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topK: 32,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });

    for await (const chunk of result.stream) {
      const textChunk = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (textChunk) {
        chrome.runtime.sendMessage({ action: "appendAIMessageChunk", text: textChunk });
      }
    }

    chrome.runtime.sendMessage({ action: "endAIStream" });
    chrome.runtime.sendMessage({ 
      action: "appendUserMessage", 
      text: `//context-url: ${videoUrl}`,
      silent: true
    });

    // Reset summarize state
    chrome.runtime.sendMessage({ action: "resetSummarizeState" });
  } catch (e) {
    console.error("Error calling Gemini API:", e);
    chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
    chrome.runtime.sendMessage({ action: "endAIStream" });
    chrome.runtime.sendMessage({ action: "resetSummarizeState" });
  }
}