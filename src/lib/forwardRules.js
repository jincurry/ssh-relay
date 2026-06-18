const SUPPORTED_FORWARD_TYPES = new Set(["L", "R", "D"]);

export function createForwardRule(type, id = Date.now()) {
  if (type === "D") {
    return { id, type, lport: "1080", rhost: "", rport: "", on: false };
  }

  if (type === "R") {
    return { id, type, lport: "8080", rhost: "127.0.0.1", rport: "18080", on: false };
  }

  return { id, type: "L", lport: "8080", rhost: "127.0.0.1", rport: "80", on: false };
}

export function normalizeForwardRule(rule = {}, { fallbackId = null } = {}) {
  const type = String(rule?.type || "L").trim().toUpperCase() || "L";
  const lport = String(rule?.lport || "").trim();
  const rhost = type === "D" ? "" : String(rule?.rhost || "").trim();
  const rport = type === "D" ? "" : String(rule?.rport || "").trim();
  const id = normalizeForwardId(rule?.id, fallbackId, { type, lport, rhost, rport });

  return {
    id,
    type,
    lport,
    rhost,
    rport,
    on: Boolean(rule?.on),
  };
}

export function validateForwardRule(rule) {
  const normalized = normalizeForwardRule(rule);
  if (!SUPPORTED_FORWARD_TYPES.has(normalized.type)) {
    return { ok: false, message: `不支持的转发类型: ${normalized.type || "未知"}` };
  }

  const bindPort = parsePort(normalized.lport, normalized.type === "R" ? "本地目标端口" : "本地监听端口");
  if (!bindPort.ok) return bindPort;

  if (normalized.type === "D") return { ok: true };

  const remotePort = parsePort(normalized.rport, normalized.type === "R" ? "远端监听端口" : "目标端口");
  if (!remotePort.ok) return remotePort;

  if (normalized.type === "L" && !normalized.rhost) {
    return { ok: false, message: "目标主机不能为空" };
  }

  return { ok: true };
}

export function describeForwardRule(rule) {
  const normalized = normalizeForwardRule(rule);
  if (!SUPPORTED_FORWARD_TYPES.has(normalized.type)) return `不支持的转发: ${normalized.type || "未知"}`;
  if (normalized.type === "D") return `SOCKS5 localhost:${normalized.lport}`;
  if (normalized.type === "R") return `remote:${normalized.rport} -> ${normalized.rhost || "127.0.0.1"}:${normalized.lport}`;
  return `localhost:${normalized.lport} -> ${normalized.rhost}:${normalized.rport}`;
}

export function buildForwardRuleDisplay(rule = {}) {
  const normalized = normalizeForwardRule(rule);
  const supported = SUPPORTED_FORWARD_TYPES.has(normalized.type);
  const typeMeta = getForwardTypeMeta(normalized.type);
  const busy = Boolean(rule?.busy);
  const active = Boolean(rule?.on);
  const runtime = Boolean(rule?.runtimeId);

  return {
    type: normalized.type,
    typeName: typeMeta.name,
    typeBadge: `-${normalized.type} ${typeMeta.name}`,
    colorKey: typeMeta.colorKey,
    description: describeForwardRule(normalized),
    opacity: active ? 1 : 0.55,
    activeVisible: active,
    runtimeVisible: runtime,
    runtimeLabel: runtime ? "runtime" : "",
    toggleText: busy ? "处理中" : active ? "已启用" : "已停用",
    toggleTone: active ? "success" : "neutral",
    toggleDisabled: busy || !supported,
    deleteDisabled: busy,
    supported,
  };
}

export function buildForwardRuleFieldDisplay(rule = {}) {
  const normalized = normalizeForwardRule(rule);
  const type = normalized.type;
  const reverse = type === "R";
  const dynamic = type === "D";

  return {
    type,
    sourcePrefix: reverse ? "remote:" : "localhost:",
    sourcePortValue: reverse ? normalized.rport : normalized.lport,
    sourcePortPatchKey: reverse ? "rport" : "lport",
    sourcePortTitle: reverse ? "远端监听端口" : "本地监听端口",
    arrowPoints: reverse ? "2,5 8,2 8,8" : "32,5 26,2 26,8",
    showDynamicTarget: dynamic,
    dynamicTargetLabel: "任意目标(SOCKS5)",
    showTargetFields: !dynamic,
    targetHostValue: reverse ? normalized.rhost || "127.0.0.1" : normalized.rhost,
    targetHostPatchKey: "rhost",
    targetHostTitle: reverse ? "本地目标主机" : "目标主机",
    targetPortValue: reverse ? normalized.lport : normalized.rport,
    targetPortPatchKey: reverse ? "lport" : "rport",
    targetPortTitle: reverse ? "本地目标端口" : "目标端口",
  };
}

export function buildForwardTypeCreateOptions(types = ["L", "R", "D"]) {
  const items = Array.isArray(types) ? types : [];
  return items.map(type => {
    const normalizedType = String(type || "").trim().toUpperCase();
    const meta = getForwardTypeMeta(normalizedType);
    return {
      type: normalizedType || "L",
      name: meta.name,
      label: `＋ ${meta.name}`,
      colorKey: meta.colorKey,
      supported: SUPPORTED_FORWARD_TYPES.has(normalizedType),
    };
  });
}

export function buildForwardDeleteConfirmation(rule) {
  const normalized = normalizeForwardRule(rule);
  const description = describeForwardRule(normalized);
  const lines = ["删除端口转发规则?", "", description];
  if (rule?.on || rule?.runtimeId) {
    lines.push("", "如果该规则正在运行,RELAY 会先停止当前监听器。");
  }
  return lines.join("\n");
}

function getForwardTypeMeta(type) {
  if (type === "R") return { name: "远程转发", colorKey: "blue" };
  if (type === "D") return { name: "动态 SOCKS", colorKey: "amber" };
  if (type === "L") return { name: "本地转发", colorKey: "green" };
  return { name: "未知转发", colorKey: "red" };
}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { ok: false, message: `${label}必须是 1-65535 之间的整数` };
  }
  return { ok: true, port };
}

function normalizeForwardId(id, fallbackId, fields) {
  if (typeof id === "number" && Number.isFinite(id)) return id;
  const value = String(id ?? "").trim();
  if (value) return value;
  if (fallbackId != null && String(fallbackId).trim()) return String(fallbackId).trim();
  return [
    "forward",
    String(fields.type || "L").toLowerCase(),
    String(fields.lport || "port"),
    String(fields.rhost || "target").replace(/[^a-zA-Z0-9._-]+/g, "-") || "target",
    String(fields.rport || "port"),
  ].join("-");
}
