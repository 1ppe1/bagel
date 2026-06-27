import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webPort = Number.parseInt(process.env.DOCSYNC_WEB_PORT ?? '5173', 10);
const apiOrigin = process.env.DOCSYNC_API_ORIGIN ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: webPort,
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '127.0.0.1',
    port: webPort
  }
});
