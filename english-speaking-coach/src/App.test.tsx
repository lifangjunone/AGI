import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App navigation", () => {
  it("keeps the primary navigation visible during first-time setup", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    });
    vi.stubGlobal("window", {
      SpeechRecognition: undefined,
      webkitSpeechRecognition: undefined
    });

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("少学一点，今天就说出来。");
    expect(html).toContain('aria-label="主导航"');
    for (const label of ["今天", "路线", "对话", "进步", "设置"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).not.toContain("disabled");
  });
});
