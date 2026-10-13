import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.TREND_FORUM_BASE || "/",
  plugins: [react()],
});
