import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'public/manifest.json',
            dest: '.'
          }
        ]
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY)
    },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        background: 'src/background/index.js'
      },
      output: {
        entryFileNames: chunkInfo => {
          if (chunkInfo.name === 'background') {
            return '[name].js';
          }
          return 'assets/[name].js';
        },
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`
      }
    }
  }
  }
})