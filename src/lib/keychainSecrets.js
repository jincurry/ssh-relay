import { normalizeIdentityFile, normalizeProxyProfile, selectJumpHostsForHost } from "./sessionAuth.js";

export function buildManageableKeychainSecrets(hosts, knownHosts = hosts) {
  const secrets = [];
  const candidates = Array.isArray(hosts) ? hosts : [];

  for (const host of candidates) {
    collectHostAuthSecret(secrets, host, { scope: "target", owner: host });
    collectProxySecret(secrets, host?.proxy, { owner: host, scope: "target-proxy" });

    const jumpHosts = selectJumpHostsForHost(host, knownHosts) || [];
    for (const jump of jumpHosts) {
      collectHostAuthSecret(secrets, jump, { scope: "jump", owner: host });
      collectProxySecret(secrets, jump?.proxy, { owner: host, scope: "jump-proxy" });
    }
  }

  return dedupeSecrets(secrets);
}

export function buildProxyKeychainSecretTarget(proxy) {
  const profile = normalizeProxyProfile(proxy);
  const type = profile?.type;
  if ((type !== "socks5" && type !== "http") || !profile.auth) return null;
  const host = String(profile.host || "").trim();
  const user = String(profile.username || "").trim();
  if (!host || !user) return null;
  const port = Number(profile.port) || (type === "http" ? 8080 : 1080);
  const displayHost = formatSecretHost(host);
  return {
    name: `${type.toUpperCase()} ${displayHost}:${port}`,
    host,
    port,
    user,
  };
}

export function buildKeychainSecretDeleteConfirmation(secret) {
  const label = String(secret?.label || "").trim() || "未命名条目";
  const kind = String(secret?.kindLabel || "").trim() || "钥匙串口令";
  const owner = String(secret?.ownerName || "").trim();
  const request = secret?.request || {};
  const target = formatSecretTarget(request);
  const privateKeyPath = normalizeIdentityFile(request.privateKeyPath);
  const lines = [`清除 ${formatPossessiveKind(label, kind)}?`];
  if (owner && owner !== label) lines.push("", `所属主机: ${owner}`);
  if (target) lines.push("", target);
  if (privateKeyPath) lines.push("", `IdentityFile: ${privateKeyPath}`);
  lines.push("", "只会删除系统钥匙串中的口令内容,不会删除 RELAY 主机、跳板或代理配置。");
  return lines.join("\n");
}

export function buildKeychainSecretSaveConfirmation(target, kind) {
  const privateKeyPath = normalizeIdentityFile(target?.identityFile || target?.privateKeyPath);
  const request = {
    host: String(target?.host || "").trim(),
    port: Number(target?.port) || 22,
    user: String(target?.user || "").trim(),
    kind,
    privateKeyPath,
  };
  const label = String(target?.name || target?.host || "").trim() || formatSecretTarget(request) || "此连接";
  const kindLabel = keychainSecretKindLabel(kind);
  const targetLabel = formatSecretTarget(request);
  const lines = [`将 ${formatPossessiveKind(label, kindLabel)}保存到系统钥匙串?`];
  if (targetLabel) lines.push("", targetLabel);
  if (privateKeyPath) lines.push("", `IdentityFile: ${privateKeyPath}`);
  lines.push(
    "",
    "保存后 RELAY 会在终端、SFTP、端口转发和跳板认证中按需读取该口令。",
    "配置导出不会包含这个口令。",
  );
  return lines.join("\n");
}

export function buildKeychainSecretPromptLabel(target, kind) {
  const privateKeyPath = normalizeIdentityFile(target?.identityFile || target?.privateKeyPath);
  const request = {
    host: String(target?.host || "").trim(),
    port: Number(target?.port) || 22,
    user: String(target?.user || "").trim(),
    kind,
    privateKeyPath,
  };
  const label = String(target?.name || target?.host || "").trim() || formatSecretTarget(request) || "此连接";
  const kindLabel = keychainSecretKindLabel(kind);
  const lines = [`输入 ${formatPossessiveKind(label, kindLabel)}${kind === "privateKeyPassphrase" ? "(可留空)" : ""}`];
  const targetLabel = formatSecretTarget(request);
  if (targetLabel) lines.push("", targetLabel);
  if (privateKeyPath) lines.push("", `IdentityFile: ${privateKeyPath}`);
  return lines.join("\n");
}

export function buildKeychainSecretSaveErrorMessage(target, kind, error) {
  const privateKeyPath = normalizeIdentityFile(target?.identityFile || target?.privateKeyPath);
  const request = {
    host: String(target?.host || "").trim(),
    port: Number(target?.port) || 22,
    user: String(target?.user || "").trim(),
    kind,
    privateKeyPath,
  };
  const label = String(target?.name || target?.host || "").trim() || formatSecretTarget(request) || "此连接";
  const kindLabel = keychainSecretKindLabel(kind);
  const targetLabel = formatSecretTarget(request);
  const detail = String(error?.message || error || "未知错误").trim() || "未知错误";
  const lines = [`${formatPossessiveKind(label, kindLabel)}保存到系统钥匙串失败。`];
  if (targetLabel) lines.push("", targetLabel);
  if (privateKeyPath) lines.push("", `IdentityFile: ${privateKeyPath}`);
  lines.push("", detail);
  return lines.join("\n");
}

export function buildKeychainVaultDisplay({ desktop = true } = {}) {
  return {
    sectionTitle: "钥匙串口令",
    sectionSubtitle: "按当前主机、跳板和代理配置推导可清理的系统钥匙串条目;不会显示口令内容。",
    defaultMessage: desktop ? "可清除已保存的 SSH 密码、私钥口令和代理密码" : "系统钥匙串仅在桌面端可用",
    emptyText: "当前主机配置没有可推导的钥匙串口令条目。",
    clearText: "清除",
    clearingText: "清除中",
  };
}

export function buildKeychainSecretRowDisplay(secret = {}, { clearing = false } = {}) {
  const request = secret?.request || {};
  const privateKeyPath = normalizeIdentityFile(request.privateKeyPath);
  return {
    label: String(secret?.label || "").trim() || "未命名条目",
    kindLabel: String(secret?.kindLabel || "").trim() || "钥匙串口令",
    ownerName: String(secret?.ownerName || "").trim() || "当前配置",
    target: formatSecretTarget(request),
    privateKeyPath,
    clearText: clearing ? "清除中" : "清除",
  };
}

function collectHostAuthSecret(out, target, { scope, owner } = {}) {
  if (!target?.host || !target?.user) return;
  const privateKeyPath = normalizeIdentityFile(target.identityFile || target.privateKeyPath);
  const request = {
    host: String(target.host).trim(),
    port: Number(target.port) || 22,
    user: String(target.user).trim(),
    kind: privateKeyPath ? "privateKeyPassphrase" : "password",
    privateKeyPath,
  };

  out.push({
    id: secretRequestKey(request),
    scope,
    label: target.name || target.host,
    ownerName: owner?.name || "",
    kindLabel: privateKeyPath ? "私钥口令" : "SSH 密码",
    request,
  });
}

function collectProxySecret(out, proxy, { owner, scope } = {}) {
  const target = buildProxyKeychainSecretTarget(proxy);
  if (!target) return;

  const request = {
    host: target.host,
    port: target.port,
    user: target.user,
    kind: "proxyPassword",
    privateKeyPath: null,
  };

  out.push({
    id: secretRequestKey(request),
    scope,
    label: target.name,
    ownerName: owner?.name || "",
    kindLabel: "代理密码",
    request,
  });
}

function dedupeSecrets(secrets) {
  const seen = new Set();
  const out = [];
  for (const secret of secrets) {
    if (seen.has(secret.id)) continue;
    seen.add(secret.id);
    out.push(secret);
  }
  return out;
}

function secretRequestKey(request) {
  return [
    request.kind,
    String(request.user || "").trim(),
    String(request.host || "").trim().toLowerCase(),
    Number(request.port) || 22,
    String(request.privateKeyPath || "").trim(),
  ].join("|");
}

function keychainSecretKindLabel(kind) {
  if (kind === "privateKeyPassphrase") return "私钥口令";
  if (kind === "proxyPassword") return "代理密码";
  if (kind === "password") return "SSH 密码";
  return "钥匙串口令";
}

function formatPossessiveKind(label, kind) {
  const separator = /^[A-Za-z0-9]/.test(kind) ? " 的 " : " 的";
  return `${label}${separator}${kind}`;
}

function formatSecretTarget(request) {
  const user = String(request?.user || "").trim();
  const host = String(request?.host || "").trim();
  if (!user && !host) return "";
  const port = Number(request?.port) || 22;
  const address = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${user ? `${user}@` : ""}${address}:${port}`;
}

function formatSecretHost(host) {
  const text = String(host || "").trim();
  return text.includes(":") && !text.startsWith("[") ? `[${text}]` : text;
}
