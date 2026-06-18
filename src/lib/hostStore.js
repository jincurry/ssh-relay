import { normalizeForwardRule } from "./forwardRules.js";
import { normalizeHostTags } from "./hostTags.js";
import { jumpHostsMatchChain, normalizeConnectTimeoutMs, normalizeIdentityFile, normalizeJumpHostProfile, normalizeProxyProfile, normalizeServerAliveCountMax, normalizeServerAliveIntervalMs } from "./sessionAuth.js";

export const HOSTS_STORAGE_KEY = "relay.hosts.v1";
const DEFAULT_HOST_GROUP = "手动添加";
const VALID_HOST_STATUSES = new Set(["online", "busy", "offline"]);
const LATENCY_HISTORY_LIMIT = 8;

export function loadHosts(storage, fallback = []) {
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(HOSTS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(isHostLike).map(sanitizeHost).filter(hasRequiredHostProfile);
  } catch {
    return fallback;
  }
}

export function saveHosts(storage, hosts) {
  if (!storage) return false;
  storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify(hosts.map(sanitizeHost).filter(hasRequiredHostProfile)));
  return true;
}

export function updateHostConfig(hosts, hostId, config) {
  return hosts.map(host => {
    if (host.id !== hostId) return host;
    const chain = Array.isArray(config.chain) ? config.chain.slice() : host.chain;
    const hasJumpHosts = Object.prototype.hasOwnProperty.call(config, "jumpHosts");
    return sanitizeHost({
      ...host,
      chain,
      proxy: sanitizeProxy(config.proxy),
      forwards: Array.isArray(config.forwards) ? config.forwards.map(sanitizeForward) : host.forwards,
      jumpHosts: hasJumpHosts ? config.jumpHosts : preserveMatchingJumpHosts(host.jumpHosts, chain),
      updatedAt: new Date().toISOString(),
    });
  });
}

export function addHost(hosts, input) {
  const profile = normalizeHostInput(input);

  const key = hostKey(profile);
  if (hosts.some(existing => hostKey(existing) === key)) {
    throw new Error("主机配置已存在");
  }

  const maxId = hosts.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  return [
    ...hosts,
    sanitizeHost({
      id: maxId + 1,
      ...profile,
      status: "online",
      lat: [],
      chain: [],
      fav: false,
    }),
  ];
}

export function updateHostProfile(hosts, hostId, input) {
  const profile = normalizeHostInput(input);
  const key = hostKey(profile);
  if (hosts.some(existing => existing.id !== hostId && hostKey(existing) === key)) {
    throw new Error("主机配置已存在");
  }

  return hosts.map(host => {
    if (host.id !== hostId) return host;
    return sanitizeHost({
      ...host,
      ...profile,
      updatedAt: new Date().toISOString(),
    });
  });
}

export function toggleHostFavorite(hosts, hostId) {
  return hosts.map(host => host.id === hostId ? sanitizeHost({ ...host, fav: !host.fav }) : host);
}

export function removeHost(hosts, hostId) {
  return hosts.filter(host => host.id !== hostId);
}

export function buildHostDeleteConfirmation(host) {
  const name = String(host?.name || "").trim() || "未命名主机";
  const target = formatHostDeleteTarget(host);
  const chainCount = Array.isArray(host?.chain) ? host.chain.filter(Boolean).length : 0;
  const forwardCount = Array.isArray(host?.forwards) ? host.forwards.length : 0;
  const lines = [`删除主机 ${name}?`];
  if (target) lines.push("", target);
  if (chainCount || forwardCount) {
    const details = [];
    if (chainCount) details.push(`${chainCount} 个跳板节点`);
    if (forwardCount) details.push(`${forwardCount} 条端口转发规则`);
    lines.push("", `删除后会同时移除该主机保存的 ${details.join("和 ")}配置。`);
  }
  return lines.join("\n");
}

function isHostLike(host) {
  return host && host.id != null && typeof host.name === "string" && typeof host.host === "string" && typeof host.user === "string";
}

function hasRequiredHostProfile(host) {
  return Boolean(host.name && host.host && host.user);
}

function sanitizeHost(host) {
  const identityFile = normalizeIdentityFile(host.identityFile || host.privateKeyPath) || undefined;
  const connectTimeoutMs = normalizeConnectTimeoutMs(host.connectTimeoutMs) || undefined;
  const serverAliveIntervalMs = normalizeServerAliveIntervalMs(host.serverAliveIntervalMs) || undefined;
  const serverAliveCountMax = normalizeServerAliveCountMax(host.serverAliveCountMax);
  const port = normalizeHostPort(host.port, 22);
  const status = VALID_HOST_STATUSES.has(host.status) ? host.status : "online";
  return {
    id: host.id,
    name: String(host.name || "").trim(),
    host: normalizeHostAddressInput(host.host),
    user: String(host.user || "").trim(),
    port,
    group: String(host.group || DEFAULT_HOST_GROUP).trim() || DEFAULT_HOST_GROUP,
    status,
    fav: Boolean(host.fav),
    updatedAt: host.updatedAt,
    identityFile,
    chain: normalizeStringList(host.chain),
    tags: parseTags(host.tags),
    lat: normalizeLatencyHistory(host.lat),
    proxy: sanitizeProxy(host.proxy),
    forwards: Array.isArray(host.forwards) ? host.forwards.map(sanitizeForward) : undefined,
    jumpHosts: normalizeJumpHostList(host.jumpHosts),
    strictHostKey: typeof host.strictHostKey === "boolean" ? host.strictHostKey : undefined,
    trustUnknownHostKey: typeof host.trustUnknownHostKey === "boolean" ? host.trustUnknownHostKey : undefined,
    connectTimeoutMs,
    serverAliveIntervalMs,
    serverAliveCountMax: serverAliveCountMax ?? undefined,
  };
}

function sanitizeJumpHost(jump) {
  return normalizeJumpHostProfile({
    ...jump,
    proxy: sanitizeProxy(jump?.proxy),
  });
}

function normalizeJumpHostList(jumpHosts) {
  if (!Array.isArray(jumpHosts)) return undefined;
  const normalized = jumpHosts.map(sanitizeJumpHost).filter(Boolean);
  return normalized.length ? normalized : undefined;
}

function preserveMatchingJumpHosts(jumpHosts, chain) {
  if (!Array.isArray(chain) || chain.length === 0) return undefined;
  if (!Array.isArray(jumpHosts) || !jumpHosts.length) return undefined;
  return jumpHostsMatchChain(jumpHosts, chain) ? jumpHosts : undefined;
}

function sanitizeProxy(proxy) {
  if (!proxy) return undefined;
  return normalizeProxyProfile(proxy);
}

function sanitizeForward(forward, index = 0) {
  return normalizeForwardRule(forward, { fallbackId: `forward-${index + 1}` });
}

function parseTags(tags) {
  return normalizeHostTags(tags);
}

function normalizeStringList(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => String(item || "").trim()).filter(Boolean);
}

function normalizeLatencyHistory(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value >= 0)
    .slice(-LATENCY_HISTORY_LIMIT);
}

function normalizeHostPort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return fallback;
  return port;
}

function formatHostDeleteTarget(host) {
  const user = String(host?.user || "").trim();
  const rawHost = String(host?.host || "").trim();
  if (!rawHost && !user) return "";
  const port = normalizeHostPort(host?.port, 22);
  const address = rawHost.includes(":") && !rawHost.startsWith("[") ? `[${rawHost}]` : rawHost;
  const target = `${user ? `${user}@` : ""}${address}`;
  return port !== 22 ? `${target}:${port}` : target;
}

function hostKey(host) {
  return [
    String(host.name || "").trim().toLowerCase(),
    String(host.user || "").trim().toLowerCase(),
    normalizeHostAddressInput(host.host).toLowerCase(),
    String(Number(host.port) || 22),
  ].join("|");
}

function normalizeHostInput(input) {
  const name = String(input.name || "").trim();
  const host = normalizeHostAddressInput(input.host);
  const user = String(input.user || "").trim();
  const group = String(input.group || DEFAULT_HOST_GROUP).trim() || DEFAULT_HOST_GROUP;
  const port = Number(input.port || 22);
  const tags = parseTags(input.tags);
  const identityFile = normalizeIdentityFile(input.identityFile) || undefined;
  const connectTimeoutMs = normalizeConnectTimeoutMs(input.connectTimeoutMs) || undefined;
  const serverAliveIntervalMs = normalizeServerAliveIntervalMs(input.serverAliveIntervalMs) || undefined;
  const serverAliveCountMax = normalizeServerAliveCountMax(input.serverAliveCountMax);

  if (!name) throw new Error("主机名称不能为空");
  if (!host) throw new Error("主机地址不能为空");
  if (!user) throw new Error("登录用户不能为空");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("端口必须是 1-65535 之间的整数");

  const profile = { name, host, user, port, group, tags, identityFile };
  if (connectTimeoutMs) profile.connectTimeoutMs = connectTimeoutMs;
  if (serverAliveIntervalMs) profile.serverAliveIntervalMs = serverAliveIntervalMs;
  if (serverAliveCountMax !== null) profile.serverAliveCountMax = serverAliveCountMax;
  if (typeof input.strictHostKey === "boolean") profile.strictHostKey = input.strictHostKey;
  if (typeof input.trustUnknownHostKey === "boolean") profile.trustUnknownHostKey = input.trustUnknownHostKey;
  return profile;
}

function normalizeHostAddressInput(host) {
  const text = String(host || "").trim();
  const bracketed = text.match(/^\[([^\]]+)\]$/);
  if (!bracketed) return text;
  const inner = bracketed[1].trim();
  return inner.includes(":") ? inner : text;
}
