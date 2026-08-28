import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";
import path from "node:path";

const useHttps = process.env.EASYSAY_HTTPS !== "false";
const webPort = Number(process.env.EASYSAY_WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "app-icon.svg",
        "app-icon-192.png",
        "app-icon-512.png",
        "apple-touch-icon.png"
      ],
      manifest: {
        name: "EasySay 语言口语教练",
        short_name: "EasySay",
        description: "面向成年人的每日语言口语训练闭环",
        id: "/",
        lang: "zh-CN",
        theme_color: "#f5f2e9",
        background_color: "#f5f2e9",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/app-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/app-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/app-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/ark\.cn-beijing\.volces\.com\//,
            handler: "NetworkOnly"
          }
        ]
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: webPort,
    https: useHttps
      ? {
          key: fs.readFileSync(path.resolve(".cert/easysay-key.pem")),
          cert: fs.readFileSync(path.resolve(".cert/easysay-cert.pem"))
        }
      : undefined,
    proxy: {
      "/api": "http://localhost:8787"
    }
  },
  build: {
    target: "es2022"
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
