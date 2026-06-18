import { describe, expect, it } from "vitest";
import { buildReducedMotionCss } from "./motionPreferences.js";

describe("motionPreferences", () => {
  it("disables animations, transitions and smooth scroll for reduced-motion users", () => {
    const css = buildReducedMotionCss();

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("transition: none !important");
    expect(css).toContain("scroll-behavior: auto !important");
  });

  it("covers pseudo-elements that can carry decorative motion", () => {
    expect(buildReducedMotionCss()).toContain("*, *::before, *::after");
  });
});
