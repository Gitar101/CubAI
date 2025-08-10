export async function readUserMemory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userMemory'], (result) => {
      resolve(result.userMemory || {});
    });
  });
}

export async function writeUserMemory(memory) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ userMemory: memory }, () => {
      resolve();
    });
  });
}