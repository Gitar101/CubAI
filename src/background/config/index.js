// Configuration settings for the extension

// Use Vite-injected env var (ensure .env has VITE_GEMINI_API_KEY and the background is bundled by Vite)
export const GEMINI_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY)
  ? import.meta.env.VITE_GEMINI_API_KEY
  : undefined;

export const GROQ_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GROQ_API_KEY)
  ? import.meta.env.VITE_GROQ_API_KEY
  : undefined;

// Define the grounding tool for Gemini API
export const groundingTool = {
  googleSearch: {},
};

// Configuration for Gemini API
export const defaultGenerationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 10000,
};

// YouTube summarization settings
export const SUMMARIZE_DEBOUNCE_MS = 3000;