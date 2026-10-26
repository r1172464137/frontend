import { describe, expect, it } from "vitest";
import { isSameOriginLottieSource } from "./lottie.js";
import lottieSource from "./lottie.tsx?raw";

describe("local Lottie runtime", () => {
  it("allows only same-origin animation sources", () => {
    const pageUrl = "https://panel.example/app/index.html#/";

    expect(
      isSameOriginLottieSource("./assets/lotties/login.json", pageUrl)
    ).toBe(true);
    expect(
      isSameOriginLottieSource(
        "https://panel.example/assets/lotties/login.json",
        pageUrl
      )
    ).toBe(true);
    expect(
      isSameOriginLottieSource(
        "https://cdn.jsdelivr.net/animation.json",
        pageUrl
      )
    ).toBe(false);
    expect(
      isSameOriginLottieSource("//unpkg.com/animation.json", pageUrl)
    ).toBe(false);
  });

  it("loads the installed JavaScript renderer without a WASM or CDN fallback", () => {
    expect(lottieSource).toContain('import("lottie-web")');
    expect(lottieSource).not.toContain("@lottiefiles");
    expect(lottieSource).not.toMatch(/cdn\.jsdelivr|unpkg\.com|\.wasm/iu);
  });

  it("keeps reduced-motion users on the stable decorative placeholder", () => {
    expect(lottieSource).toContain("shouldRender && !prefersReducedMotion");
    expect(lottieSource).toContain("autoplay={Boolean(autoplay && isVisible)}");
  });
});
