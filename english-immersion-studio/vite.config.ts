import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          vrm: ["@pixiv/three-vrm"],
          pixelStreaming: [
            "@epicgames-ps/lib-pixelstreamingfrontend-ue5.7"
          ]
        }
      }
    }
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: "./tests/setup.ts"
  }
});
