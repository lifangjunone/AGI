import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata={
  title:{default:"Nexora Control · 星域",template:"%s · Nexora Control"},
  description:"Register, govern, route, and observe every enterprise agent",
  applicationName:"Nexora Control",
  icons:{icon:[{url:"/icon.svg",type:"image/svg+xml"}],shortcut:"/icon.svg",apple:"/icon.svg"}
};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}
