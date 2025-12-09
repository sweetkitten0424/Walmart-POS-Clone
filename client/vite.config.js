import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config with proxy to backend API on localhost:4000
// and optional local print agent on localhost:9100
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/print': 'http://localhost:9100'
    }
  }
});