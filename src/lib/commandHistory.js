export const COMMAND_HISTORY_STORAGE_KEY = "relay.commandHistory.v1";

export const DEFAULT_COMMANDS = [
  "docker ps -a",
  "df -h",
  "tail -f /var/log/nginx/access.log",
  "systemctl status nginx",
  "free -m",
  "ss -tlnp",
  "journalctl -u nginx -f",
];

export function loadCommandHistory(storage) {
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(COMMAND_HISTORY_STORAGE_KEY) || "[]");
    return normalizeCommandHistory(parsed);
  } catch {
    return [];
  }
}

export function saveCommandHistory(storage, history) {
  if (!storage) return false;
  storage.setItem(COMMAND_HISTORY_STORAGE_KEY, JSON.stringify(normalizeCommandHistory(history)));
  return true;
}

export function clearCommandHistory() {
  return [];
}

export function buildCommandHistoryClearConfirmation(history) {
  const count = normalizeCommandHistory(history, Number.MAX_SAFE_INTEGER).length;
  const lines = [`清除 ${count} 条本地命令历史?`];
  lines.push(
    "",
    "只会删除 RELAY 保存在本机的历史记录和 Tab 补全来源。",
    "不会修改远端 shell history、命令片段或主机配置。",
  );
  return lines.join("\n");
}

export function buildCommandHistoryClearButtonDisplay(history = []) {
  const count = normalizeCommandHistory(history, Number.MAX_SAFE_INTEGER).length;
  return {
    visible: count > 0,
    title: "清除本地命令历史",
    text: "清除历史",
    count,
  };
}

export function recordCommand(history, command, limit = 100) {
  const value = String(command || "").trim();
  if (!isValidCommand(value)) return history;
  return normalizeCommandHistory([value, ...normalizeCommandHistory(history).filter(item => item !== value)], limit);
}

export function getCommandCompletion(input, history, defaults = DEFAULT_COMMANDS) {
  const value = String(input || "");
  const prefix = value.trimStart().toLowerCase();
  if (!prefix) return "";

  const candidates = normalizeCommandHistory([...history, ...defaults], Number.MAX_SAFE_INTEGER);
  const match = candidates.find(command => command.toLowerCase().startsWith(prefix) && command.length > prefix.length);
  if (!match) return "";
  return match.slice(prefix.length);
}

export function normalizeCommandHistory(history, limit = 100) {
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  const normalized = [];
  for (const command of history) {
    if (typeof command !== "string") continue;
    const value = command.trim();
    if (!isValidCommand(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function isValidCommand(command) {
  return typeof command === "string" && command.trim().length > 0 && command.length <= 500;
}
