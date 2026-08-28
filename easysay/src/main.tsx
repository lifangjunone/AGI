import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import NativeConnectionGate from "./components/NativeConnectionGate";
import { isNativeApp } from "./lib/nativeConnection";
import "./styles.css";

if (!isNativeApp()) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NativeConnectionGate>
      <App />
    </NativeConnectionGate>
  </StrictMode>
);
