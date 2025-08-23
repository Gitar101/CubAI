import React, { useCallback } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useChatState } from '../hooks/useChatState';
import { useChromeExtension } from '../hooks/useChromeExtension';
import { useContextState } from '../hooks/useContext';
import { useUIState } from '../hooks/useUI';
import { systemPrompts } from '../constants/prompts';
import Header from './Header';
import MessageList from './MessageList';
import InputForm from './InputForm';
import ContextDisplay from './ContextDisplay';
import HistoryPanel from './HistoryPanel'; // Import HistoryPanel

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

const App = () => {
  const {
    messages,
    inputValue,
    setInputValue,
    systemContext,
    setSystemContext,
    isLoading,
    setIsLoading,
    isStreaming,
    error,
    setError,
    capturedImage,
    setCapturedImage,
    capturedSlices,
    setCapturedSlices,
    captureMeta,
    setCaptureMeta,
    messageIdCounter,
    setMessageIdCounter,
    clearChat,
    isAbruptlyStopped,
    setIsAbruptlyStopped,
    setMessages,
    saveChatSession,
    chatHistory, // Destructure chatHistory
    activeSessionId, // Destructure activeSessionId
    setActiveSessionId, // Destructure setActiveSessionId
    deleteChatSession, // Destructure deleteChatSession
  } = useChatState();
  const contextState = useContextState();
  const uiState = useUIState();

  const [showHistory, setShowHistory] = React.useState(false);

  const handleHistoryClick = useCallback(() => {
    setShowHistory(prev => !prev);
  }, []);


  useChromeExtension(
    uiState.setMode,
    setInputValue,
    setSystemContext,
    contextState.updateContextPreview,
    setIsLoading,
    setMessages,
    setMessageIdCounter,
    setError,
    messageIdCounter,
  );

  const performSend = useCallback((includeCtx, systemCtxForSend, continueChat = false) => {
    const finalUserInput = continueChat ? "Please continue your previous response." : inputValue;
    if (!finalUserInput.trim() && !capturedImage && (!capturedSlices || capturedSlices.length === 0)) return;

    const content = [];
    if (capturedImage) {
      content.push({ type: 'image', url: capturedImage });
      if (captureMeta?.w && captureMeta?.h) {
        content.push({ type: 'text', text: `//image-size: ${captureMeta.w}x${captureMeta.h}` });
      }
    }
    if (capturedSlices && capturedSlices.length > 0) {
      capturedSlices
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach(s => content.push({ type: 'image', url: s.url }));
      const totalKB = Math.round(capturedSlices.reduce((acc, s) => acc + (s.url.length * 3 / 4) / 1024, 0));
      content.push({ type: 'text', text: `//image-slices: ${capturedSlices.length} • ~${totalKB} KB` });
    }
    if (finalUserInput.trim()) content.push({ type: 'text', text: finalUserInput });

    const newUserMessage = { id: messageIdCounter, role: 'user', content, contexts: contextState.contexts };

    const newAiMessageId = messageIdCounter + 1;
    const updatedMessages = [...messages, newUserMessage]; // Use updatedMessages for saving
    setMessages(updatedMessages);
    setMessageIdCounter(prev => prev + 1);
    setIsLoading(true);
    setIsAbruptlyStopped(false); // Reset abruptly stopped state on new send

    // Save or update the current chat session
    const newActiveSessionId = saveChatSession(updatedMessages, activeSessionId);
    if (newActiveSessionId !== activeSessionId) {
      setActiveSessionId(newActiveSessionId);
    }

    setInputValue('');
    setCapturedImage(null);
    setCapturedSlices([]);
    if (contextState.contexts.length > 0) {
      contextState.setContexts([]);
      chrome.storage.local.set({ cubext: [] });
    }

    const finalUserMessage = { ...newUserMessage, content: [...newUserMessage.content] };
    if (includeCtx && contextState.contextPreview?.url && !contextState.hasContextPillBeenRendered) {
      finalUserMessage.content.push({ type: 'text', text: `//context-url: ${contextState.contextPreview.url}` });
      contextState.setHasContextPillBeenRendered(true);
    }

    const finalMessages = [...messages, finalUserMessage];

    const useGoogleSearch = ['summarize', 'explain', 'chat', 'Tutor'].includes(uiState.mode);

    const systemInstruction = systemPrompts[uiState.mode];
    const userMessageContent = finalUserMessage.content;

    console.log('Current UI Mode:', uiState.mode);
    console.log('System Prompt Sent:', systemInstruction);
    console.log('User Message Sent (JSON):', JSON.stringify(userMessageContent, null, 2));

    chrome.runtime.sendMessage({
      action: "sendChatMessage",
      messages: JSON.parse(JSON.stringify(finalMessages)),
      systemInstruction: systemInstruction,
      systemContext: includeCtx ? systemCtxForSend : null,
      model: uiState.selectedModel,
      selectedModel: uiState.selectedModel,
      file: null,
      useGoogleSearch: useGoogleSearch,
      messageId: newAiMessageId,
    });
  }, [
    inputValue,
    capturedImage,
    capturedSlices,
    captureMeta,
    messageIdCounter,
    setMessages,
    setMessageIdCounter,
    setIsLoading,
    setIsAbruptlyStopped,
    setInputValue,
    setCapturedImage,
    setCapturedSlices,
    contextState.contexts,
    contextState.setContexts,
    contextState.contextPreview?.url,
    contextState.hasContextPillBeenRendered,
    contextState.setHasContextPillBeenRendered,
    messages,
    uiState.mode,
    uiState.selectedModel,
    saveChatSession, // Add saveChatSession to dependencies
    activeSessionId, // Add activeSessionId to dependencies
    setActiveSessionId, // Add setActiveSessionId to dependencies
  ]);

  const handleSend = useCallback(() => {
    if (uiState.generationMode === 'image') {
      if (!inputValue.trim()) return;

      const getFormattedImageContext = (history, newUserPrompt) => {
        let contextString = `<system prompt>\nYou are an expert image generator. Follow the user's instructions carefully.\n`;

        history.forEach(message => {
          if (message.role === 'user') {
            const userText = message.content.find(c => c.type === 'text')?.text || '';
            if (userText) {
              const cleanText = userText.replace(/^Generate an image of: /, '');
              contextString += `<usermessage>: ${cleanText}\n`;
            }
          } else if (message.role === 'ai') {
            const aiDescription = message.content.find(c => c.type === 'text')?.text;
            const imagePrompt = message.content.find(c => c.type === 'image_prompt')?.text;

            if (aiDescription) {
              contextString += `<ai message>: ${aiDescription}\n`;
            }
            if (imagePrompt) {
              contextString += `\`\`\`${imagePrompt}\`\`\`\n`;
            }
          }
        });

        contextString += `<usermessage>: ${newUserPrompt}\n`;
        return contextString;
      };

      const imageContext = getFormattedImageContext(messages, inputValue);
      
      const isFirstImage = !messages.some(m => m.role === 'ai' && m.content.some(c => c.type === 'image' || c.type === 'image_prompt'));

      const newUserMessage = {
        id: messageIdCounter,
        role: 'user',
        content: [{ type: 'text', text: isFirstImage ? `${inputValue}` : inputValue }]
      };
      
      setMessages(prev => [...prev, newUserMessage]);
      setMessageIdCounter(prev => prev + 1);
      setIsLoading(true);
      
      chrome.runtime.sendMessage({
        action: 'generate-image',
        prompt: imageContext,
        originalPrompt: inputValue,
      });
      
      setInputValue('');
      return;
    }

    const shouldIncludeContext = ['explain', 'summarize', 'Tutor'].includes(uiState.mode);

    if (shouldIncludeContext && systemContext) {
      performSend(true, systemContext);
    } else if (shouldIncludeContext) {
      try {
        chrome.runtime.sendMessage({ action: "getActiveTabCubAIContext" }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            const errMsg = resp?.error || chrome.runtime.lastError?.message || "Failed to get page context";
            setError(errMsg);
            setIsLoading(false);
          } else {
            const { context, tabMeta } = resp;
            setSystemContext(context || '');
            contextState.updateContextPreview({
              title: tabMeta?.title || 'Untitled',
              url: tabMeta?.url || '',
              origin: (() => { try { return new URL(tabMeta?.url).origin; } catch { return tabMeta?.url; } })(),
              favIconUrl: tabMeta?.favIconUrl || '',
              tabId: tabMeta?.id
            });
            performSend(true, context || '');
          }
        });
      } catch (e) {
        setError(String(e?.message || e));
        setIsLoading(false);
      }
    } else {
      performSend(false, null);
    }
  }, [
    inputValue,
    capturedImage,
    capturedSlices,
    captureMeta,
    messageIdCounter,
    setMessages,
    setMessageIdCounter,
    setIsLoading,
    setInputValue,
    setCapturedImage,
    setCapturedSlices,
    contextState.contexts,
    contextState.setContexts,
    contextState.contextPreview?.url,
    contextState.hasContextPillBeenRendered,
    contextState.setHasContextPillBeenRendered,
    messages,
    uiState.mode,
    uiState.selectedModel,
    systemContext,
    setSystemContext,
    setError,
    setIsAbruptlyStopped,
    performSend,
  ]);

  const handleContinueChat = useCallback(() => {
    setIsAbruptlyStopped(false);
    performSend(false, null, true); // Pass true for continueChat
  }, [setIsAbruptlyStopped, performSend]);


  const handleInputChange = useCallback((e) => {
    const textarea = e.target;
    textarea.style.height = 'auto'; // Reset height to auto to calculate new scrollHeight
    textarea.style.height = textarea.scrollHeight + 'px'; // Set height based on content
    if (textarea.value === '') {
      textarea.rows = 1; // Reset rows to 1 when input is empty
    }
    setInputValue(textarea.value);
  }, [setInputValue]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        setInputValue(prev => prev + '\n');
        e.preventDefault();
      } else {
        handleSend();
      }
    }
  }, [handleSend, setInputValue]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          setCapturedImage(reader.result);
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        break;
      }
    }
  }, [setCapturedImage]);

  const handleCaptureFullPage = useCallback(async () => {
    const dbg = (msg, extra) => { try { console.log('[CaptureFullPage]', msg, extra ?? ''); } catch {} };
    try {
      setError('');
      setCapturedImage(null);
      setCapturedSlices([]);
      dbg('Sending chrome.runtime.sendMessage', { action: 'captureFullPage' });
      chrome.runtime.sendMessage({ action: 'captureFullPage' }, (resp) => {
        if (typeof resp === 'undefined') {
          const lastErr = chrome?.runtime?.lastError?.message;
          dbg('Response is undefined', { lastError: lastErr });
          setError(lastErr || 'No response from background for captureFullPage');
          return;
        }
        dbg('Received response', { keys: Object.keys(resp || {}), ok: resp?.ok, slices: Array.isArray(resp?.slices) ? resp.slices.length : 0 });
        if (chrome.runtime.lastError) {
          dbg('chrome.runtime.lastError', chrome.runtime.lastError.message);
          setError(chrome.runtime.lastError.message);
          return;
        }
        if (!resp || !resp.ok) {
          dbg('Not ok response', resp);
          setError(resp?.error || 'Failed to capture page');
          return;
        }
        if (Array.isArray(resp.slices) && resp.slices.length > 0) {
          dbg('Applying slices', { count: resp.slices.length, first: resp.slices[0] ? { w: resp.slices[0].w, h: resp.slices[0].h, len: resp.slices[0].url?.length } : null });
          setCapturedSlices(resp.slices);
          const totalKB = Math.round(resp.slices.reduce((acc, s) => acc + (s.url.length * 3 / 4) / 1024, 0));
          setCaptureMeta({ w: resp.slices[0].w, h: resp.slices[0].h, kb: totalKB });
        } else if (resp.dataUrl) {
          dbg('Applying single image', { len: resp.dataUrl.length, w: resp.width, h: resp.height });
          setCapturedImage(resp.dataUrl);
          const approxKB = Math.round((resp.dataUrl.length * 3 / 4) / 1024);
          setCaptureMeta({ w: resp.width, h: resp.height, kb: approxKB });
        } else {
          dbg('No data in response', resp);
          setError('Capture returned no data');
        }
      });
    } catch (e) {
      dbg('Exception thrown', e);
      setError(String(e?.message || e));
    }
  }, [setError, setCapturedImage, setCapturedSlices, setCaptureMeta]);

  const addTabContext = useCallback((tabId) => {
    try {
      const tabMeta = (uiState.availableTabs || []).find(t => t.id === tabId);
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
        setSystemContext(prev => (prev ? `${prev}\n\n[Page ${tabId}]\n${text}` : text));
        uiState.toggleTabsMenu();

        const title = tabMeta?.title || 'Untitled';
        const url = tabMeta?.url || '';
        contextState.updateContextPreview({
          title,
          url,
          origin: (() => {
            try { return new URL(url).origin; } catch { return url; }
          })(),
          favIconUrl: tabMeta?.favIconUrl || '',
          tabId
        });
      });
    } catch (e) {
      setError("Failed to add tab context.");
    }
  }, [setError, setSystemContext, uiState.availableTabs, uiState.toggleTabsMenu, contextState.updateContextPreview, contextState.updateContextPreview]);

  return (
    <div className="app-container" style={{ position: 'relative', minHeight: '100vh', backgroundColor: '#BCA88D' }}>
      <Header clearChat={clearChat} onHistoryClick={handleHistoryClick} />
      {showHistory ? (
        <HistoryPanel
          chatHistory={chatHistory}
          onLoadSession={(session) => {
            setMessages(session.messages);
            setActiveSessionId(session.id); // Set active session when loading
            setShowHistory(false); // Hide history panel after loading
          }}
          onDeleteSession={deleteChatSession} // Pass delete function
          onBack={() => setShowHistory(false)}
        />
      ) : (
        <MessageList
          messages={messages}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypeKatex}
          isStreaming={isStreaming}
        />
      )}
      <InputForm
        inputValue={inputValue}
        handleInputChange={handleInputChange}
        handleKeyPress={handleKeyPress}
        handlePaste={handlePaste}
        isLoading={isLoading}
        generationMode={uiState.generationMode}
        canvasMode={uiState.canvasMode}
        toggleCanvasMode={uiState.toggleCanvasMode}
        mode={uiState.mode}
        handleSend={handleSend}
        toggleModeMenu={uiState.toggleModeMenu}
        showModeMenu={uiState.showModeMenu}
        selectMode={uiState.selectMode}
        toggleTabsMenu={uiState.toggleTabsMenu}
        showTabsMenu={uiState.showTabsMenu}
        setShowTabsMenu={uiState.setShowTabsMenu}
        availableTabs={uiState.availableTabs}
        addTabContext={addTabContext}
        handleCaptureFullPage={handleCaptureFullPage}
        toggleGenerationMode={uiState.toggleGenerationMode}
        selectedModel={uiState.selectedModel}
        showModelMenu={uiState.showModelMenu}
        setShowModelMenu={uiState.setShowModelMenu}
        setShowModeMenu={uiState.setShowModeMenu}
        setSelectedModel={uiState.onSelectModel}
        capturedImage={capturedImage}
        capturedSlices={capturedSlices}
        captureMeta={captureMeta}
        setCapturedImage={setCapturedImage}
        setCapturedSlices={setCapturedSlices}
        setCaptureMeta={setCaptureMeta}
        contextPreview={contextState.contextPreview}
        setContextPreview={contextState.setContextPreview}
        isAbruptlyStopped={isAbruptlyStopped}
        setIsAbruptlyStopped={setIsAbruptlyStopped}
        handleContinueChat={handleContinueChat}
      />
      {isLoading && <div className="loading-message">Loading...</div>}
      {error && <div className="message error-message">{error}</div>}
    </div>
  );
};

export default App;