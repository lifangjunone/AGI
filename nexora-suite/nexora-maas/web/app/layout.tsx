import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "Nexora MaaS · 星模", template: "%s · Nexora MaaS" },
  description: "Connect, route, govern, and observe enterprise foundation models",
  applicationName: "Nexora MaaS",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/icon.svg", apple: "/icon.svg" }
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
