const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "reports/junit.xml" }]
  ],
  outputDir: "test-results",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:4174",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "PORT=4174 node server.js",
        url: "http://127.0.0.1:4174/api/health",
        reuseExistingServer: false,
        timeout: 15_000
      }
});
