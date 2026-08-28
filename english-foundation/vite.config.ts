import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: { port: 1430, strictPort: true },
  clearScreen: false,
  test: { include: ['src/**/*.test.ts'] },
})
