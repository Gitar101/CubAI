import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App.jsx';
import './index.css';

// Minimal CubAI panel scaffold: shows prepared user-messages and lets user type a question.
// No API calls; when user submits, we append a line prefixed with user-message: "<question>"
function CubAIPanel() {
  const ctxRef = useRef(null);
  const inputRef = useRef(null);

  // Ensure a scrollable context area
  useEffect(() => {
    const area = ctxRef.current;
    if (area) area.scrollTop = area.scrollHeight;
  });

  // Append lines utility
  const appendLines = (lines) => {
    const area = ctxRef.current;
    if (!area) return;
    const text = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
    area.textContent = [area.textContent, text].filter(Boolean).join('\n');
    area.scrollTop = area.scrollHeight;
  };

  // Wire background runtime messages to this panel
  useEffect(() => {
    const handler = (msg) => {
      if (!msg) return;
      if (msg.action === 'appendSystemContext' && typeof msg.text === 'string') {
        appendLines([msg.text]);
      }
      if (msg.action === 'appendUserMessage' && typeof msg.text === 'string') {
        appendLines([msg.text]);
      }
      if (msg.action === 'displayError' && typeof msg.error === 'string') {
        appendLines([`[error] ${msg.error}`]);
      }
    };
    const unsub = chrome?.runtime?.onMessage?.addListener(handler);
    return () => {
      try {
        chrome?.runtime?.onMessage?.removeListener(handler);
      } catch {}
    };
  }, []);

  // Submit question -> append as user-message: "<question>"
  const onAsk = (e) => {
    e?.preventDefault?.();
    const val = String(inputRef.current?.value || '').trim();
    if (!val) return;
    appendLines([`user-message: "${val}"`]);
    inputRef.current.value = '';
  };

  return (
    <div style={{ padding: 12 }}>
      <div
        ref={ctxRef}
        id="__cubai_messages_area__"
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12,
          padding: 12,
          marginBottom: 12,
          border: '1px solid #333',
          borderRadius: 8,
          background: '#0b0b0f',
          color: '#e8e8e8',
          height: 260,
          overflow: 'auto',
        }}
      />
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
    {/* Keep your existing app, add CubAIPanel below to visualize prepared messages and user input */}
    <App />
    <CubAIPanel />
  </React.StrictMode>
);