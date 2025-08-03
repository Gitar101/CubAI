# AI Sidekick Chrome Extension

This is a React-based Chrome extension that provides an AI-powered sidebar for screen capture and Q&A.

## Setup

First, install the necessary dependencies using npm:

```bash
npm install
```

## Build

To build the extension for production, run the following command. This will create a `dist` directory with the compiled files.

```bash
npm run build
```

## Installation

To load and test the extension in your browser, follow these steps:

1.  Open Google Chrome.
2.  Navigate to `chrome://extensions`.
3.  Enable the **Developer mode** toggle in the top-right corner.
4.  Click the **Load unpacked** button.
5.  Select the `dist` directory that was created by the build process.

The extension's icon should now appear in your Chrome toolbar. Click it to open the AI Sidekick sidebar.