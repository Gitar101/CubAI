import { readUserMemory, writeUserMemory } from './userMemory.js';

async function testUserMemory() {
  const sampleMemory = {
    name: "John Doe",
    interests: "coding, hiking",
    country: "USA",
    preferences: "concise, technical",
    humor: "dry wit",
  };

  try {
    console.log("Attempting to write user memory...");
    await writeUserMemory(sampleMemory);
    console.log("User memory written successfully.");

    console.log("Attempting to read user memory...");
    const readMemory = await readUserMemory();
    console.log("User memory read:", readMemory);

    // Simple comparison for testing purposes
    if (JSON.stringify(sampleMemory) === JSON.stringify(readMemory)) {
      console.log("Test successful: Read memory matches written memory.");
      return { success: true, message: "User memory feature is working correctly." };
    } else {
      console.error("Test failed: Read memory does not match written memory.");
      return { success: false, message: "User memory feature test failed.", written: sampleMemory, read: readMemory };
    }
  } catch (error) {
    console.error("An error occurred during user memory test:", error);
    return { success: false, message: `An error occurred: ${error.message}` };
  }
}

// Execute the test function
testUserMemory().then(result => {
  console.log("Test result:", result);
});