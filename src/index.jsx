import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App.jsx';
import './index.css';

// CubAIPanel is now solely for user input and system/user messages,
// with AI responses handled by App.jsx for streaming.
function CubAIPanel() {
  // No longer needs ctxRef or appendLines as App.jsx handles all message display.
  // inputRef is still needed for user input.
  const inputRef = React.useRef(null);

  // Submit question -> append as user-message: "<question>"
  const onAsk = (e) => {
    e?.preventDefault?.();
    const val = String(inputRef.current?.value || '').trim();
    if (!val) return;

    // Send user message to background script, which will then relay to App.jsx
    chrome.runtime.sendMessage({ action: "appendUserMessage", text: `user-message: "${val}"` });
    inputRef.current.value = '';
  };

  // No longer rendering the message area here.
  return (
    <div style={{ padding: 12 }}>
      <form onSubmit={onAsk} style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder='Ask: e.g., explain x to me'
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #333',
            background: '#0f1117',
            color: '#e8e8e8',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            background: '#2b6cb0',
            color: '#fff',
            border: 'none',
            padding: '8px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Ask
        </button>
      </form>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    {/* CubAIPanel is now a separate component for input only, not message display */}
    <CubAIPanel />
  </React.StrictMode>
);