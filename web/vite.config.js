import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // The browser calls /api/...; Vite forwards it to the Express API.
    // In Docker Compose this is http://api:4000 (set in docker-compose.yml).
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:4000' },
    // File watching through Docker on Windows needs polling (WEB_POLLING=true in .env).
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
