import { Groq } from "groq-sdk";
import { GROQ_API_KEY } from '../config/index.js';

export const groq = new Groq({
  apiKey: GROQ_API_KEY,
});

export async function runGroq(contents, generationConfig, systemInstruction, modelName, mode, messageId) {
  if (!GROQ_API_KEY) {
    chrome.runtime.sendMessage({ action: "displayError", error: "Missing VITE_GROQ_API_KEY in background. Add it to .env and rebuild." });
    return null;
  }

  try {
    // Revert the previous change to re-enable streaming for all models
    chrome.runtime.sendMessage({ action: "startAIStream", messageId: messageId });

    const messages = contents.map(item => ({
      role: item.role === 'model' ? 'assistant' : item.role, // Map 'model' to 'assistant' for Groq
      content: item.parts.map(part => part.text).join('')
    }));

    const request = {
      model: modelName,
      messages: messages,
      temperature: generationConfig.temperature,
      max_tokens: generationConfig.maxOutputTokens,
      top_p: generationConfig.topP,
      stream: true,
      stop: null,
    };

    // Add reasoning_effort for specific models
    const modelsWithReasoning = ["openai/gpt-oss-120b"];
    if (modelsWithReasoning.includes(modelName)) {
      request.reasoning_effort = "medium";
    }

    const completion = await groq.chat.completions.create(request);

    let fullContent = "";
    let fullReasoning = "";
    let isReasoningStreaming = false;
    let isContentStreaming = false;

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta;
      console.log("Received delta chunk:", delta); // Log the delta to inspect its structure
      const textChunk = delta?.content || "";
      let currentThinkingChunk = "";

      if (delta?.channel === "analysis" && delta?.reasoning) {
        currentThinkingChunk = delta.reasoning;
      }

      if (currentThinkingChunk) {
        if (!isReasoningStreaming) {
          if (isContentStreaming) {
            // If content was streaming, close it and add a newline
            chrome.runtime.sendMessage({ action: "appendAIMessageChunk", text: "\n" });
            isContentStreaming = false;
          }
          chrome.runtime.sendMessage({ action: "startReasoningStream", messageId: messageId }); // Signal start of reasoning
          isReasoningStreaming = true;
        }
        fullReasoning += currentThinkingChunk;
        chrome.runtime.sendMessage({ action: "appendReasoningChunk", text: currentThinkingChunk, messageId: messageId });
      } else if (textChunk) {
        if (!isContentStreaming) {
          isContentStreaming = true;
        }
        fullContent += textChunk;
        chrome.runtime.sendMessage({ action: "appendAIMessageChunk", text: textChunk, messageId: messageId });
      }
    }

    if (isReasoningStreaming) {
      chrome.runtime.sendMessage({ action: "endReasoningStream", messageId: messageId });
    }
    // No explicit closing for content, as per the desired format.
    // If content was streaming, it just ends.

    chrome.runtime.sendMessage({ action: "endAIStream" });

    const finalResponse = {
      role: "assistant",
      content: fullContent,
      reasoning: fullReasoning || undefined,
    };
    console.log(finalResponse);

    return fullContent;

  } catch (e) {
    chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
    chrome.runtime.sendMessage({ action: "endAIStream" });
    throw e;
  }
}