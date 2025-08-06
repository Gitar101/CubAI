import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ShapeBlur from './ShapeBlur';
import TextType from './type';
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
  // Summary will arrive as a normal AI message now; retain for reference if needed
  const [summary, setSummary] = useState('');

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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}`;
      const headers = { 'Content-Type': 'application/json' };

      // Inject hidden system context (transcript) at the start so it persists in-thread
      const augmented = systemContext
        ? [{ role: 'user', content: [{ type: 'text', text: systemContext }] }, ...currentMessages]
        : currentMessages;

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

  const handleCaptureClick = () => {
    chrome.runtime.sendMessage({ action: "captureImage" }, (response) => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message);
        return;
      }
      if (response.error) {
        setError(response.error);
        return;
      }
      setCapturedImage(response.dataUrl);
    });
  };

  const handleSend = () => {
    if (!inputValue.trim() && !capturedImage) return;

    const content = [];
    if (capturedImage) {
      content.push({ type: 'image', url: capturedImage });
    }
    if (inputValue.trim()) {
      content.push({ type: 'text', text: inputValue });
    }

    const newUserMessage = { id: messageIdCounter, role: 'user', content };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setMessageIdCounter(prev => prev + 1);
    getGeminiResponse(updatedMessages);
    setInputValue('');
    setCapturedImage(null);
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="app-container">
      <div className="orb-background">
        <ShapeBlur />
      </div>
      <header className="header">
        <TextType 
  text={["CubAI"]}
  typingSpeed={170}
  pauseDuration={1500}
  showCursor={true}
  cursorCharacter="|"
/>
      </header>
      <main className="main-content">
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
            <div key={msg.id} className={`message ${msg.role}-message`}>
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
      <footer className="input-area">
        <div className="input-wrapper">
          {capturedImage && (
            <div className="thumbnail-container">
              <img src={capturedImage} alt="Captured thumbnail" className="thumbnail" />
              <button onClick={() => setCapturedImage(null)} className="remove-thumbnail-button">
                &times;
              </button>
            </div>
          )}
          <input
            type="text"
            className="text-input"
            placeholder="Ask anything..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
        </div>
        <div className="button-group">
          <button className="icon-button" onClick={handleCaptureClick} disabled={isLoading || capturedImage}>
            <svg viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </button>
          <button className="send-button" onClick={handleSend} disabled={isLoading || (!inputValue.trim() && !capturedImage)}>
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;