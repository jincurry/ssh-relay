import { isSensitiveShellText } from "./sensitiveShellText.js";

export async function resolveSshAuth(host, { passwordProvider, passphraseProvider, totpProvider, proxyPasswordProvider, knownHosts = [] } = {}) {
  if (!host?.host) throw new Error("SSH 主机地址不能为空");
  if (!host?.user) throw new Error("SSH 登录用户不能为空");

  const privateKeyPath = normalizeIdentityFile(host.identityFile || host.privateKeyPath);
  const jumpHosts = selectJumpHostsForHost(host, knownHosts);
  const req = {
    host: host.host,
    port: Number(host.port) || 22,
    user: host.user,
    privateKeyPath,
    privateKeyPassphrase: null,
    password: null,
    totpCode: await totpProvider?.(host) || null,
    proxy: await normalizeProxyForAuth(host.proxy, { proxyPasswordProvider }),
    jumpHosts: await normalizeJumpHosts(jumpHosts, { passwordProvider, passphraseProvider, totpProvider, proxyPasswordProvider }),
    strictHostKey: host.strictHostKey ?? true,
    trustUnknownHostKey: host.trustUnknownHostKey ?? false,
    connectTimeoutMs: normalizeConnectTimeoutMs(host.connectTimeoutMs),
    serverAliveIntervalMs: normalizeServerAliveIntervalMs(host.serverAliveIntervalMs),
    serverAliveCountMax: normalizeServerAliveCountMax(host.serverAliveCountMax),
  };

  if (privateKeyPath) {
    const passphrase = await passphraseProvider?.(host);
    if (passphrase) req.privateKeyPassphrase = passphrase;
    return req;
  }

  const password = await passwordProvider?.(host);
  if (!password) throw new Error("需要提供 SSH 密码或配置 IdentityFile 私钥");
  req.password = password;
  return req;
}

export function normalizeIdentityFile(identityFile) {
  if (!identityFile) return null;
  const first = Array.isArray(identityFile) ? identityFile[0] : identityFile;
  const value = String(first || "").trim();
  return value || null;
}

export function normalizeConnectTimeoutMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(30_000, Math.max(100, Math.round(number)));
}

export function normalizeServerAliveIntervalMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(600_000, Math.max(1_000, Math.round(number)));
}

export function normalizeServerAliveCountMax(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(20, Math.round(number));
}

export function normalizeJumpHostProfile(jump = {}, { label = "", fallbackUser = "" } = {}) {
  const name = clean(jump.name) || clean(label) || clean(jump.host);
  const host = normalizeHostAddressInput(clean(jump.host) || name);
  const user = clean(jump.user) || clean(fallbackUser);
  if (!host || !user) return null;

  const identityFile = normalizeIdentityFile(jump.identityFile || jump.privateKeyPath) || undefined;
  const totpProfileId = clean(jump.totpProfileId) || undefined;
  const proxy = jump.proxy ? normalizeProxyProfile(jump.proxy) : undefined;
  const profile = {
    name,
    host,
    user,
    port: normalizeSshPort(jump.port, "22"),
  };

  if (identityFile) profile.identityFile = identityFile;
  if (totpProfileId) profile.totpProfileId = totpProfileId;
  if (proxy) profile.proxy = proxy;
  if (typeof jump.strictHostKey === "boolean") profile.strictHostKey = jump.strictHostKey;
  if (typeof jump.trustUnknownHostKey === "boolean") profile.trustUnknownHostKey = jump.trustUnknownHostKey;
  const connectTimeoutMs = normalizeConnectTimeoutMs(jump.connectTimeoutMs);
  if (connectTimeoutMs) profile.connectTimeoutMs = connectTimeoutMs;
  const serverAliveIntervalMs = normalizeServerAliveIntervalMs(jump.serverAliveIntervalMs);
  if (serverAliveIntervalMs) profile.serverAliveIntervalMs = serverAliveIntervalMs;
  const serverAliveCountMax = normalizeServerAliveCountMax(jump.serverAliveCountMax);
  if (serverAliveCountMax !== null) profile.serverAliveCountMax = serverAliveCountMax;

  return profile;
}

function normalizeHostAddressInput(host) {
  const text = String(host || "").trim();
  const bracketed = text.match(/^\[([^\]]+)\]$/);
  if (!bracketed) return text;
  const inner = bracketed[1].trim();
  return inner.includes(":") ? inner : text;
}

export function normalizeProxy(proxy) {
  const profile = normalizeProxyProfile(proxy);
  if (!profile || profile.type === "none") return null;
  const kind = profile.type;
  if (kind === "socks5" || kind === "http") {
    return {
      kind,
      host: profile.host,
      port: Number(profile.port),
      username: profile.username || null,
      password: null,
      cmd: null,
    };
  }
  if (kind === "cmd") {
    return {
      kind,
      host: null,
      port: null,
      username: null,
      password: null,
      cmd: profile.cmd,
    };
  }
  return null;
}

export function normalizeProxyProfile(proxy) {
  const type = String(proxy?.kind || proxy?.type || "none").trim().toLowerCase();
  if (type === "socks5" || type === "http") {
    return {
      type,
      host: normalizeHostAddressInput(proxy?.host || "127.0.0.1") || "127.0.0.1",
      port: normalizeProxyPort(proxy?.port, type === "http" ? "8080" : "1080"),
      auth: Boolean(proxy?.auth),
      username: String(proxy?.username || "").trim() || undefined,
      cmd: "connect -S %h:%p",
    };
  }

  if (type === "cmd") {
    const cmd = String(proxy?.cmd || "").trim();
    if (isSensitiveShellText(cmd)) {
      return {
        type: "none",
        host: "127.0.0.1",
        port: "1080",
        auth: false,
        username: undefined,
        cmd: "connect -S %h:%p",
      };
    }
    return {
      type: "cmd",
      host: "127.0.0.1",
      port: "1080",
      auth: false,
      username: undefined,
      cmd: cmd || "connect -S %h:%p",
    };
  }

  return {
    type: "none",
    host: "127.0.0.1",
    port: "1080",
    auth: false,
    username: undefined,
    cmd: "connect -S %h:%p",
  };
}

const PROXY_MODE_OPTIONS = [
  { type: "none", label: "直连", description: "不经过代理" },
  { type: "socks5", label: "SOCKS5", description: "适合科学出口 / 内网穿透" },
  { type: "http", label: "HTTP CONNECT", description: "企业网关常见" },
  { type: "cmd", label: "ProxyCommand", description: "完全自定义命令" },
];

export function buildProxyModeOptions(proxy = {}) {
  const currentType = normalizeProxyProfile(proxy).type;
  return PROXY_MODE_OPTIONS.map(option => {
    const selected = option.type === currentType;
    return {
      ...option,
      selected,
      colorKey: selected ? "blue" : "text",
      borderKey: selected ? "blue" : "line",
      backgroundKey: selected ? "blueSoft" : "panelHi",
    };
  });
}

export function buildProxyFieldDisplay(proxy = {}) {
  const profile = normalizeProxyProfile(proxy);
  const networkProxy = profile.type === "socks5" || profile.type === "http";
  return {
    type: profile.type,
    showEndpointFields: networkProxy,
    showAuthFields: networkProxy && profile.auth,
    showCommandField: profile.type === "cmd",
    hostLabel: "代理地址",
    portLabel: "端口",
    authLabel: "需要用户名密码认证",
    usernameLabel: "代理用户名",
    passwordLabel: "代理密码",
    passwordPlaceholder: "留空则连接时询问",
    commandLabel: "自定义命令(%h %p 为目标占位符)",
  };
}

export async function normalizeProxyForAuth(proxy, { proxyPasswordProvider } = {}) {
  const normalized = normalizeProxy(proxy);
  if (!normalized || (normalized.kind !== "socks5" && normalized.kind !== "http")) return normalized;
  if (!proxy?.auth) return normalized;

  normalized.username = String(proxy.username || "").trim() || null;
  normalized.password = proxy.password || await proxyPasswordProvider?.(proxy) || null;
  return normalized;
}

export async function normalizeJumpHosts(jumpHosts, { passwordProvider, passphraseProvider, totpProvider, proxyPasswordProvider } = {}) {
  if (!Array.isArray(jumpHosts) || jumpHosts.length === 0) return null;

  const normalized = [];
  for (const jump of jumpHosts) {
    const profile = normalizeJumpHostProfile(jump);
    if (!profile) continue;
    const privateKeyPath = profile.identityFile || null;
    const item = {
      host: profile.host,
      port: Number(profile.port) || 22,
      user: profile.user,
      password: null,
      privateKeyPath,
      privateKeyPassphrase: null,
      totpCode: jump.totpCode || await totpProvider?.(jump) || null,
      proxy: await normalizeProxyForAuth(jump.proxy || profile.proxy, { proxyPasswordProvider }),
      strictHostKey: profile.strictHostKey ?? true,
      trustUnknownHostKey: profile.trustUnknownHostKey ?? false,
      connectTimeoutMs: profile.connectTimeoutMs || null,
      serverAliveIntervalMs: profile.serverAliveIntervalMs || null,
      serverAliveCountMax: profile.serverAliveCountMax ?? null,
    };

    if (privateKeyPath) {
      const passphrase = jump.privateKeyPassphrase || await passphraseProvider?.(jump);
      if (passphrase) item.privateKeyPassphrase = passphrase;
    } else {
      item.password = jump.password || await passwordProvider?.(jump) || null;
    }

    normalized.push(item);
  }

  return normalized.length ? normalized : null;
}

export function selectJumpHostsForHost(host, knownHosts = []) {
  if (!Array.isArray(host?.chain)) {
    return Array.isArray(host?.jumpHosts) && host.jumpHosts.length ? host.jumpHosts : null;
  }

  if (host.chain.length === 0) return null;

  if (Array.isArray(host.jumpHosts) && jumpHostsMatchChain(host.jumpHosts, host.chain)) {
    return host.jumpHosts;
  }

  return resolveChainJumpHosts(host, knownHosts);
}

export function resolveChainJumpHosts(host, knownHosts = []) {
  if (!Array.isArray(host?.chain) || host.chain.length === 0) return null;
  const candidates = Array.isArray(knownHosts) ? knownHosts : [];

  return host.chain.map((label) => {
    const key = String(label || "").trim();
    const match = candidates.find(candidate => {
      const values = [candidate?.id, candidate?.name, candidate?.host].map(value => String(value || "").trim());
      return values.includes(key);
    });

    return {
      name: match?.name || key,
      host: match?.host || key,
      port: match?.port || 22,
      user: match?.user || host.user,
      identityFile: match?.identityFile,
      privateKeyPath: match?.privateKeyPath,
      privateKeyPassphrase: match?.privateKeyPassphrase,
      password: match?.password,
      totpProfileId: match?.totpProfileId,
      totpCode: match?.totpCode,
      proxy: match?.proxy,
      strictHostKey: match?.strictHostKey,
      trustUnknownHostKey: match?.trustUnknownHostKey,
      connectTimeoutMs: match?.connectTimeoutMs,
      serverAliveIntervalMs: match?.serverAliveIntervalMs,
      serverAliveCountMax: match?.serverAliveCountMax,
    };
  }).filter(jump => jump.host);
}

export function jumpHostsMatchChain(jumpHosts, chain) {
  if (!Array.isArray(jumpHosts) || !Array.isArray(chain)) return false;
  if (jumpHosts.length !== chain.length) return false;
  return jumpHosts.every((jump, index) => {
    const label = String(jump?.name || jump?.host || "").trim();
    return label === String(chain[index] || "").trim();
  });
}

function normalizeProxyPort(port, fallback) {
  const value = String(port || "").trim();
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number <= 0 || number > 65535) return fallback;
  return String(number);
}

function normalizeSshPort(port, fallback) {
  const value = String(port || "").trim();
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number <= 0 || number > 65535) return fallback;
  return String(number);
}

function clean(value) {
  return String(value ?? "").trim();
}
