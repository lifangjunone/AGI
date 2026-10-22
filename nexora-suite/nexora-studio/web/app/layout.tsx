import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "Nexora Studio · 星铸", template: "%s · Nexora Studio" },
  description: "Build, debug, evaluate, and publish production agents",
  applicationName: "Nexora Studio",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/icon.svg", apple: "/icon.svg" }
};
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
