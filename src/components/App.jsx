import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ShinyText from './ShinyText';
import SilkBackground from './SilkBackground.jsx';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

function App() {
  const [messages, setMessages] = useState([]);
  const [messageIdCounter, setMessageIdCounter] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  // Keep the full transcript as hidden system context so replies stay accurate
  const [systemContext, setSystemContext] = useState('');
  // Hidden system instruction to prepend to the request (do NOT show in UI)
  const [systemInstruction, setSystemInstruction] = useState('Answer strictly and only the user question using the page context. If unknown in context, say you cannot find it.');
  // Summary will arrive as a normal AI message now; retain for reference if needed
  const [summary, setSummary] = useState('');

  // UI state: system prompt mode and drop-ups
  // mode: "summarize" or "question"
  const [mode, setMode] = useState('question');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showTabsMenu, setShowTabsMenu] = useState(false);
  const [availableTabs, setAvailableTabs] = useState([]);

  // Model selector (only gemini 2.0 variants)
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
  const [showModelMenu, setShowModelMenu] = useState(false);

  // Debug helper to verify selection is applied
  useEffect(() => {
    try {
      console.log('[ModelSelector] Selected model changed:', selectedModel);
    } catch {}
  }, [selectedModel]);

  // Core chat streaming with context preserved
  const getGeminiResponse = async (currentMessages) => {
    setIsLoading(true);
    setError('');
    // Push an empty AI message for streaming fill
    setMessageIdCounter(prevCounter => {
      setMessages(prevMessages => [...prevMessages, { id: prevCounter, role: 'ai', content: [{ type: 'text', text: '' }] }]);
      return prevCounter + 1;
    });

    try {
      // Use selected model from header switcher; restrict to 2.0 variants only
      const model = selectedModel === 'gemini-2.0-flash-lite' ? 'gemini-2.0-flash-lite' : 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${GEMINI_API_KEY}`;
      const headers = { 'Content-Type': 'application/json' };

      // Inject hidden system instruction and context (transcript) at the start so they persist in-thread
      const augmented = [
        ...(systemInstruction
          ? [{ role: 'user', content: [{ type: 'text', text: `[INSTRUCTION]\n${systemInstruction}` }] }]
          : []),
        ...(systemContext
          ? [{ role: 'user', content: [{ type: 'text', text: systemContext }] }]
          : []),
        ...currentMessages
      ];

      const formattedMessages = augmented.map(msg => {
        const parts = msg.content.map(part => {
          if (part.type === 'text') return { text: part.text };
          if (part.type === 'image') return { inlineData: { mimeType: 'image/png', data: part.url.split(',')[1] } };
          return {};
        });
        return { role: msg.role === 'ai' ? 'model' : 'user', parts };
      });

      const body = {
        contents: formattedMessages,
        generationConfig: { temperature: 0.2, topP: 0.95, topK: 64, maxOutputTokens: 8192 },
      };

      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        let jsonStream = buffer;

        while (true) {
          const start = jsonStream.indexOf('{');
          if (start === -1) break;

          let braceCount = 0, end = -1, inString = false;
          for (let i = start; i < jsonStream.length; i++) {
            if (jsonStream[i] === '"' && (i === 0 || jsonStream[i - 1] !== '\\')) inString = !inString;
            if (inString) continue;
            if (jsonStream[i] === '{') braceCount++;
            else if (jsonStream[i] === '}') braceCount--;
            if (braceCount === 0) { end = i; break; }
          }

          if (end === -1) break;

          const objectStr = jsonStream.substring(start, end + 1);
          try {
            const json = JSON.parse(objectStr);
            if (json.candidates && json.candidates[0]?.content?.parts) {
              const aiMessagePart = json.candidates[0].content.parts[0];
              if (aiMessagePart?.text) {
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIdx = newMessages.length - 1;
                  if (lastIdx >= 0 && newMessages[lastIdx].role === 'ai') {
                    const updated = {
                      ...newMessages[lastIdx],
                      content: [{ ...newMessages[lastIdx].content[0], text: (newMessages[lastIdx].content[0]?.text || '') + aiMessagePart.text }]
                    };
                    newMessages[lastIdx] = updated;
                    return newMessages;
                  }
                  return prev;
                });
              }
            }
            jsonStream = jsonStream.substring(end + 1);
          } catch {
            jsonStream = jsonStream.substring(start + 1);
          }
        }
        buffer = jsonStream;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    if (chrome.runtime && chrome.runtime.onMessage) {
      const listener = (message, sender, sendResponse) => {
        if (message.action === "appendAIMessage") {
          // Treat summary as a normal AI message in chat (single insertion)
          const text = (message.text || '').trim();
          if (!text) return;

          setMessageIdCounter(prevCounter => {
            // Prevent immediately consecutive duplicate insertions
            let shouldInsert = true;
            setMessages(prev => {
              if (prev.length > 0) {
                const last = prev[prev.length - 1];
                const lastText = last?.content?.[0]?.text?.trim?.() || "";
                if (last.role === 'ai' && lastText === text) {
                  shouldInsert = false;
                  return prev;
                }
              }
              const next = shouldInsert
                ? [...prev, { id: prevCounter, role: 'ai', content: [{ type: 'text', text }] }]
                : prev;
              return next;
            });
            return shouldInsert ? prevCounter + 1 : prevCounter;
          });
          // Keep reference copy to show in the summary section if present
          setSummary(prev => (prev?.trim() === text ? prev : text));
          setError('');
        } else if (message.action === "appendSystemContext") {
          // Store transcript in hidden system context for future turns
          const text = message.text || '';
          setSystemContext(text);
        } else if (message.action === "displayError") {
          setError(message.error);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  // Removed "ask a follow up question" flow. Normal chat now covers this.

  // Toggle and populate system prompt switcher (drop-up)
  const toggleModeMenu = () => {
    // If opening this menu, ensure the other one closes
    setShowTabsMenu(false);
    setShowModelMenu(false);
    setShowModeMenu(v => !v);
  };
  const selectMode = (m) => {
    setMode(m);
    // Update the hidden instruction used for requests
    if (m === 'summarize') {
      setSystemInstruction('Summarize the provided page context succinctly with key points and structure.');
    } else {
      setSystemInstruction('Answer strictly and only the user question using the page context. If unknown in context, say you cannot find it.');
    }
    setShowModeMenu(false);
  };

  // Model select helpers
  const onSelectModel = (model) => {
    try { console.log('[ModelSelector] Click select:', model); } catch {}
    setSelectedModel(model);
    setShowModelMenu(false);
  };

  // Right control: add page context -> list tabs (drop-up)
  const toggleTabsMenu = () => {
    // If opening this menu, ensure the other one closes
    const next = !showTabsMenu;
    setShowModeMenu(false);
    setShowModelMenu(false);
    setShowTabsMenu(next);
    if (next) {
      try {
        chrome.runtime.sendMessage({ action: "listTabs" }, (response) => {
          if (chrome.runtime.lastError) {
            setError(chrome.runtime.lastError.message);
            return;
          }
          if (response?.error) {
            setError(response.error);
            return;
          }
          setAvailableTabs(response?.tabs || []);
        });
      } catch (e) {
        // In non-extension environments, fail silently
      }
    }
  };

  // UI preview card of last added page context
  const [contextPreview, setContextPreview] = useState(null);

  const addTabContext = (tabId) => {
    try {
      const tabMeta = (availableTabs || []).find(t => t.id === tabId);
      chrome.runtime.sendMessage({ action: "getTabContent", tabId }, (response) => {
        if (chrome.runtime.lastError) {
          setError(chrome.runtime.lastError.message);
          return;
        }
        if (response?.error) {
          setError(response.error);
          return;
        }
        const text = response?.content || '';
        // Store or append to hidden system context
        setSystemContext(prev => (prev ? `${prev}\n\n[Page ${tabId}]\n${text}` : text));
        setShowTabsMenu(false);

        // Build a preview card for the composer
        const title = tabMeta?.title || 'Untitled';
        const url = tabMeta?.url || '';
        setContextPreview({
          title,
          url,
          origin: (() => {
            try { return new URL(url).origin; } catch { return url; }
          })(),
          favIconUrl: tabMeta?.favIconUrl || '',
          tabId
        });
      });
    } catch (e) {}
  };

  // Close open menus on outside click (model menu references removed)
  useEffect(() => {
    const onPointerDown = (e) => {
      // Ignore clicks inside any of the menus or their trigger buttons
      const target = e.target;
      const closest = (sel) => target.closest(sel);

      // Mark the DOM anchors to prevent immediate-close during selection
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

  // Restore send flow with curved input, honoring current mode
  const handleSend = () => {
    if (!inputValue.trim() && !capturedImage) return;
    const content = [];

    // System prompt behavior based on mode, both use entire page context (systemContext already holds it)
    // Do NOT inline system instruction into the user message.
    // It is injected separately at the start of the request in getGeminiResponse().

    if (capturedImage) content.push({ type: 'image', url: capturedImage });
    if (inputValue.trim()) content.push({ type: 'text', text: inputValue });
    const newUserMessage = { id: messageIdCounter, role: 'user', content };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setMessageIdCounter(prev => prev + 1);
    getGeminiResponse(updatedMessages);
    setInputValue('');
    setCapturedImage(null);
  };
  const handleInputChange = (e) => setInputValue(e.target.value);
  const handleKeyPress = (e) => { if (e.key === 'Enter') handleSend(); };
 
  return (
    <div className="app-container" style={{ position: 'relative', minHeight: '100vh', backgroundColor: '#BCA88D' }}>
      {/* Solid background applied via inline style above (removed SilkBackground) */}

      <header
        className="header"
        style={{
          position: 'relative',
          zIndex: 1,
          // Subtly darker warm sand to blend with #BCA88D background
          backgroundColor: '#9E876D',
          borderBottom: '1px solid #3E3F29'
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sparkle/star icon */}
          {/* Four-corner rounded star (white outline) */}
          <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5c1.2 2.9 1.2 6.1 0 9-1.2-2.9-1.2-6.1 0-9z" />
              <path d="M20.5 12c-2.9 1.2-6.1 1.2-9 0 2.9-1.2 6.1-1.2 9 0z" />
              <path d="M12 20.5c-1.2-2.9-1.2-6.1 0-9 1.2 2.9 1.2 6.1 0 9z" />
              <path d="M3.5 12c2.9-1.2 6.1-1.2 9 0-2.9 1.2-6.1 1.2-9 0z" />
            </svg>
          </span>

          {/* Brand text with shine */}
          <ShinyText text="CubAI" speed={5} />

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Model switch removed per request */}
        </div>
      </header>

      <main className="main-content" style={{ position: 'relative', zIndex: 1 }}>
        <div className="chat-area">
          {/* Only one rendering path for the summary: either as a pinned block OR as part of chat.
              To avoid duplicated visual content, we will NOT pin if the latest AI message already equals summary. */}
          {(() => {
            const last = messages[messages.length - 1];
            const lastText = last?.role === 'ai' ? (last.content?.[0]?.text || '') : '';
            const shouldPin = summary && summary.trim() && summary.trim() !== lastText.trim();
            return shouldPin ? (
              <div className="summary-section">
                <h3>Summary:</h3>
                <ReactMarkdown>{summary}</ReactMarkdown>
              </div>
            ) : null;
          })()}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.role}-message`}
              style={{ border: '1px solid #3E3F29', background: 'rgba(255,255,255,0.55)', color: '#1b1b1b' }}
            >
              {msg.content.map((part, i) => {
                const key = `${msg.id}-${i}`;
                if (part.type === 'text') {
                  return <ReactMarkdown key={key}>{part.text}</ReactMarkdown>;
                } else if (part.type === 'image') {
                  return <img key={key} src={part.url} alt="Captured content" style={{ maxWidth: '100%' }} />;
                }
                return null;
              })}
            </div>
          ))}
          {isLoading && <div className="loading-message">Loading...</div>}
          {error && <div className="message error-message">{error}</div>}
        </div>
      </main>

      {/* Floating chat composer styled like the screenshot */}
      <div
        className="floating-input-bar"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 16, display: 'flex', justifyContent: 'center', zIndex: 2 }}
        onClick={(e) => {
          // Prevent clicks inside the bar from propagating to document (so outside-click closes work)
          e.stopPropagation?.();
        }}
      >
        <div
          className="curved-input-wrapper"
          style={{
            width: '92%',
            maxWidth: 820,
          }}
        >
          {/* Context preview pill/card */}
          {contextPreview && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.10)',
                border: '1px solid #7D8D86'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {contextPreview.favIconUrl ? (
                <img
                  src={contextPreview.favIconUrl}
                  alt=""
                  style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'cover', background: '#1f2937' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'inline-grid'; }}
                />
              ) : null}
              <span
                style={{
                  width: 22, height: 22, borderRadius: 6, display: contextPreview.favIconUrl ? 'none' : 'inline-grid',
                  placeItems: 'center', background: 'transparent', border: '1px solid rgba(0,0,0,0.25)'
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3E3F29" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18" />
                  <path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
                </svg>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#1b1b1b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {contextPreview.title}
                </div>
                <div style={{ fontSize: 12, color: '#3E3F29', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {contextPreview.origin}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setContextPreview(null); }}
                aria-label="Remove context"
                title="Remove context"
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  color: '#3E3F29',
                  cursor: 'pointer'
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
          <div
            className="input-surface"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 14,
              borderRadius: 12,
              background: 'rgba(0,0,0,0.12)',
              border: '1px solid #7D8D86',
              boxShadow: '0 2px 12px rgba(0,0,0,0.20)',
              position: 'relative'
            }}
          >
            {/* Top row: placeholder-like input */}
            <input
              type="text"
              className="chatlike-input"
              placeholder="How can I help you today?"
              value={inputValue}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              style={{
                background: 'transparent',
                border: `1px solid #7D8D86`,
                outline: 'none',
                color: '#1b1b1b',
                fontSize: 16,
                fontWeight: 500,
                fontFamily: `"Segoe UI", Roboto, "Inter", system-ui, -apple-system, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif`,
                letterSpacing: 0.2,
                borderRadius: 8,
                padding: '8px 10px',
                backgroundColor: 'rgba(255,255,255,0.6)'
              }}
            />

            {/* Bottom row: left icons and right send */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* System prompt switcher (slash inside curved square) */}
                <div style={{ position: 'relative' }} data-trigger="mode">
                  <button
                    className="icon-button"
                    onClick={toggleModeMenu}
                    disabled={isLoading}
                    aria-label="Switch system prompt"
                    title={`Mode: ${mode === 'summarize' ? 'Summarize' : 'Question'}`}
                    style={{
                      width: 30, height: 30, display: 'grid', placeItems: 'center',
                      borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent'
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="5" y="5" width="14" height="14" rx="3" />
                      <path d="M9 15l6-6" />
                    </svg>
                  </button>
                  {showModeMenu && (
                    <div
                      data-menu="mode"
                      style={{
                        position: 'absolute',
                        bottom: 38,
                        left: 0,
                        background: 'rgba(20,20,21,0.98)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                        padding: 6,
                        minWidth: 160,
                        zIndex: 5
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="menu-item"
                        onClick={() => selectMode('summarize')}
                        style={{
                          display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                          background: 'transparent', color: '#e5e7eb', border: 'none',
                          padding: '8px 10px', borderRadius: 8, cursor: 'pointer'
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: 9999, background: mode==='summarize' ? '#43cea2' : '#6b7280' }} />
                        Summarize
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => selectMode('question')}
                        style={{
                          display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                          background: 'transparent', color: '#e5e7eb', border: 'none',
                          padding: '8px 10px', borderRadius: 8, cursor: 'pointer'
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: 9999, background: mode==='question' ? '#43cea2' : '#6b7280' }} />
                        Question
                      </button>
                    </div>
                  )}
                </div>

                {/* Add page context (tabs drop-up) + Model selector to the right */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Add page context (tabs drop-up) */}
                  <div style={{ position: 'relative' }} data-trigger="tabs">
                    <button
                      className="icon-button"
                      onClick={toggleTabsMenu}
                      disabled={isLoading}
                      aria-label="Add page context"
                      title="Add page context"
                      style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent' }}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M7 12h10" />
                        <path d="M12 7v10" />
                      </svg>
                    </button>
                    {showTabsMenu && (
                      <div
                        data-menu="tabs"
                        style={{
                          position: 'absolute',
                          bottom: 38,
                          left: 0,
                          background: 'rgba(20,20,21,0.98)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 10,
                          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                          padding: 6,
                          minWidth: 240,
                          maxHeight: 260,
                          overflowY: 'auto',
                          zIndex: 5
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(availableTabs && availableTabs.length ? availableTabs : []).map(t => (
                          <button
                            key={t.id}
                            className="menu-item"
                            onClick={() => addTabContext(t.id)}
                            style={{
                              display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                              background: 'transparent', color: '#e5e7eb', border: 'none',
                              padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left'
                            }}
                            title={t.title || t.url}
                          >
                            {/* Favicon (falls back to globe outline if not available) */}
                            {t.favIconUrl ? (
                              <img
                                src={t.favIconUrl}
                                alt=""
                                style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', background: '#1f2937' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'inline-grid'; }}
                              />
                            ) : null}
                            <span
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 4,
                                display: t.favIconUrl ? 'none' : 'inline-grid',
                                placeItems: 'center',
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.25)'
                              }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="#9ca3af"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M3 12h18" />
                                <path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
                              </svg>
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.title || t.url}
                            </span>
                          </button>
                        ))}
                        {(!availableTabs || availableTabs.length === 0) && (
                          <div style={{ color: '#9ca3af', padding: '8px 10px' }}>No tabs available</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Model selector (drop-up) */}
                  <div style={{ position: 'relative' }} data-trigger="model">
                    <button
                      className="icon-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTabsMenu(false);
                        setShowModeMenu(false);
                        setShowModelMenu(v => !v);
                        try { console.log('[ModelSelector] Toggle menu. Now:', !showModelMenu); } catch {}
                      }}
                      disabled={isLoading}
                      aria-label="Select model"
                      title={`Model: ${selectedModel}`}
                      style={{ height: 30, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', padding: '0 8px' }}
                    >
                      <span style={{ fontSize: 12, color: '#3E3F29', fontWeight: 600 }}>
                        {selectedModel === 'gemini-2.0-flash-lite' ? 'G2 Flash Lite' : 'G2 Flash'}
                      </span>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#3E3F29" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {showModelMenu && (
                      <div
                        data-menu="model"
                        style={{
                          position: 'absolute',
                          bottom: 38,
                          left: 0,
                          background: 'rgba(20,20,21,0.98)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 10,
                          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                          padding: 6,
                          minWidth: 200,
                          zIndex: 5
                        }}
                        // Use mouse down so outside-capture doesn't pre-close before click runs
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select gemini-2.0-flash'); } catch {}
                            setSelectedModel('gemini-2.0-flash');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='gemini-2.0-flash' ? '#43cea2' : '#6b7280' }} />
                          gemini-2.0-flash
                        </button>
                        <button
                          className="menu-item"
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            try { console.log('[ModelSelector] Select gemini-2.0-flash-lite'); } catch {}
                            setSelectedModel('gemini-2.0-flash-lite');
                            setShowModelMenu(false);
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', color: '#e5e7eb', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: selectedModel==='gemini-2.0-flash-lite' ? '#43cea2' : '#6b7280' }} />
                          gemini-2.0-flash-lite
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ marginLeft: 'auto' }}>
                <button
                  className="send-fab"
                  onClick={handleSend}
                  disabled={isLoading || (!inputValue.trim() && !capturedImage)}
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 12l15-7-7 15-2-6-6-2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
 
 export default App;