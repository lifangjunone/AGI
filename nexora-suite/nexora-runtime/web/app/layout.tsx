import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "Nexora Runtime · 星驰", template: "%s · Nexora Runtime" },
  description: "Connect, operate, and observe enterprise agent runtimes",
  applicationName: "Nexora Runtime"
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
