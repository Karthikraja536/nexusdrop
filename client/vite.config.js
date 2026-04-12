import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'ws://localhost:3001',
        ws: true
      },
      '/peerjs': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000
  }
});
