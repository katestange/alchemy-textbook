import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Plain Vite + Svelte SPA (no SvelteKit) per spec Decision 44.
// Dev server proxies API/content routes to the FastAPI backend (assumed on :8000).
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/chapter': 'http://localhost:8000',
      '/book': 'http://localhost:8000'
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js']
  }
});
