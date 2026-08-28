import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "EASYSAY_HTTPS=false EASYSAY_WEB_PORT=5174 npm run dev:web",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true
  }
});
