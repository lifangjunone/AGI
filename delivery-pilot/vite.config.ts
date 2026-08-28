import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  cacheDir: '/tmp/delivery-pilot-vite-cache',
  server: {
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
  test: {
    include: ['src/**/*.test.ts'],
  },
})
