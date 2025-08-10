// Test for the enhanced memory system with paragraph format and comprehensive user profiling
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
  runtime: {
    sendMessage: function(message) {
      console.log("Mock chrome.runtime.sendMessage:", message);
    }
  }
};

// Import the functions to be tested
import { readUserMemory, writeUserMemory } from './userMemory.js';
import { toolHandlers } from '../api/gemini.js';

async function testEnhancedMemorySystem() {
  console.log("=== Testing Enhanced Memory System ===");
  
  try {
    // Clear any existing memory
    await writeUserMemory({});
    
    // Test 1: First memory entry (should create new profile)
    console.log("\n1. Testing first memory entry...");
    const result1 = await toolHandlers.about_user_write({ 
      memory: "User's name is Alice and she works as a software engineer at Google." 
    });
    console.log("Result 1:", result1);
    
    const memory1 = await readUserMemory();
    console.log("Memory after first entry:", memory1);
    
    // Test 2: Second memory entry (should append to existing profile)
    console.log("\n2. Testing second memory entry...");
    const result2 = await toolHandlers.about_user_write({ 
      memory: "User lives in San Francisco and enjoys hiking on weekends." 
    });
    console.log("Result 2:", result2);
    
    const memory2 = await readUserMemory();
    console.log("Memory after second entry:", memory2);
    
    // Test 3: Third memory entry (should continue appending)
    console.log("\n3. Testing third memory entry...");
    const result3 = await toolHandlers.about_user_write({ 
      memory: "User has a cat named Whiskers and prefers tea over coffee." 
    });
    console.log("Result 3:", result3);
    
    const memory3 = await readUserMemory();
    console.log("Memory after third entry:", memory3);
    
    // Test 4: Fourth memory entry (testing continuous operation beyond 3 entries)
    console.log("\n4. Testing fourth memory entry (beyond 3 limit)...");
    const result4 = await toolHandlers.about_user_write({ 
      memory: "User is learning Python programming and wants to build AI applications." 
    });
    console.log("Result 4:", result4);
    
    const memory4 = await readUserMemory();
    console.log("Memory after fourth entry:", memory4);
    
    // Test 5: Fifth memory entry (confirming continuous operation)
    console.log("\n5. Testing fifth memory entry...");
    const result5 = await toolHandlers.about_user_write({ 
      memory: "User's favorite restaurant is a local Italian place called Mario's." 
    });
    console.log("Result 5:", result5);
    
    const memory5 = await readUserMemory();
    console.log("Memory after fifth entry:", memory5);
    
    // Test 6: Duplicate information (should not duplicate)
    console.log("\n6. Testing duplicate information handling...");
    const result6 = await toolHandlers.about_user_write({ 
      memory: "User's name is Alice and she works as a software engineer at Google." 
    });
    console.log("Result 6:", result6);
    
    const memory6 = await readUserMemory();
    console.log("Memory after duplicate entry:", memory6);
    
    // Test 7: Reading memory
    console.log("\n7. Testing memory reading...");
    const readResult = await toolHandlers.about_user_read();
    console.log("Read result:", readResult);
    
    // Validation
    console.log("\n=== VALIDATION ===");
    
    // Check that we have a userProfile field
    if (memory5.userProfile) {
      console.log("✓ userProfile field exists");
    } else {
      console.log("✗ userProfile field missing");
    }
    
    // Check that the profile is a single paragraph (not an array)
    if (typeof memory5.userProfile === 'string') {
      console.log("✓ userProfile is a string (paragraph format)");
    } else {
      console.log("✗ userProfile is not a string");
    }
    
    // Check that all information is included
    const profile = memory5.userProfile.toLowerCase();
    const expectedInfo = [
      'alice', 'software engineer', 'google', 'san francisco', 
      'hiking', 'cat', 'whiskers', 'tea', 'python', 'mario'
    ];
    
    let allInfoPresent = true;
    for (const info of expectedInfo) {
      if (profile.includes(info)) {
        console.log(`✓ Contains: ${info}`);
      } else {
        console.log(`✗ Missing: ${info}`);
        allInfoPresent = false;
      }
    }
    
    // Check that memory system worked beyond 3 entries
    if (memory5.userProfile.includes('Python') && memory5.userProfile.includes('Mario')) {
      console.log("✓ Memory system works beyond 3 entries");
    } else {
      console.log("✗ Memory system stopped working after 3 entries");
    }
    
    // Check that duplicate information wasn't added
    const aliceCount = (memory6.userProfile.match(/Alice/gi) || []).length;
    if (aliceCount <= 2) { // Should appear only once or twice at most
      console.log("✓ Duplicate information handled correctly");
    } else {
      console.log(`✗ Duplicate information added (Alice appears ${aliceCount} times)`);
    }
    
    console.log("\n=== TEST SUMMARY ===");
    if (allInfoPresent && memory5.userProfile && typeof memory5.userProfile === 'string') {
      console.log("🎉 Enhanced memory system test PASSED!");
      console.log("Final user profile:", memory5.userProfile);
      return { success: true, profile: memory5.userProfile };
    } else {
      console.log("❌ Enhanced memory system test FAILED!");
      return { success: false, profile: memory5.userProfile };
    }
    
  } catch (error) {
    console.error("Error during enhanced memory system test:", error);
    return { success: false, error: error.message };
  }
}

// Run the test if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  testEnhancedMemorySystem().then(result => {
    console.log("Test completed:", result);
  });
}

export { testEnhancedMemorySystem };
