import { useEffect } from 'react';

export const useChromeExtension = (
  setMode,
  setInputValue,
  setSystemContext,
  updateContextPreview,
  setIsLoading,
  setMessages,
  setMessageIdCounter,
  setError,
  messageIdCounter
) => {
  useEffect(() => {
    if (chrome.runtime && chrome.runtime.onMessage) {
      const isStreamingRef = { current: false };

      const listener = (message, sender, sendResponse) => {
        if (message.action === "setMode") {
          const m = message.mode;
          if (['explain', 'summarize', 'chat'].includes(m)) {
            setMode(m);
            if (message.query) setInputValue(message.query);
            if (message.context) setSystemContext(message.context);
            if (message.tabMeta) updateContextPreview(message.tabMeta);
          }
        } else if (message.action === "startAIStream") {
          setIsLoading(true);
          isStreamingRef.current = true;
        } else if (message.action === "appendAIMessageChunk") {
          const textChunk = message.text || '';
          if (!textChunk) return;
          setMessages(prevMessages => {
            const lastMessage = prevMessages.length > 0 ? prevMessages[prevMessages.length - 1] : null;

            if (lastMessage && lastMessage.role === 'ai' && isStreamingRef.current) {
              const updatedMessages = [...prevMessages];
              const updatedLastMessage = { ...lastMessage };
              const content = Array.isArray(updatedLastMessage.content) ? [...updatedLastMessage.content] : [];
              let textContentIndex = content.findIndex(c => c.type === 'text');

              if (textContentIndex !== -1) {
                content[textContentIndex].text += textChunk;
              } else {
                content.push({ type: 'text', text: textChunk });
              }
              
              updatedLastMessage.content = content;
              updatedMessages[prevMessages.length - 1] = updatedLastMessage;
              return updatedMessages;
            } else if (isStreamingRef.current) {
              const newAiMessage = {
                id: messageIdCounter,
                role: 'ai',
                content: [{ type: 'text', text: textChunk }],
              };
              setMessageIdCounter(c => c + 1);
              return [...prevMessages, newAiMessage];
            }
            return prevMessages;
          });
        } else if (message.action === "endAIStream") {
          isStreamingRef.current = false;
          setIsLoading(false);
        } else if (message.action === "appendSystemContext") {
          setSystemContext(message.text || '');
        } else if (message.action === "setContextPreview") {
          const p = message.preview || {};
          const url = p.url || '';
          updateContextPreview({
            title: p.title || 'Untitled',
            url,
            origin: (() => { try { return new URL(url).origin; } catch { return url; } })(),
            favIconUrl: p.favIconUrl || '',
            tabId: p.id
          });
        } else if (message.action === "displayError") {
          setError(message.error);
          setIsLoading(false);
        } else if (message.action === 'displayGeneratedImage') {
          const { description, imageData, imagePrompt } = message;
          setMessages(prev => {
            const content = [];
            if (description) content.push({ type: 'text', text: description });
            if (imageData) content.push({ type: 'image', url: imageData });
            if (imagePrompt) content.push({ type: 'image_prompt', text: imagePrompt });
            
            const newAiMessage = {
              id: messageIdCounter,
              role: 'ai',
              content: content,
            };
            setMessageIdCounter(p => p + 1);
            return [...prev, newAiMessage];
          });
          setIsLoading(false);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, [messageIdCounter]);
};