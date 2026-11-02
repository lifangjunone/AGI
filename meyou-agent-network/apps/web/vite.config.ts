import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"]
  },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:43180", ws: true },
      "/health": "http://localhost:43180"
    }
  }
});
