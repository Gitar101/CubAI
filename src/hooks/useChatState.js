import { useState } from 'react';

export const useChatState = () => {
  const [messages, setMessages] = useState([]);
  const [messageIdCounter, setMessageIdCounter] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [showClearChatButton, setShowClearChatButton] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const [captureMeta, setCaptureMeta] = useState(null);
  const [capturedSlices, setCapturedSlices] = useState([]);
  const [systemContext, setSystemContext] = useState('');
  const [summary, setSummary] = useState('');
  const [contexts, setContexts] = useState([]);
  const [isContextVisible, setIsContextVisible] = useState(true);

  const clearChat = () => {
    setMessages([]);
    setMessageIdCounter(0);
    setSystemContext('');
    setSummary('');
    setCapturedImage(null);
    setCapturedSlices([]);
    setCaptureMeta(null);
    setError('');
    setIsLoading(false);
    setIsStreaming(false);
    setContexts([]);
    chrome.storage.local.set({ cubext: [] });
  };

  return {
    messages,
    setMessages,
    messageIdCounter,
    setMessageIdCounter,
    isLoading,
    setIsLoading,
    isStreaming,
    setIsStreaming,
    error,
    setError,
    showClearChatButton,
    setShowClearChatButton,
    inputValue,
    setInputValue,
    capturedImage,
    setCapturedImage,
    captureMeta,
    setCaptureMeta,
    capturedSlices,
    setCapturedSlices,
    systemContext,
    setSystemContext,
    summary,
    setSummary,
    contexts,
    setContexts,
    isContextVisible,
    setIsContextVisible,
    clearChat,
  };
};