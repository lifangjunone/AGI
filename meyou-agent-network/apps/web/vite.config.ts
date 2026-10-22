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
      "/api": "http://localhost:43180",
      "/health": "http://localhost:43180"
    }
  }
});
