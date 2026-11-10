import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "分身工作室",
  description: "给专家和创始人的 AI 接待页生成器",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
