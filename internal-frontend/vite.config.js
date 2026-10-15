import { defineConfig } from 'vite';

// Relative API URLs work in both development and the Docker Nginx container.
// These are server addresses only; no database credentials enter the browser.
export default defineConfig({
  appType: 'mpa',
  build: { rolldownOptions: { input: { admin: 'admin.html', analyst: 'analyst.html' } } },
  server: {
    proxy: {
      '/api': { target: process.env.INTERNAL_API_URL || 'http://127.0.0.1:8085' },
      '/auth': { target: process.env.AUTH_API_URL || 'http://127.0.0.1:3000' },
    },
  },
});
