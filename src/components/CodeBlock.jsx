import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Eye } from 'lucide-react';

const CodeBlock = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openHtmlInNewTab = (htmlContent) => {
    // Create a data URI with the HTML content
    // This avoids CSP issues since we're not executing scripts in the extension context
    const encodedHtml = encodeURIComponent(htmlContent);
    const dataUrl = `data:text/html;charset=utf-8,${encodedHtml}`;
    
    // Open in a new tab
    chrome.tabs.create({ url: dataUrl });
  };

  return (
    <div className="relative rounded-md overflow-hidden my-4 text-sm md:text-base border-2 border-[#8B7B6B]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#3C3C3C] text-[#CCCCCC] font-sans text-xs rounded-t-[4px]">
        <span className="uppercase">{language}</span>
        <div className="flex items-center gap-3">
          {language.toLowerCase() === 'html' && (
            <button
              onClick={() => openHtmlInNewTab(code)}
              className="flex items-center gap-1 text-xs hover:text-white transition-colors duration-200"
              aria-label="Preview HTML code"
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs hover:text-white transition-colors duration-200"
            aria-label="Copy code to clipboard"
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={dark}
        customStyle={{
          backgroundColor: '#2D2D2D',
          padding: '1rem',
          borderRadius: '0 0 4px 4px',
          overflowX: 'auto',
          fontSize: '14px',
          fontFamily: "'Fira Code', 'Roboto Mono', monospace",
          color: '#F8F8F2',
        }}
        codeTagProps={{
          style: {
            fontFamily: "'Fira Code', 'Roboto Mono', monospace",
            fontSize: '14px',
            color: '#F8F8F2',
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;