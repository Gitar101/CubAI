// Test the intelligent memory extraction functionality
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

async function testIntelligentMemory() {
  console.log("=== Testing Intelligent Memory Extraction ===");
  
  try {
    // Clear any existing memory
    await writeUserMemory({});
    
    // Test meaningful information
    console.log("\n1. Testing meaningful information...");
    
    const meaningfulTests = [
      { input: "User is from India.", expected: "india" },
      { input: "User has a girlfriend named Surabhi.", expected: "surabhi" },
      { input: "User is the CEO of CubAI.", expected: "ceo" },
      { input: "User is a developer.", expected: "developer" },
      { input: "User dislikes lettuce.", expected: "lettuce" }
    ];
    
    for (const test of meaningfulTests) {
      console.log(`Adding: ${test.input}`);
      await toolHandlers.about_user_write({ memory: test.input });
    }
    
    const memory1 = await readUserMemory();
    console.log("Memory after meaningful info:", memory1.userProfile);
    
    // Test meaningless information (should be skipped)
    console.log("\n2. Testing meaningless information (should be skipped)...");
    
    const meaninglessTests = [
      'User mentioned: "hiiiiii"',
      'User mentioned: "im bored"',
      'User mentioned: "hello"',
      'User mentioned: "thanks"',
      'User greeted the assistant.'
    ];
    
    for (const test of meaninglessTests) {
      console.log(`Attempting to add: ${test}`);
      await toolHandlers.about_user_write({ memory: test });
    }
    
    const memory2 = await readUserMemory();
    console.log("Memory after meaningless info (should be unchanged):", memory2.userProfile);
    
    // Test duplicate information (should be skipped)
    console.log("\n3. Testing duplicate information (should be skipped)...");
    await toolHandlers.about_user_write({ memory: "User is from India." });
    
    const memory3 = await readUserMemory();
    console.log("Memory after duplicate info (should be unchanged):", memory3.userProfile);
    
    // Validation
    console.log("\n=== VALIDATION ===");
    
    const profile = memory3.userProfile ? memory3.userProfile.toLowerCase() : '';
    
    // Check that meaningful info is present
    const expectedMeaningful = ['india', 'surabhi', 'ceo', 'cubai', 'developer', 'lettuce'];
    let meaningfulPresent = true;
    
    for (const info of expectedMeaningful) {
      if (profile.includes(info)) {
        console.log(`✓ Contains meaningful info: ${info}`);
      } else {
        console.log(`✗ Missing meaningful info: ${info}`);
        meaningfulPresent = false;
      }
    }
    
    // Check that meaningless info is NOT present
    const meaninglessTerms = ['hiiiiii', 'im bored', 'hello', 'thanks', 'greeted'];
    let meaninglessAbsent = true;
    
    for (const term of meaninglessTerms) {
      if (profile.includes(term)) {
        console.log(`✗ Contains meaningless info: ${term}`);
        meaninglessAbsent = false;
      } else {
        console.log(`✓ Correctly excluded meaningless info: ${term}`);
      }
    }
    
    // Check that the profile is coherent (not just a list of "User mentioned:")
    const coherent = !profile.includes('user mentioned:');
    if (coherent) {
      console.log("✓ Profile is coherent (no raw 'User mentioned:' entries)");
    } else {
      console.log("✗ Profile contains raw 'User mentioned:' entries");
    }
    
    console.log("\n=== FINAL RESULT ===");
    console.log("Final user profile:", memory3.userProfile);
    
    if (meaningfulPresent && meaninglessAbsent && coherent) {
      console.log("🎉 Intelligent memory extraction test PASSED!");
      return { success: true, profile: memory3.userProfile };
    } else {
      console.log("❌ Intelligent memory extraction test FAILED!");
      return { success: false, profile: memory3.userProfile };
    }
    
  } catch (error) {
    console.error("Error during intelligent memory test:", error);
    return { success: false, error: error.message };
  }
}

// Run the test
testIntelligentMemory().then(result => {
  console.log("Test completed:", result);
  process.exit(result.success ? 0 : 1);
});
