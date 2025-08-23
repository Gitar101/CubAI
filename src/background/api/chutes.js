import { CHUTES_API_KEY } from '../config/index.js';

/**
 * Generates an image using the Chutes.ai API.
 *
 * @param {string} prompt - The prompt for the image generation.
 * @param {string} negative_prompt - The negative prompt for the image generation.
 * @returns {Promise<object>} The JSON response from the API.
 */
export async function generateImage(prompt, negative_prompt) {
  try {
    const response = await fetch("https://image.chutes.ai/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CHUTES_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "qwen-image",
        "prompt": prompt,
        "negative_prompt": negative_prompt || "", // Ensure negative_prompt is a string
        "guidance_scale": 7.5,
        "width": 1024,
        "height": 1024,
        "num_inference_steps": 50
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        console.log("Generated Image Data URL:", reader.result);
        resolve([{ type: "image", data: reader.result }]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}

/**
 * Invokes the Chutes.ai chat completions API with the GLM-4.5-Air model.
 *
 * @param {string} content - The user's message content.
 * @returns {Promise<object>} The JSON response from the API.
 */
export async function invokeChuteGLM(messages) {
  try {
    const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${import.meta.env.VITE_CHUTES_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "zai-org/GLM-4.5-Air",
        "messages": messages.map(msg => ({
          role: msg.role === 'model' ? 'assistant' : msg.role, // Chutes API uses 'assistant' for model role
          content: msg.parts.map(part => part.text).join('\n') // Assuming only text parts for chat
        })),
        "stream": true,
        "max_tokens": 8000,
        "temperature": 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullResponseText = "";
    chrome.runtime.sendMessage({ action: "startAIStream" });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonString = line.substring(6).trim();
          if (jsonString === '[DONE]') {
            break; // End of stream
          }
          try {
            const data = JSON.parse(jsonString);
            if (data.choices && data.choices.length > 0 && data.choices[0].delta && data.choices[0].delta.content) {
              const textChunk = data.choices[0].delta.content;
              fullResponseText += textChunk;
              chrome.runtime.sendMessage({ action: "appendAIMessageChunk", text: textChunk });
            }
          } catch (parseError) {
            console.error("Error parsing JSON from stream line:", line, parseError);
          }
        }
      }
    }
    chrome.runtime.sendMessage({ action: "endAIStream" });
    console.log("Chutes GLM-4.5-Air Full Response Text:", fullResponseText);
    return { text: fullResponseText }; // Return an object with a 'text' property
  } catch (error) {
    console.error("Error invoking Chutes GLM-4.5-Air:", error);
    throw error;
  }
}