import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Deliberately excludes App/Plaza and all business-page entry points.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: process.env.MEYOU_ADMIN_BUILD_DIR || "dist-admin",
    emptyOutDir: false,
    assetsDir: "admin-assets",
    rollupOptions: { input: fileURLToPath(new URL("./admin-entry.html", import.meta.url)) }
  }
});
