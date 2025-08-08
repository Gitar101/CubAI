# AI Sidekick - Enhanced UI

![CubAI Logo](public/cubai2.png)

## Overview

AI Sidekick - Enhanced UI is an innovative application designed to provide an enhanced user interface for interacting with AI models, specifically leveraging the Google Gemini API. This project aims to offer a seamless and intuitive experience for various AI-powered tasks, including conversational chat, content summarization, and detailed explanations based on provided page context. It also features advanced capabilities like full-page screenshot capture for visual context.

## Features

- **Conversational AI Chat**: Engage in natural language conversations with the Gemini AI model.
- **Contextual Summarization**: Get concise summaries of web page content.
- **Contextual Explanations**: Receive clear explanations of concepts, strictly based on the provided page context.
- **Full-Page Screenshot Capture**: Attach screenshots of web pages to your queries for visual context.
- **Dynamic Mode Switching**: Easily switch between "Chat", "Summarize", and "Explain" modes.
- **Tab Content Integration**: Fetch and include content from active browser tabs as context for AI interactions.
- **Responsive UI**: A clean and responsive user interface built with React.

## Technologies Used

- **React**: A JavaScript library for building user interfaces.
- **Vite**: A fast build tool that provides a lightning-fast development experience.
- **Google Gemini API**: Powers the AI conversational and contextual understanding capabilities.
- **Three.js & OGL**: For advanced 3D graphics rendering, contributing to the "Enhanced UI" aspect.
- **React Markdown**: For rendering markdown content in messages.
- **Tailwind CSS**: (Implicitly used based on `tailwind.config.js`) A utility-first CSS framework for rapid UI development.
- **GSAP**: GreenSock Animation Platform for robust JavaScript animations.

## Setup and Installation

To get this project up and running on your local machine, follow these steps:

### Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/en/download/) (LTS version recommended)
- [npm](https://www.npmjs.com/get-npm) or [Yarn](https://yarnpkg.com/getting-started/install) (npm is used in the examples below)
- A Google Gemini API Key. You can obtain one from the [Google AI Studio](https://aistudio.google.com/app/apikey).

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/ai-sidekick-enhanced-ui.git
    cd ai-sidekick-enhanced-ui
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure your Gemini API Key**:
    Create a `.env` file in the root of your project and add your Gemini API key:
    ```
    VITE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
    ```
    Replace `YOUR_GEMINI_API_KEY_HERE` with the actual API key you obtained.

### Running the Project

To run the project in development mode:

```bash
npm run dev
```

This will start the development server, usually at `http://localhost:5173`. The application will automatically reload as you make changes.

### Building for Production

To build the project for production, which will generate optimized static assets in the `dist` directory:

```bash
npm run build
```

## Usage

Once the application is running, you can interact with the AI Sidekick through its intuitive interface.

-   **Type your questions** in the input field at the bottom.
-   **Switch modes** (Chat, Summarize, Explain) using the icon on the left side of the input bar.
-   **Add page context** from active browser tabs using the "+" icon.
-   **Capture full-page screenshots** using the camera icon to provide visual context to your queries.

## Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'feat: Add new feature'`).
5.  Push to the branch (`git push origin feature/your-feature-name`).
6.  Open a Pull Request.

Please ensure your code adheres to the project's coding standards and includes appropriate tests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.