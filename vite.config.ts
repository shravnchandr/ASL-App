/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// SHA-256 of every phrase model file, per bundle. A file is requested as
// <file>?v=<its sha256> and the bytes are checked against it, by the service
// worker before caching and by the page before use, so files from two exports
// are never mixed. Keys and folders match PHRASE_BUNDLES in
// src/hooks/useSignPhraseModel.ts.
const phraseModelHashes = (dir: string) => Object.fromEntries(
  ['sign_ctc.onnx', 'labels.json', 'preprocess.json'].map(file =>
    [file, createHash('sha256').update(readFileSync(dir + file)).digest('hex')])
)
const phraseModelFiles = {
  'frozen-phrases07': phraseModelHashes('public/models/sign-phrases/'),
  phrases05: phraseModelHashes('public/models/sign-phrases/phrases05/'),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __PHRASE_MODEL_HASHES__: JSON.stringify(phraseModelFiles),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  optimizeDeps: {
    // Pre-bundling breaks the runtime's relative URL to its .wasm file in dev
    exclude: ['onnxruntime-web'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          api: ['axios'],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable CSS code splitting
    cssCodeSplit: true,
  },
  // Production optimizations
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})
