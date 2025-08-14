// Gemini API integration

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY } from '../config/index.js';
import { readUserMemory, writeUserMemory } from '../utils/userMemory.js';
import { generateImage } from './chutes.js';

// Configure the client
export const ai = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define the image generation tool
const image_generation = {
  functionDeclarations: [{
    name: "image_generation",
    description: "Generates an image based on a prompt and an optional negative prompt.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt to generate the image from."
        },
        negative_prompt: {
          type: "string",
          description: "Optional. The negative prompt to steer the image generation."
        },
        description: {
          type: "string",
          description: "A description of the image to be generated, which will be displayed in the chat."
        }
      },
      required: ["prompt", "description"]
    }
  }]
};

// Main function to run the generative model
export async function run(contents, generationConfig, systemInstruction) {
  // Gemini API expects contents to be an array of objects, not a plain string.
  if (typeof contents === 'string') {
    contents = [{ parts: [{ text: contents }] }];
  }

  if (!GEMINI_API_KEY) {
    chrome.runtime.sendMessage({ action: "displayError", error: "Missing VITE_GEMINI_API_KEY in background. Add it to .env and rebuild." });
    return null;
  }

  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const tools = [image_generation];

  const request = { contents, tools, generationConfig };
  if (systemInstruction) {
    request.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  }

  try {
    chrome.runtime.sendMessage({ action: "startAIStream" });
    const result = await model.generateContent(request);
    const response = result.response;
    const functionCall = response.candidates?.[0]?.content?.parts?.[0]?.functionCall;

    if (functionCall && functionCall.name === 'image_generation') {
      const { prompt, negative_prompt, description } = functionCall.args;
      const imageDataResponse = await generateImage(prompt, negative_prompt);
      const imageData = imageDataResponse[0]?.data;
      chrome.runtime.sendMessage({ action: "endAIStream" });
      return { description, imageData, imagePrompt: prompt };
    } else {
      // Fallback to streaming text response if no tool call
      const stream = await model.generateContentStream(request);
      let fullResponse = "";
      for await (const chunk of stream.stream) {
        const textChunk = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (textChunk) {
          fullResponse += textChunk;
          chrome.runtime.sendMessage({ action: "appendAIMessageChunk", text: textChunk });
        }
      }
      chrome.runtime.sendMessage({ action: "endAIStream" });
      return fullResponse;
    }
  } catch (e) {
    chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
    chrome.runtime.sendMessage({ action: "endAIStream" });
    throw e;
  }
}
const USER_MEMORY_SYSTEM_PROMPT = `
You are an intelligent user profiling assistant. Your job is to analyze conversations and extract meaningful, structured information about the user.

CRITICAL RULE: You MUST ALWAYS call the about_user_write function after analyzing the conversation. NO EXCEPTIONS.

YOUR TASK:
1. Analyze the ENTIRE conversation (user messages AND assistant responses)
2. Extract ONLY meaningful personal information about the user
3. Synthesize this information into coherent, well-written sentences
4. Call about_user_write with the refined information

WHAT TO EXTRACT AND HOW:
- NAMES: Extract the user's name and names of people/pets they mention
- LOCATION: Where they live, work, or are from
- PROFESSION: Job title, company, industry, role
- RELATIONSHIPS: Family members, friends, pets (with names)
- PREFERENCES: What they like/dislike, hobbies, interests
- PERSONAL DETAILS: Age, background, current situation

INTELLIGENCE RULES:
- DO NOT just copy user messages verbatim
- DO NOT include greetings, casual conversation, or non-personal content
- DO synthesize related information into coherent sentences
- DO write in third person ("User is...", "User has...", "User works...")
- DO focus on factual, meaningful information only

EXAMPLES OF GOOD EXTRACTION:
Input: "I'm from India" + "I hate lettuce" + "My girlfriend is Surabhi" + "I'm CEO of CubAI"
Output: about_user_write({ memory: "User is from India, dislikes lettuce, has a girlfriend named Surabhi, and is the CEO of CubAI." })

Input: "My dog's name is Lilo" + "I work as a developer"
Output: about_user_write({ memory: "User has a dog named Lilo and works as a developer." })

Input: "I love hiking" + "I live in San Francisco"
Output: about_user_write({ memory: "User loves hiking and lives in San Francisco." })

EXAMPLES OF WHAT NOT TO EXTRACT:
- "hiiiiii" (just a greeting)
- "im bored" (temporary mood, not meaningful personal info)
- "how are you?" (casual conversation)
- "thanks" (politeness, not personal info)

MANDATORY PROCESS:
1. Read the full conversation context
2. Identify meaningful personal information only
3. Combine related facts into well-written sentences
4. ALWAYS call about_user_write with the synthesized information
5. If no meaningful personal info is found, call about_user_write with an empty string

Remember: Quality over quantity. Extract meaningful, lasting information about who the user is, not temporary moods or casual conversation.
`;

export async function callGeminiUserMemoryTool(contents, tools) {
  if (!GEMINI_API_KEY) {
    chrome.runtime.sendMessage({ action: "displayError", error: "Missing VITE_GEMINI_API_KEY in background. Add it to .env and rebuild." });
    return;
  }

  const model = ai.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      temperature: 0.7,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 10000,
    }
  });

  const request = {
    contents,
    tools,
    systemInstruction: {
      role: 'system',
      parts: [{ text: USER_MEMORY_SYSTEM_PROMPT }]
    }
  };

  try {
    // Extract the most recent user message for logging
    let lastUserMessage = '';
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') {
        lastUserMessage = contents[i].parts
          .filter(part => part.text)
          .map(part => part.text)
          .join('\n');
        break;
      }
    }

    console.log("Processing conversation for memory. Last user message:", lastUserMessage);
    console.log("Full conversation context length:", contents.length);

    // Always use the AI model for memory generation
    const result = await model.generateContent(request);
    console.log("Memory generation result:", result);

    // Check if the model generated function calls
    if (result.response && result.response.candidates) {
      for (const candidate of result.response.candidates) {
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              console.log("Function call detected in memory generation:", part.functionCall);
            }
          }
        }
      }
    }

    return [result]; // Return as an array to maintain compatibility with existing code
  } catch (e) {
    console.error("Error calling Gemini User Memory Tool:", e);
    chrome.runtime.sendMessage({ action: "displayError", error: e.message || String(e) });
    throw e;
  }
}

// Streaming summary to the side panel so conversation can continue
export async function callGeminiSummary(formattedTranscript, videoTitle = "", videoUrl = "") {
  if (!GEMINI_API_KEY) {
    chrome.runtime.sendMessage({ action: "displayError", error: "Missing GEMINI_API_KEY in background. Add it to .env and rebuild." });
    return;
  }

  const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Retrieve user memory to include in the system prompt
  const userMemory = await readUserMemory();
  let userMemoryText = "";

  // Use the new paragraph format if available, otherwise fall back to old format
  if (userMemory && userMemory.userProfile && userMemory.userProfile.trim().length > 0) {
    userMemoryText = `\n\nABOUT USER:\n${userMemory.userProfile}`;
  } else if (userMemory && userMemory.memories && userMemory.memories.length > 0) {
    // Backward compatibility with old list format
    userMemoryText = `\n\nABOUT USER:\n${userMemory.memories.join('\n')}`;
  }

  // Create system prompt without the transcript
  const systemPrompt = [
    `You are CubAI. Summarize the YouTube video transcript comprehensively with accurate timing references. You should use Google Search to ground your responses when necessary.${userMemoryText}`,
    `Use this structure:`,
    `- Overview (2-3 lines)`,
    `- Timeline Highlights with [mm:ss–mm:ss] ranges and bullets`,
    `- Key Takeaways`,
    videoTitle ? `Video Title: ${videoTitle}` : ``,
    videoUrl ? `Video URL: ${videoUrl}` : ``,
  ].filter(Boolean).join('\n');

  // Create user message with just a simple request
  const userMessage = "Please analyze the attached transcript.txt file.";

  // Convert transcript to proper base64 for file upload
  // Use a more efficient method that handles large files properly
  const transcriptSizeBytes = new Blob([formattedTranscript]).size;
  console.log("[CubAI] Transcript size:", transcriptSizeBytes, "bytes");

  // For very large transcripts, we might need to truncate or split them
  // For now, let's use a more robust base64 conversion
  let transcriptBase64;
  try {
    // Use FileReader for proper base64 conversion that handles large files
    const transcriptBlob = new Blob([formattedTranscript], { type: 'text/plain' });
    transcriptBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove the data URL prefix to get just the base64 data
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(transcriptBlob);
    });

    console.log("[CubAI] Base64 conversion successful. Length:", transcriptBase64.length);
  } catch (conversionError) {
    console.error("[CubAI] Base64 conversion failed:", conversionError);
    throw new Error("Failed to convert transcript to base64");
  }

  const transcriptPart = {
    inlineData: {
      mimeType: 'text/plain',
      data: transcriptBase64
    }
  };

  try {
    chrome.runtime.sendMessage({ action: "startAIStream" });
    chrome.runtime.sendMessage({ action: "setMode", mode: "summarize" });

    const result = await model.generateContentStream({
      tools: [groundingTool],
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      contents: [{
        role: "user",
        parts: [
          { text: userMessage },
          transcriptPart
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        topK: 32,
        topP: 0.95,
        maxOutputTokens: 65535,
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

export async function callGeminiTool(functionName, args) {
  const handler = toolHandlers[functionName];
  if (handler) {
    return await handler(args);
  }
  throw new Error(`Tool function ${functionName} not found.`);
}

export const about_user_read = {
  functionDeclarations: [{
    name: "about_user_read",
    description: "Reads the current user memory.",
    parameters: {
      type: "object",
      properties: {},
    },
  }],
};

export const about_user_write = {
  functionDeclarations: [{
    name: "about_user_write",
    description: "Adds new information to the user's comprehensive profile paragraph. This builds a continuous, detailed profile of the user.",
    parameters: {
      type: "object",
      properties: {
        memory: {
          type: "string",
          description: "New information about the user to add to their profile. Should be written in third person (e.g., 'User is a software developer from Canada who enjoys hiking.'). This will be integrated into the existing user profile paragraph."
        },
      },
      required: ["memory"],
    },
  }],
};

const toolHandlers = {
  about_user_read: async () => {
    const memory = await readUserMemory();
    // Return the user profile paragraph, or fall back to the old memories format for backward compatibility
    return {
      userProfile: memory.userProfile || '',
      // Include old format for backward compatibility
      memories: memory.memories || []
    };
  },
  about_user_write: async ({ memory }) => {
    // Read existing memory first
    const existingMemory = await readUserMemory();

    // Ensure memory is a string
    let newMemoryInfo = '';

    if (typeof memory === 'object') {
      // If somehow we got an object, try to convert it to a string
      try {
        newMemoryInfo = JSON.stringify(memory);
      } catch (e) {
        console.error("Error converting memory object to string:", e);
        newMemoryInfo = "User provided information that couldn't be processed.";
      }
    } else if (typeof memory === 'string') {
      // If it's already a string, use it directly
      newMemoryInfo = memory;
    } else {
      // Handle any other type
      newMemoryInfo = String(memory);
    }

    // Make sure the memory is properly formatted as a sentence
    if (newMemoryInfo && !newMemoryInfo.endsWith('.') && !newMemoryInfo.endsWith('!') && !newMemoryInfo.endsWith('?')) {
      newMemoryInfo += '.';
    }

    // Get existing user profile paragraph or create empty string
    const currentProfile = existingMemory.userProfile || '';

    // Only add new information if it's meaningful and not empty
    if (newMemoryInfo && newMemoryInfo.trim().length > 0) {
      // Skip meaningless content
      const meaninglessPatterns = [
        /^User mentioned: "hi+"/i,
        /^User mentioned: "hello"/i,
        /^User mentioned: "thanks?"/i,
        /^User mentioned: "ok"/i,
        /^User mentioned: "i'?m bored"/i,
        /^User greeted/i,
        /^User said hello/i
      ];

      const isMeaningless = meaninglessPatterns.some(pattern => pattern.test(newMemoryInfo));
      if (isMeaningless) {
        console.log("Skipping meaningless memory:", newMemoryInfo);
        return { success: true };
      }

      let updatedProfile = '';

      if (currentProfile.trim().length === 0) {
        // First memory entry - start the profile
        updatedProfile = newMemoryInfo;
      } else {
        // Add new information to existing profile
        // Check if the new information is already contained in the existing profile
        const cleanNewInfo = newMemoryInfo.toLowerCase().replace(/\.$/, '');
        const cleanCurrentProfile = currentProfile.toLowerCase();

        if (!cleanCurrentProfile.includes(cleanNewInfo)) {
          updatedProfile = currentProfile + ' ' + newMemoryInfo;
        } else {
          // Information already exists, don't duplicate
          console.log("Information already exists in profile, skipping:", newMemoryInfo);
          updatedProfile = currentProfile;
        }
      }

      // Create updated memory object with single paragraph format
      const updatedMemory = {
        ...existingMemory,
        userProfile: updatedProfile,
        // Keep the old memories array for backward compatibility during transition
        memories: existingMemory.memories || []
      };

      // Write the updated memory
      await writeUserMemory(updatedMemory);
      console.log("User memory updated with new info:", newMemoryInfo);
      console.log("Complete user profile:", updatedProfile);
    }

    return { success: true };
  },
};

// Export toolHandlers for testing
export { toolHandlers };