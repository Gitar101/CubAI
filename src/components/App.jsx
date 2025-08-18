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

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

const App = () => {
  const chatState = useChatState();
  const contextState = useContextState();
  const uiState = useUIState();

  useChromeExtension(
    uiState.setMode,
    chatState.setInputValue,
    chatState.setSystemContext,
    contextState.updateContextPreview,
    chatState.setIsLoading,
    chatState.setMessages,
    chatState.setMessageIdCounter,
    chatState.setError,
    chatState.messageIdCounter,
  );

  const handleSend = () => {
    if (uiState.generationMode === 'image') {
      if (!chatState.inputValue.trim()) return;

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

      const imageContext = getFormattedImageContext(chatState.messages, chatState.inputValue);
      
      const isFirstImage = !chatState.messages.some(m => m.role === 'ai' && m.content.some(c => c.type === 'image' || c.type === 'image_prompt'));

      const newUserMessage = {
        id: chatState.messageIdCounter,
        role: 'user',
        content: [{ type: 'text', text: isFirstImage ? `${chatState.inputValue}` : chatState.inputValue }]
      };
      
      chatState.setMessages(prev => [...prev, newUserMessage]);
      chatState.setMessageIdCounter(prev => prev + 1);
      chatState.setIsLoading(true);
      
      chrome.runtime.sendMessage({
        action: 'generate-image',
        prompt: imageContext,
        originalPrompt: chatState.inputValue,
      });
      
      chatState.setInputValue('');
      return;
    }

    if (!chatState.inputValue.trim() && !chatState.capturedImage && (!chatState.capturedSlices || chatState.capturedSlices.length === 0)) return;

    const finalUserInput = chatState.inputValue;
    const content = [];
    if (chatState.capturedImage) {
      content.push({ type: 'image', url: chatState.capturedImage });
      if (chatState.captureMeta?.w && chatState.captureMeta?.h) {
        content.push({ type: 'text', text: `//image-size: ${chatState.captureMeta.w}x${chatState.captureMeta.h}` });
      }
    }
    if (chatState.capturedSlices && chatState.capturedSlices.length > 0) {
      chatState.capturedSlices
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach(s => content.push({ type: 'image', url: s.url }));
      const totalKB = Math.round(chatState.capturedSlices.reduce((acc, s) => acc + (s.url.length * 3 / 4) / 1024, 0));
      content.push({ type: 'text', text: `//image-slices: ${chatState.capturedSlices.length} • ~${totalKB} KB` });
    }
    if (finalUserInput.trim()) content.push({ type: 'text', text: finalUserInput });

    const newUserMessage = { id: chatState.messageIdCounter, role: 'user', content, contexts: contextState.contexts };

    const newAiMessageId = chatState.messageIdCounter + 1;
    const newAiMessage = {
      id: newAiMessageId,
      role: 'ai',
      content: [{ type: 'text', text: '' }],
      reasoning: '', // Initialize reasoning for the new message
    };

    // Only add the new AI message placeholder if it's not the gpt-oss-120b model
    // The gpt-oss-120b model handles its own message container creation via startAIStream
    if (uiState.selectedModel !== "openai/gpt-oss-120b") {
      chatState.setMessages(prev => [...prev, newUserMessage, newAiMessage]);
      chatState.setMessageIdCounter(prev => prev + 2);
    } else {
      // For gpt-oss-120b, only add the user message and increment counter by 1
      chatState.setMessages(prev => [...prev, newUserMessage]);
      chatState.setMessageIdCounter(prev => prev + 1);
    }
    chatState.setIsLoading(true);

    chatState.setInputValue('');
    chatState.setCapturedImage(null);
    chatState.setCapturedSlices([]);
    if (contextState.contexts.length > 0) {
      contextState.setContexts([]);
      chrome.storage.local.set({ cubext: [] });
    }

    const performSend = (includeCtx, systemCtxForSend) => {
      const finalUserMessage = { ...newUserMessage, content: [...newUserMessage.content] };
      if (includeCtx && contextState.contextPreview?.url && !contextState.hasContextPillBeenRendered) {
        finalUserMessage.content.push({ type: 'text', text: `//context-url: ${contextState.contextPreview.url}` });
        contextState.setHasContextPillBeenRendered(true);
      }

      const finalMessages = [...chatState.messages, finalUserMessage];

      const useGoogleSearch = ['summarize', 'explain', 'chat', 'Tutor'].includes(uiState.mode);

      chrome.runtime.sendMessage({
        action: "sendChatMessage",
        messages: JSON.parse(JSON.stringify(finalMessages)),
        systemInstruction: systemPrompts[uiState.mode],
        systemContext: includeCtx ? systemCtxForSend : null,
        model: uiState.selectedModel,
        selectedModel: uiState.selectedModel,
        file: null,
        useGoogleSearch: useGoogleSearch,
        messageId: newAiMessageId, // Pass the ID of the AI message to update
      });
    };

    const shouldIncludeContext = ['explain', 'summarize', 'Tutor'].includes(uiState.mode);

    if (shouldIncludeContext && chatState.systemContext) {
      performSend(true, chatState.systemContext);
    } else if (shouldIncludeContext) {
      // Fallback for cases where context might not have been set yet
      try {
        chrome.runtime.sendMessage({ action: "getActiveTabCubAIContext" }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            const errMsg = resp?.error || chrome.runtime.lastError?.message || "Failed to get page context";
            chatState.setError(errMsg);
            chatState.setIsLoading(false);
          } else {
            const { context, tabMeta } = resp;
            chatState.setSystemContext(context || '');
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
        chatState.setError(String(e?.message || e));
        chatState.setIsLoading(false);
      }
    } else {
      performSend(false, null);
    }
  };

  const handleInputChange = (e) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    chatState.setInputValue(textarea.value);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        chatState.setInputValue(prev => prev + '\n');
        e.preventDefault();
      } else {
        handleSend();
      }
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          chatState.setCapturedImage(reader.result);
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        break;
      }
    }
  };

  const handleCaptureFullPage = useCallback(async () => {
    const dbg = (msg, extra) => { try { console.log('[CaptureFullPage]', msg, extra ?? ''); } catch {} };
    try {
      chatState.setError('');
      chatState.setCapturedImage(null);
      chatState.setCapturedSlices([]);
      dbg('Sending chrome.runtime.sendMessage', { action: 'captureFullPage' });
      chrome.runtime.sendMessage({ action: 'captureFullPage' }, (resp) => {
        if (typeof resp === 'undefined') {
          const lastErr = chrome?.runtime?.lastError?.message;
          dbg('Response is undefined', { lastError: lastErr });
          chatState.setError(lastErr || 'No response from background for captureFullPage');
          return;
        }
        dbg('Received response', { keys: Object.keys(resp || {}), ok: resp?.ok, slices: Array.isArray(resp?.slices) ? resp.slices.length : 0 });
        if (chrome.runtime.lastError) {
          dbg('chrome.runtime.lastError', chrome.runtime.lastError.message);
          chatState.setError(chrome.runtime.lastError.message);
          return;
        }
        if (!resp || !resp.ok) {
          dbg('Not ok response', resp);
          chatState.setError(resp?.error || 'Failed to capture page');
          return;
        }
        if (Array.isArray(resp.slices) && resp.slices.length > 0) {
          dbg('Applying slices', { count: resp.slices.length, first: resp.slices[0] ? { w: resp.slices[0].w, h: resp.slices[0].h, len: resp.slices[0].url?.length } : null });
          chatState.setCapturedSlices(resp.slices);
          const totalKB = Math.round(resp.slices.reduce((acc, s) => acc + (s.url.length * 3 / 4) / 1024, 0));
          chatState.setCaptureMeta({ w: resp.slices[0].w, h: resp.slices[0].h, kb: totalKB });
        } else if (resp.dataUrl) {
          dbg('Applying single image', { len: resp.dataUrl.length, w: resp.width, h: resp.height });
          chatState.setCapturedImage(resp.dataUrl);
          const approxKB = Math.round((resp.dataUrl.length * 3 / 4) / 1024);
          chatState.setCaptureMeta({ w: resp.width, h: resp.height, kb: approxKB });
        } else {
          dbg('No data in response', resp);
          chatState.setError('Capture returned no data');
        }
      });
    } catch (e) {
      dbg('Exception thrown', e);
      chatState.setError(String(e?.message || e));
    }
  }, [chatState.setError, chatState.setCapturedImage, chatState.setCapturedSlices, chatState.setCaptureMeta]);

  const addTabContext = (tabId) => {
    try {
      const tabMeta = (uiState.availableTabs || []).find(t => t.id === tabId);
      chrome.runtime.sendMessage({ action: "getTabContent", tabId }, (response) => {
        if (chrome.runtime.lastError) {
          chatState.setError(chrome.runtime.lastError.message);
          return;
        }
        if (response?.error) {
          chatState.setError(response.error);
          return;
        }
        const text = response?.content || '';
        chatState.setSystemContext(prev => (prev ? `${prev}\n\n[Page ${tabId}]\n${text}` : text));
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
      chatState.setError("Failed to add tab context.");
    }
  };

  return (
    <div className="app-container" style={{ position: 'relative', minHeight: '100vh', backgroundColor: '#BCA88D' }}>
      <Header clearChat={chatState.clearChat} />
      <MessageList
        messages={chatState.messages}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        isStreaming={chatState.isStreaming}
      />
      <InputForm
        inputValue={chatState.inputValue}
        handleInputChange={handleInputChange}
        handleKeyPress={handleKeyPress}
        handlePaste={handlePaste}
        isLoading={chatState.isLoading}
        generationMode={uiState.generationMode}
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
        capturedImage={chatState.capturedImage}
        capturedSlices={chatState.capturedSlices}
        captureMeta={chatState.captureMeta}
        setCapturedImage={chatState.setCapturedImage}
        setCapturedSlices={chatState.setCapturedSlices}
        setCaptureMeta={chatState.setCaptureMeta}
        contextPreview={contextState.contextPreview}
        setContextPreview={contextState.setContextPreview}
      />
      {chatState.isLoading && <div className="loading-message">Loading...</div>}
      {chatState.error && <div className="message error-message">{chatState.error}</div>}
    </div>
  );
};

export default App;