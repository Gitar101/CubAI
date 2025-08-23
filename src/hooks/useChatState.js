import { useState, useEffect, useCallback } from 'react';

const HISTORY_STORAGE_KEY = 'cubai_chat_history';

export const useChatState = () => {
  const [messages, setMessages] = useState([]);
  const [messageIdCounter, setMessageIdCounter] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [isAbruptlyStopped, setIsAbruptlyStopped] = useState(false); // New state for abrupt stop detection
  const [showClearChatButton, setShowClearChatButton] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const [captureMeta, setCaptureMeta] = useState(null);
  const [capturedSlices, setCapturedSlices] = useState([]);
  const [systemContext, setSystemContext] = useState('');
  const [summary, setSummary] = useState('');
  const [contexts, setContexts] = useState([]);
  const [isContextVisible, setIsContextVisible] = useState(true);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null); // New state for active session

  // Load chat history from chrome.storage.local on component mount
  useEffect(() => {
    chrome.storage.local.get([HISTORY_STORAGE_KEY], (result) => {
      if (result[HISTORY_STORAGE_KEY]) {
        setChatHistory(result[HISTORY_STORAGE_KEY]);
      }
    });
  }, []);

  // Save or update chat session in history
  const saveChatSession = useCallback((sessionMessages, sessionId = null) => {
    if (sessionMessages.length === 0) return;

    const firstMessageContent = sessionMessages[0]?.content;
    let title = "New Chat Session";
    if (Array.isArray(firstMessageContent)) {
      const firstTextMessage = firstMessageContent.find(c => c.type === 'text');
      if (firstTextMessage) {
        title = firstTextMessage.text.substring(0, 50) + (firstTextMessage.text.length > 50 ? '...' : '');
      }
    } else if (typeof firstMessageContent === 'string') {
      title = firstMessageContent.substring(0, 50) + (firstMessageContent.length > 50 ? '...' : '');
    }

    let currentSessionId = sessionId || Date.now();
    const newSession = {
      id: currentSessionId,
      timestamp: new Date().toISOString(),
      title: title,
      messages: sessionMessages,
    };

    setChatHistory(prevHistory => {
      const existingIndex = prevHistory.findIndex(session => session.id === currentSessionId);
      let updatedHistory;
      if (existingIndex > -1) {
        updatedHistory = prevHistory.map((session, index) =>
          index === existingIndex ? newSession : session
        );
      } else {
        updatedHistory = [...prevHistory, newSession];
      }
      chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: updatedHistory });
      return updatedHistory;
    });
    return currentSessionId;
  }, []);

  const deleteChatSession = useCallback((sessionIdToDelete) => {
    setChatHistory(prevHistory => {
      const updatedHistory = prevHistory.filter(session => session.id !== sessionIdToDelete);
      chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: updatedHistory });
      return updatedHistory;
    });
    // If the deleted session was the active one, clear the chat
    if (activeSessionId === sessionIdToDelete) {
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
      setIsAbruptlyStopped(false);
      setContexts([]);
      chrome.storage.local.set({ cubext: [] }); // Clear cubext as well
      setActiveSessionId(null);
    }
  }, [activeSessionId, setMessages, setMessageIdCounter, setSystemContext, setSummary, setCapturedImage, setCapturedSlices, setCaptureMeta, setError, setIsLoading, setIsStreaming, setIsAbruptlyStopped, setContexts, setActiveSessionId]);

  const clearChat = () => {
    // Save current chat to history before clearing if there are messages
    if (messages.length > 0) {
      saveChatSession(messages, activeSessionId);
    }

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
    setIsAbruptlyStopped(false); // Reset on clear chat
    setContexts([]);
    chrome.storage.local.set({ cubext: [] });
    setActiveSessionId(null); // Reset active session
  };

  // Effect to detect abrupt AI response stops
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Check if the last message is an AI message and appears incomplete
      if (lastMessage.sender === 'ai') {
        const lastChar = lastMessage.text.slice(-1);
        const incompleteMarkers = ['.', '!', '?', '...']; // Common punctuation and ellipsis
        if (!incompleteMarkers.includes(lastChar) && lastMessage.text.length > 0) {
          setIsAbruptlyStopped(true);
        } else {
          setIsAbruptlyStopped(false);
        }
      } else if (lastMessage.sender === 'user') {
        // If the last message is a user message, reset abrupt stop status
        setIsAbruptlyStopped(false);
      }
    } else if (isStreaming) {
      // If streaming is active, ensure isAbruptlyStopped is false
      setIsAbruptlyStopped(false);
    }
  }, [isStreaming, messages]); // Dependencies for the effect

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
    isAbruptlyStopped, // Export new state
    setIsAbruptlyStopped, // Export new setter
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
    chatHistory, // Export chat history
    saveChatSession, // Export save function
    deleteChatSession, // Export delete function
    activeSessionId, // Export active session ID
    setActiveSessionId, // Export setter for active session ID
  };
};