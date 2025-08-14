import { useState, useEffect } from 'react';

export const useUIState = () => {
  const [mode, setMode] = useState('chat');
  const [generationMode, setGenerationMode] = useState('chat');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showTabsMenu, setShowTabsMenu] = useState(false);
  const [availableTabs, setAvailableTabs] = useState([]);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [showModelMenu, setShowModelMenu] = useState(false);

  const toggleModeMenu = () => {
    setShowTabsMenu(false);
    setShowModelMenu(false);
    setShowModeMenu(v => !v);
  };

  const selectMode = (m) => {
    setMode(m);
    setShowModeMenu(false);
    if (m === 'Summarize') {
      try {
        chrome.runtime.sendMessage({ action: "refreshSummarization" });
      } catch (e) {
        console.error("[CubAI] Error sending refreshSummarization message:", e);
      }
    }
  };

  const onSelectModel = (model) => {
    setSelectedModel(model);
    setShowModelMenu(false);
  };

  const toggleTabsMenu = () => {
    const next = !showTabsMenu;
    setShowModeMenu(false);
    setShowModelMenu(false);
    setShowTabsMenu(next);
    if (next) {
      try {
        chrome.runtime.sendMessage({ action: "listTabs" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            return;
          }
          if (response?.error) {
            console.error(response.error);
            return;
          }
          setAvailableTabs(response?.tabs || []);
        });
      } catch (e) {
        // In non-extension environments, fail silently
      }
    }
  };

  useEffect(() => {
    const onPointerDown = (e) => {
      const target = e.target;
      const closest = (sel) => target.closest(sel);

      const inMode = closest('[data-menu="mode"]') || closest('[data-trigger="mode"]');
      const inTabs = closest('[data-menu="tabs"]') || closest('[data-trigger="tabs"]');
      const inModel = closest('[data-menu="model"]') || closest('[data-trigger="model"]');

      if (!inMode && showModeMenu) setShowModeMenu(false);
      if (!inTabs && showTabsMenu) setShowTabsMenu(false);
      if (!inModel && showModelMenu) setShowModelMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [showModeMenu, showTabsMenu, showModelMenu]);

  return {
    mode,
    setMode,
    generationMode,
    setGenerationMode,
    showModeMenu,
    toggleModeMenu,
    selectMode,
    showTabsMenu,
    toggleTabsMenu,
    availableTabs,
    selectedModel,
    onSelectModel,
    showModelMenu,
    setShowModelMenu,
    toggleGenerationMode: () => setGenerationMode(prev => prev === 'chat' ? 'image' : 'chat'),
  };
};