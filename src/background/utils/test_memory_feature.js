// Mock chrome object for testing in a Node.js-like environment
global.chrome = {
  storage: {
    local: {
      data: {}, // This will simulate the local storage
      get: function(keys, callback) {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            result[key] = this.data[key];
          });
        } else if (typeof keys === 'string') {
          result[keys] = this.data[keys];
        }
        callback(result);
      },
      set: function(items, callback) {
        for (const key in items) {
          this.data[key] = items[key];
        }
        callback();
      },
    },
  },
};

// Import the functions to be tested
import { readUserMemory, writeUserMemory } from './userMemory.js';
import { callGeminiTool, toolHandlers } from '../api/gemini.js';

async function retestMemoryFeature() {
  const sampleMemory = {
    name: "Alice",
    interests: "art, music",
    country: "Germany",
    preferences: "creative, expressive",
    humor: "observational",
  };

  try {
    console.log("--- Starting full memory feature re-test ---");

    // 1. Test writing memory using the simulated tool call
    console.log("Attempting to write user memory via simulated tool call...");
    const writeResult = await callGeminiTool('about_user', 'about_user_write', { memory: sampleMemory });
    console.log("Simulated write tool call result:", writeResult);

    if (!writeResult || !writeResult.success) {
      throw new Error("Simulated write tool call failed.");
    }
    console.log("User memory written successfully via simulated tool call.");

    // 2. Test reading memory using the simulated tool call
    console.log("Attempting to read user memory via simulated tool call...");
    const readResult = await callGeminiTool('about_user', 'about_user_read', {});
    console.log("Simulated read tool call result:", readResult);

    if (!readResult) {
      throw new Error("Simulated read tool call returned no result.");
    }

    // Compare the read result with the original sample memory
    if (JSON.stringify(sampleMemory) === JSON.stringify(readResult)) {
      console.log("Full re-test successful: Read memory matches written memory via simulated tool calls.");
      return { success: true, message: "Memory feature is fully functional after all changes." };
    } else {
      console.error("Full re-test failed: Read memory does not match written memory via simulated tool calls.");
      return { success: false, message: "Memory feature re-test failed.", written: sampleMemory, read: readResult };
    }
  } catch (error) {
    console.error("An error occurred during full memory feature re-test:", error);
    return { success: false, message: `An error occurred during full re-test: ${error.message}` };
  }
}

// Execute the test function
retestMemoryFeature().then(result => {
  console.log("Full re-test final result:", result);
  // In a real scenario, you'd use attempt_completion here.
  // For this delegated task, just log the result.
});