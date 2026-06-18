export function buildSessionStatusBadge(mode, { kind = "ssh", prefix = "", error = "" } = {}) {
  const normalized = normalizeSessionMode(mode);
  const label = statusLabel(normalized, kind);
  const text = prefix ? `${prefix} ${label}` : label;

  return {
    text,
    title: String(error || "").trim(),
    tone: normalized === "connected" ? "success" : normalized === "error" ? "error" : "pending",
    borderTone: normalized === "connected" ? "success" : normalized === "error" ? "error" : "neutral",
    mode: normalized,
  };
}

function normalizeSessionMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  if (value === "connected" || value === "error" || value === "connecting" || value === "preview") return value;
  return "preview";
}

function statusLabel(mode, kind) {
  if (kind === "pty") {
    if (mode === "connected") return "pty 已连接";
    if (mode === "error") return "pty 失败";
    if (mode === "connecting") return "pty 启动中";
    return "预览模式";
  }

  if (kind === "ssh-main") {
    if (mode === "connected") return "russh 已连接";
    if (mode === "error") return "连接失败";
    if (mode === "connecting") return "连接中";
    return "预览模式";
  }

  if (mode === "connected") return "已连接";
  if (mode === "error") return "失败";
  if (mode === "connecting") return "连接中";
  return "预览";
}
