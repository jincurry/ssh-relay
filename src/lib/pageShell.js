export function buildPageShellDisplay({ backLabel = "← 返回" } = {}) {
  return {
    backLabel: String(backLabel || "").trim() || "← 返回",
  };
}
