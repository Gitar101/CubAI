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
          console.log("[useChromeExtension] Received startAIStream");
          setIsLoading(true);
          isStreamingRef.current = true;
          // Create a new AI message with empty content and reasoning to stream into
          setMessages(prevMessages => {
            const newAiMessage = {
              id: message.messageId, // Use the ID sent from background
              role: 'ai',
              content: [{ type: 'text', text: '' }],
              reasoning: '', // Initialize reasoning
            };
            return [...prevMessages, newAiMessage];
          });
        } else if (message.action === "appendAIMessageChunk") {
          const textChunk = message.text || '';
          if (!textChunk) return;
          console.log("[useChromeExtension] Received appendAIMessageChunk:", textChunk);
          setMessages(prevMessages => {
            const updatedMessages = [...prevMessages];
            const lastMessageIndex = updatedMessages.length - 1;
            const lastMessage = updatedMessages[lastMessageIndex];

            if (lastMessage && lastMessage.role === 'ai' && isStreamingRef.current) {
              const content = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
              let textContentIndex = content.findIndex(c => c.type === 'text');

              if (textContentIndex !== -1) {
                content[textContentIndex].text += textChunk;
              } else {
                content.push({ type: 'text', text: textChunk });
              }
              
              updatedMessages[lastMessageIndex] = { ...lastMessage, content };
              return updatedMessages;
            }
            return prevMessages;
          });
        } else if (message.action === "endAIStream") {
          console.log("[useChromeExtension] Received endAIStream");
          isStreamingRef.current = false;
          setIsLoading(false);
        } else if (message.action === "appendReasoningChunk") {
          console.log("[useChromeExtension] Received appendReasoningChunk:", message.text);
          setMessages(prevMessages => {
            const updatedMessages = [...prevMessages];
            const lastMessageIndex = updatedMessages.length - 1;
            const lastMessage = updatedMessages[lastMessageIndex];

            if (lastMessage && lastMessage.role === 'ai' && isStreamingRef.current) {
              updatedMessages[lastMessageIndex] = {
                ...lastMessage,
                reasoning: (lastMessage.reasoning || '') + (message.text || ''),
              };
              return updatedMessages;
            }
            return prevMessages;
          });
        } else if (message.action === "endReasoningStream") {
          console.log("[useChromeExtension] Received endReasoningStream");
          // No specific action needed here, as reasoning is part of the message object
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
          console.error("[useChromeExtension] Received displayError:", message.error);
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
  }, [setMessageIdCounter]); // Removed setThinkingText, setIsThinkingStreaming
};