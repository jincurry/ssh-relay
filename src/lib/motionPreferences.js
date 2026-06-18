export function buildReducedMotionCss() {
  return [
    "@media (prefers-reduced-motion: reduce) {",
    "  *, *::before, *::after {",
    "    animation: none !important;",
    "    transition: none !important;",
    "    scroll-behavior: auto !important;",
    "  }",
    "}",
  ].join("\n");
}
