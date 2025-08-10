// Test the memory extraction functionality
// Mock chrome object for testing
global.chrome = {
  storage: {
    local: {
      data: {},
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
  runtime: {
    sendMessage: function(message) {
      console.log("Mock chrome.runtime.sendMessage:", message);
    }
  }
};

// Import the functions to be tested
import { readUserMemory, writeUserMemory } from './userMemory.js';
import { toolHandlers } from '../api/gemini.js';

async function testMemoryExtraction() {
  console.log("=== Testing Memory Extraction ===");
  
  try {
    // Clear any existing memory
    await writeUserMemory({});
    
    // Test 1: "I'm from India"
    console.log("\n1. Testing 'I'm from India'...");
    const result1 = await toolHandlers.about_user_write({ 
      memory: "User is from India." 
    });
    console.log("Result 1:", result1);
    
    const memory1 = await readUserMemory();
    console.log("Memory after 'I'm from India':", memory1);
    
    // Test 2: "My dog's name is Lilo"
    console.log("\n2. Testing 'My dog's name is Lilo'...");
    const result2 = await toolHandlers.about_user_write({ 
      memory: "User has a dog named Lilo." 
    });
    console.log("Result 2:", result2);
    
    const memory2 = await readUserMemory();
    console.log("Memory after dog info:", memory2);
    
    // Test 3: Additional info
    console.log("\n3. Testing additional info...");
    const result3 = await toolHandlers.about_user_write({ 
      memory: "User works as a software engineer." 
    });
    console.log("Result 3:", result3);
    
    const memory3 = await readUserMemory();
    console.log("Memory after work info:", memory3);
    
    // Test 4: Reading memory
    console.log("\n4. Testing memory reading...");
    const readResult = await toolHandlers.about_user_read();
    console.log("Read result:", readResult);
    
    // Validation
    console.log("\n=== VALIDATION ===");
    
    // Check that we have a userProfile field
    if (memory3.userProfile) {
      console.log("✓ userProfile field exists");
      console.log("User Profile:", memory3.userProfile);
    } else {
      console.log("✗ userProfile field missing");
    }
    
    // Check that the profile contains the expected information
    const profile = memory3.userProfile ? memory3.userProfile.toLowerCase() : '';
    const expectedInfo = ['india', 'lilo', 'dog', 'software engineer'];
    
    let allInfoPresent = true;
    for (const info of expectedInfo) {
      if (profile.includes(info)) {
        console.log(`✓ Contains: ${info}`);
      } else {
        console.log(`✗ Missing: ${info}`);
        allInfoPresent = false;
      }
    }
    
    if (allInfoPresent && memory3.userProfile) {
      console.log("🎉 Memory extraction test PASSED!");
      return { success: true, profile: memory3.userProfile };
    } else {
      console.log("❌ Memory extraction test FAILED!");
      return { success: false, profile: memory3.userProfile };
    }
    
  } catch (error) {
    console.error("Error during memory extraction test:", error);
    return { success: false, error: error.message };
  }
}

// Run the test
testMemoryExtraction().then(result => {
  console.log("Test completed:", result);
  process.exit(result.success ? 0 : 1);
});
