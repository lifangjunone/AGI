"use client";

import { useEffect } from "react";

export function MermaidRuntime() {
  useEffect(() => {
    let mounted = true;

    async function renderMermaid() {
      const mermaid = (await import("mermaid")).default;
      if (!mounted) return;
      mermaid.initialize({
        startOnLoad: true,
        theme: "base",
        securityLevel: "loose",
        themeVariables: {
          darkMode: true,
          background: "#171717",
          primaryColor: "#0e2d49",
          primaryTextColor: "#86caff",
          primaryBorderColor: "#235175",
          lineColor: "#8c8c8c",
          secondaryColor: "#0e2d49",
          tertiaryColor: "#171717",
          clusterBkg: "#202020",
          clusterBorder: "#333333",
          edgeLabelBackground: "#171717",
          nodeBorder: "#235175",
          mainBkg: "#0e2d49",
          textColor: "#e8e8e8",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          actorBkg: "#0e2d49",
          actorBorder: "#4f8ec1",
          actorTextColor: "#e8e8e8",
          signalColor: "#b7b7b7",
          signalTextColor: "#e8e8e8",
          labelBoxBkgColor: "#171717",
          labelBoxBorderColor: "#333333",
          labelTextColor: "#e8e8e8",
          loopTextColor: "#e8e8e8",
          noteBkgColor: "#202020",
          noteTextColor: "#e8e8e8",
          noteBorderColor: "#444444",
        },
        flowchart: {
          curve: "basis",
          nodeSpacing: 46,
          rankSpacing: 58,
          padding: 16,
        },
        sequence: {
          mirrorActors: true,
          actorMargin: 72,
          messageMargin: 42,
          boxMargin: 12,
          bottomMarginAdj: 12,
          noteMargin: 12,
        },
      });
      await mermaid.run();
    }

    renderMermaid();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
