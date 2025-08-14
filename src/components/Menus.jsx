import React from 'react';

const Menus = ({
  showModeMenu,
  selectMode,
  showTabsMenu,
  availableTabs,
  addTabContext,
  showModelMenu,
  onSelectModel,
  selectedModel,
}) => {
  return (
    <>
      {showModeMenu && (
        <div data-menu="mode" className="absolute bottom-16 left-4 bg-gray-700 text-white rounded-lg shadow-lg">
          <ul>
            <li onClick={() => selectMode('chat')} className="p-2 hover:bg-gray-600 cursor-pointer">Chat</li>
            <li onClick={() => selectMode('explain')} className="p-2 hover:bg-gray-600 cursor-pointer">Explain</li>
            <li onClick={() => selectMode('summarize')} className="p-2 hover:bg-gray-600 cursor-pointer">Summarize</li>
            <li onClick={() => selectMode('tutor')} className="p-2 hover:bg-gray-600 cursor-pointer">Tutor</li>
          </ul>
        </div>
      )}
      {showTabsMenu && (
        <div data-menu="tabs" className="absolute bottom-16 right-4 bg-gray-700 text-white rounded-lg shadow-lg">
          <ul>
            {(availableTabs || []).map(tab => (
              <li key={tab.id} onClick={() => addTabContext(tab.id)} className="p-2 hover:bg-gray-600 cursor-pointer">
                {tab.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showModelMenu && (
        <div data-menu="model" className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-gray-700 text-white rounded-lg shadow-lg">
          <ul>
            <li onClick={() => onSelectModel('gemini-2.5-flash')} className={`p-2 hover:bg-gray-600 cursor-pointer ${selectedModel === 'gemini-2.5-flash' ? 'font-bold' : ''}`}>
              Gemini 2.5 Flash
            </li>
            <li onClick={() => onSelectModel('gemini-2.5-flash')} className={`p-2 hover:bg-gray-600 cursor-pointer ${selectedModel === 'gemini-2.5-flash' ? 'font-bold' : ''}`}>
              Gemini 2.0 Pro
            </li>
          </ul>
        </div>
      )}
    </>
  );
};

export default Menus;