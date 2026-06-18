import { canOpenHostSession, canOpenHostSftp } from "./hostActions.js";
import { formatMetaShortcut } from "./shortcuts.js";

export function getPaletteActionGuard(item, action) {
  if (!item) {
    return { ok: false, message: "没有可操作的主机" };
  }
  if (action === "connect" && !canOpenHostSession(item)) {
    return { ok: false, message: "离线主机不可连接" };
  }
  if (action === "sftp" && !canOpenHostSftp(item)) {
    return { ok: false, message: "离线主机不可打开 SFTP" };
  }
  return { ok: true, message: "" };
}

export function getPaletteActionHint(item, selected = false) {
  if (!selected) return { text: "", tone: "neutral" };
  const guard = getPaletteActionGuard(item, "connect");
  return {
    text: guard.ok ? "↵ 连接" : guard.message,
    tone: guard.ok ? "neutral" : "error",
  };
}

export function buildPaletteStatusMessage(text, tone = "success") {
  const message = String(text || "").trim();
  return {
    text: message,
    tone: tone === "error" ? "error" : "success",
  };
}

export function buildPaletteChromeDisplay({ platform } = {}) {
  return {
    inputPlaceholder: "输入主机名、IP 或标签,回车直接连接…",
    escapeKey: "esc",
    emptyResultsText: "没有匹配的主机 — 输入 user@host 可直接发起新连接",
    shortcuts: [
      { key: "↵", label: "连接" },
      { key: "↑↓", label: "选择" },
      { key: formatMetaShortcut("C", platform), label: "复制 ssh 命令" },
      { key: formatMetaShortcut("F", platform), label: "SFTP 打开" },
    ],
  };
}
