export function getCommandTargetPaneIds({ broadcast = false, splitEnabled = false, activePaneId = "primary" } = {}) {
  if (broadcast && splitEnabled) return ["primary", "split"];
  return [activePaneId || "primary"];
}

export function countActiveCommandTargets({ broadcast = false, splitEnabled = false } = {}) {
  return getCommandTargetPaneIds({ broadcast, splitEnabled }).length;
}

export function buildSessionInputPlaceholder({ broadcast = false, splitEnabled = false, activePaneId = "primary" } = {}) {
  if (broadcast && splitEnabled) return "命令将同时发送到 2 个会话…";
  if (broadcast) return "广播已开启；打开拆分后将同时发送到所有会话…";
  if (splitEnabled && activePaneId === "split") return "命令将发送到拆分会话…";
  if (splitEnabled) return "命令将发送到主会话；点击拆分窗格可切换目标…";
  return "试试输入 trz 或 tsz access.log,Tab 接受补全…";
}

export function buildSessionInputPrefix({ broadcast = false, splitEnabled = false, activePaneId = "primary" } = {}) {
  if (!broadcast) return splitEnabled ? `❯ ${activePaneId === "split" ? "拆分" : "主"}` : "❯";
  return splitEnabled ? "⌁ 2 个" : "⌁ 广播";
}
