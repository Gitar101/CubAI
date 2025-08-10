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

import { readUserMemory, writeUserMemory } from './userMemory.js';

async function testUserMemoryChromeStorage() {
  const sampleMemory = {
    name: "Jane Doe",
    interests: "reading, gaming",
    country: "Canada",
    preferences: "detailed, friendly",
    humor: "sarcastic",
  };

  try {
    console.log("Attempting to write user memory to mock chrome.storage.local...");
    await writeUserMemory(sampleMemory);
    console.log("User memory written successfully to mock storage.");

    console.log("Attempting to read user memory from mock chrome.storage.local...");
    const readMemory = await readUserMemory();
    console.log("User memory read from mock storage:", readMemory);

    if (JSON.stringify(sampleMemory) === JSON.stringify(readMemory)) {
      console.log("Re-test successful: Read memory matches written memory using chrome.storage.local.");
      return { success: true, message: "User memory feature is working correctly with chrome.storage.local." };
    } else {
      console.error("Re-test failed: Read memory does not match written memory using chrome.storage.local.");
      return { success: false, message: "User memory feature re-test failed.", written: sampleMemory, read: readMemory };
    }
  } catch (error) {
    console.error("An error occurred during user memory re-test:", error);
    return { success: false, message: `An error occurred during re-test: ${error.message}` };
  }
}

// Execute the test function
testUserMemoryChromeStorage().then(result => {
  console.log("Re-test result:", result);
  // In a real scenario, you'd use attempt_completion here.
  // For this delegated task, just log the result.
});