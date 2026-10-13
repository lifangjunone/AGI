import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.TRAVEL_FRAME_BASE || '/',
  server: {
    port: 5173,
  },
});
