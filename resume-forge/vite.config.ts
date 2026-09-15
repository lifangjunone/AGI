import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: env.RESUME_PUBLIC_BASE || "/",
    plugins: [react()],
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
