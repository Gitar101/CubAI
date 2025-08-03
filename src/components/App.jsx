import React, { useState } from 'react';
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

  const getGeminiResponse = async (currentMessages) => {
    setIsLoading(true);
    setError('');
    setMessageIdCounter(prevCounter => {
      setMessages(prevMessages => [...prevMessages, { id: prevCounter, role: 'ai', content: [{ type: 'text', text: '' }] }]);
      return prevCounter + 1;
    });
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}`;
      
      const headers = {
        'Content-Type': 'application/json',
      };

      const formattedMessages = currentMessages.map(msg => {
        const parts = msg.content.map(part => {
          if (part.type === 'text') {
            return { text: part.text };
          } else if (part.type === 'image') {
            return { inlineData: { mimeType: 'image/png', data: part.url.split(',')[1] } };
          }
          return {};
        });
        return { role: msg.role === 'ai' ? 'model' : 'user', parts };
      });

      const body = {
        contents: formattedMessages,
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 8192,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
console.log("Received streamed content:", chunk);
buffer += chunk;
        let jsonStream = buffer;

        while (true) {
            const start = jsonStream.indexOf('{');
            if (start === -1) {
                break;
            }

            let braceCount = 0;
            let end = -1;
            let inString = false;

            for (let i = start; i < jsonStream.length; i++) {
                if (jsonStream[i] === '"' && (i === 0 || jsonStream[i-1] !== '\\')) {
                    inString = !inString;
                }
                if (inString) continue;

                if (jsonStream[i] === '{') {
                    braceCount++;
                } else if (jsonStream[i] === '}') {
                    braceCount--;
                }
                if (braceCount === 0) {
                    end = i;
                    break;
                }
            }

            if (end === -1) {
                break;
            }

            const objectStr = jsonStream.substring(start, end + 1);
            try {
                const json = JSON.parse(objectStr);
                if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
                    const aiMessagePart = json.candidates[0].content.parts[0];
                    if (aiMessagePart && aiMessagePart.text) {
                        setMessages(prevMessages => {
                            const newMessages = [...prevMessages];
                            const lastMessageIndex = newMessages.length - 1;
                            if (lastMessageIndex >= 0 && newMessages[lastMessageIndex].role === 'ai') {
                                const updatedLastMessage = {
                                    ...newMessages[lastMessageIndex],
                                    content: [{
                                        ...newMessages[lastMessageIndex].content[0],
                                        text: (newMessages[lastMessageIndex].content[0]?.text || '') + aiMessagePart.text
                                    }]
                                };
                                newMessages[lastMessageIndex] = updatedLastMessage;
                                return newMessages;
                            }
                            return prevMessages;
                        });
                    }
                }
                jsonStream = jsonStream.substring(end + 1);
            } catch (e) {
                console.error("Failed to parse JSON object from stream:", e);
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