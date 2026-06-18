import { formatHostAddress } from "./hosts.js";

export function buildSshConnectingLine(host, paneLabel = "") {
  const pane = normalizePaneLabel(paneLabel);
  return `正在连接 ${formatSshTerminalTarget(host)}${pane ? `（${pane}）` : ""}...`;
}

export function buildSshHostKeyAcceptedLine(host) {
  return `\r\nRELAY: 已信任服务器密钥 ${formatHostPort(host)}，正在重新连接...\r\n`;
}

export function buildSshErrorLine(message) {
  return `\r\nRELAY SSH 错误: ${message}`;
}

export function buildLocalPtyStartingLine() {
  return "正在启动本地 PTY...";
}

export function buildLocalPtyErrorLine(message) {
  return `\r\nRELAY PTY 错误: ${message}`;
}

export function buildLocalTerminalDisplay({ searchShortcut = "", searchOpen = false } = {}) {
  const shortcut = String(searchShortcut || "").trim();
  return {
    backLabel: "← 主机列表",
    shellLabel: "local shell",
    searchButtonLabel: `${shortcut ? `${shortcut} ` : ""}搜索`,
    searchActive: Boolean(searchOpen),
    previewLines: [
      { t: "$", c: "echo RELAY local terminal" },
      { t: ">", c: "本地 PTY 将在桌面端连接到当前系统 shell" },
      { t: ">", c: "支持二进制 Channel 输出、输入转发和窗口尺寸同步" },
    ],
  };
}

function formatSshTerminalTarget(host) {
  const user = String(host?.user || "").trim();
  const target = formatHostPort(host);
  return user ? `${user}@${target}` : target;
}

function formatHostPort(host) {
  const targetHost = formatHostAddress(host?.host) || "unknown-host";
  const port = Number(host?.port) || 22;
  return `${targetHost}:${port}`;
}

function normalizePaneLabel(label) {
  const text = String(label || "").trim();
  if (!text) return "";
  return text === "split" ? "拆分窗格" : text;
}
