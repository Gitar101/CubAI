import { useState, useEffect } from 'react';

export const useContextState = () => {
  const [contexts, setContexts] = useState([]);
  const [contextPreview, setContextPreview] = useState(null);
  const [hasContextPillBeenRendered, setHasContextPillBeenRendered] = useState(false);

  useEffect(() => {
    const handleStorageChange = (changes, area) => {
      if (area === 'local' && changes.cubext) {
        setContexts(changes.cubext.newValue || []);
      }
    };

    chrome.storage.local.get('cubext', (data) => {
      if (data && data.cubext) {
        setContexts(data.cubext);
      }
    });

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const removeContext = (index) => {
    const newContexts = contexts.filter((_, i) => i !== index);
    setContexts(newContexts);
    chrome.storage.local.set({ cubext: newContexts });
  };

  const updateContextPreview = (newPreview) => {
    setContextPreview(newPreview);
    setHasContextPillBeenRendered(false);
  };

  return {
    contexts,
    setContexts,
    contextPreview,
    setContextPreview,
    updateContextPreview,
    hasContextPillBeenRendered,
    setHasContextPillBeenRendered,
    removeContext,
  };
};