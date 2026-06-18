import { normalizeForwardRule, validateForwardRule } from "./forwardRules.js";
import { formatUserHostPort } from "./hosts.js";
import { normalizeJumpHostProfile, normalizeProxyProfile } from "./sessionAuth.js";

export function buildSshCommand({ host, chain = [], jumpHosts = host?.jumpHosts, proxy = { type: "none" }, forwards = [] }) {
  const parts = ["ssh"];
  const notes = [];
  const proxyProfile = normalizeProxyProfile(proxy);
  const proxyCommand = formatProxyCommand(proxyProfile);

  const jumpRoute = resolveJumpRoute(jumpHosts, chain, { fallbackUser: host.user });
  if (proxyUsesRelayManagedPassword(proxyProfile) || jumpRouteUsesRelayManagedProxyPassword(jumpRoute)) {
    notes.push("# RELAY 代理认证使用系统钥匙串;复制的 OpenSSH 命令不会包含代理密码。");
  }
  if (jumpRoute.type === "structured" && shouldExpandJumpRoute(jumpRoute.jumpHosts, proxyCommand)) {
    parts.push(`-o ${quoteSshArg(`ProxyCommand=${buildJumpProxyCommand(jumpRoute.jumpHosts, { baseProxyCommand: proxyCommand })}`)}`);
  } else {
    if (proxyCommand) {
      parts.push(`-o ${quoteSshArg(`ProxyCommand=${proxyCommand}`)}`);
    }
    const jumpChain = jumpRoute.chain || "";
    if (jumpChain) {
      parts.push(`-J ${quoteSshArg(jumpChain)}`);
    }
  }

  const identityFile = normalizeIdentityFileArg(host.identityFile || host.privateKeyPath);
  if (identityFile) {
    parts.push(`-i ${quoteSshArg(identityFile)}`);
  }

  const hostKeyOption = formatStrictHostKeyCheckingOption(host);
  if (hostKeyOption) {
    parts.push(`-o ${quoteSshArg(hostKeyOption)}`);
  }

  const connectTimeoutOption = formatConnectTimeoutOption(host);
  if (connectTimeoutOption) {
    parts.push(`-o ${quoteSshArg(connectTimeoutOption)}`);
  }
  const serverAliveOptions = formatServerAliveOptions(host);
  serverAliveOptions.forEach(option => parts.push(`-o ${quoteSshArg(option)}`));

  normalizeForwardRulesForCommand(forwards).forEach((f) => {
    if (f.type === "L") parts.push(`-L ${quoteSshArg(`${f.lport}:${formatForwardHost(f.rhost)}:${f.rport}`)}`);
    if (f.type === "R") parts.push(`-R ${quoteSshArg(`${f.rport}:${formatForwardHost(f.rhost || "127.0.0.1")}:${f.lport}`)}`);
    if (f.type === "D") parts.push(`-D ${quoteSshArg(f.lport)}`);
  });

  if (host.port && Number(host.port) !== 22) {
    parts.push(`-p ${quoteSshArg(host.port)}`);
  }

  parts.push(quoteSshArg(formatUserHostPort({ user: host.user, host: host.host })));
  const command = parts.join(" \\\n    ");
  return notes.length ? `${[...new Set(notes)].join("\n")}\n${command}` : command;
}

export function quoteSshArg(value) {
  const text = String(value ?? "");
  if (!text) return "''";
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

export function buildSshCommandStatusMessage(text, tone = "success") {
  const message = String(text || "").trim();
  return {
    text: message,
    tone: tone === "error" ? "error" : "success",
  };
}

export function buildSshCommandPreviewDisplay(command, status = {}) {
  const commandText = String(command || "").trim();
  const statusMessage = buildSshCommandStatusMessage(status?.text || "", status?.tone);
  const warningCount = commandText
    .split(/\r?\n/)
    .filter(line => line.trim().startsWith("#"))
    .length;

  return {
    commandText: commandText || "# 无法生成 SSH 命令",
    copyText: commandText,
    copyButtonLabel: "⧉ 复制命令",
    copyButtonTitle: commandText ? "复制等效 OpenSSH 命令" : "没有可复制的 SSH 命令",
    copyDisabled: !commandText,
    statusText: statusMessage.text,
    statusTone: statusMessage.tone,
    statusVisible: Boolean(statusMessage.text),
    hasWarnings: warningCount > 0,
    warningCount,
  };
}

function formatJumpChain(jumpHosts, chain, { fallbackUser = "" } = {}) {
  const route = resolveJumpRoute(jumpHosts, chain, { fallbackUser });
  return route.chain || "";
}

function resolveJumpRoute(jumpHosts, chain, { fallbackUser = "" } = {}) {
  if (Array.isArray(jumpHosts) && jumpHosts.length) {
    if (Array.isArray(chain) && chain.length && !jumpHostsMatchChain(jumpHosts, chain)) {
      return { type: "labels", chain: chain.join(",") };
    }
    const normalized = jumpHosts.map(jump => normalizeJumpHostProfile(jump, { fallbackUser }));
    if (normalized.every(Boolean)) {
      return { type: "structured", jumpHosts: normalized, chain: normalized.map(formatJumpHost).join(",") };
    }
    if (Array.isArray(chain) && chain.length) return { type: "labels", chain: chain.join(",") };
  }
  return Array.isArray(chain) && chain.length ? { type: "labels", chain: chain.join(",") } : { type: "none", chain: "" };
}

function jumpHostsMatchChain(jumpHosts, chain) {
  if (jumpHosts.length !== chain.length) return false;
  return jumpHosts.every((jump, index) => {
    const label = String(jump?.name || jump?.host || "").trim();
    return label === String(chain[index] || "").trim();
  });
}

function formatJumpHost(jump) {
  const profile = normalizeJumpHostProfile(jump) || jump;
  const host = String(profile?.host || profile?.name || "").trim();
  if (!host) return "";
  const user = String(profile?.user || "").trim();
  const port = Number(profile?.port) || 22;
  const target = `${user ? `${user}@` : ""}${formatJumpHostAddress(host)}`;
  return port !== 22 ? `${target}:${port}` : target;
}

function formatJumpHostAddress(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function shouldExpandJumpRoute(jumpHosts, proxyCommand = "") {
  return Boolean(proxyCommand) || jumpHosts.some(jumpHostNeedsExpandedProxy);
}

function jumpHostNeedsExpandedProxy(jump) {
  return Boolean(
    normalizeIdentityFileArg(jump.identityFile || jump.privateKeyPath)
      || formatStrictHostKeyCheckingOption(jump)
      || formatConnectTimeoutOption(jump)
      || formatServerAliveOptions(jump).length
      || formatProxyCommand(normalizeProxyProfile(jump.proxy))
  );
}

function buildJumpProxyCommand(jumpHosts, { baseProxyCommand = "" } = {}) {
  return buildJumpProxyCommandAt(jumpHosts, jumpHosts.length - 1, { baseProxyCommand });
}

function buildJumpProxyCommandAt(jumpHosts, index, { baseProxyCommand = "" } = {}) {
  const jump = jumpHosts[index];
  const parts = ["ssh"];
  const previousProxyCommand = index > 0
    ? buildJumpProxyCommandAt(jumpHosts, index - 1, { baseProxyCommand })
    : formatProxyCommand(normalizeProxyProfile(jump.proxy)) || baseProxyCommand;

  if (previousProxyCommand) {
    parts.push("-o", quoteSshArg(`ProxyCommand=${escapeNestedProxyCommandPlaceholders(previousProxyCommand)}`));
  }

  const identityFile = normalizeIdentityFileArg(jump.identityFile || jump.privateKeyPath);
  if (identityFile) {
    parts.push("-i", quoteSshArg(identityFile));
  }

  const hostKeyOption = formatStrictHostKeyCheckingOption(jump);
  if (hostKeyOption) {
    parts.push("-o", quoteSshArg(hostKeyOption));
  }

  const connectTimeoutOption = formatConnectTimeoutOption(jump);
  if (connectTimeoutOption) {
    parts.push("-o", quoteSshArg(connectTimeoutOption));
  }

  formatServerAliveOptions(jump).forEach(option => parts.push("-o", quoteSshArg(option)));

  if (jump.port && Number(jump.port) !== 22) {
    parts.push("-p", quoteSshArg(jump.port));
  }

  parts.push("-W", "%h:%p", quoteSshArg(formatUserHostPort({ user: jump.user, host: jump.host })));
  return parts.join(" ");
}

function formatProxyCommand(proxyProfile) {
  if (proxyProfile.type === "socks5") {
    return `nc -X 5 -x ${formatProxyHost(proxyProfile.host)}:${proxyProfile.port} %h %p`;
  }
  if (proxyProfile.type === "http") {
    return `nc -X connect -x ${formatProxyHost(proxyProfile.host)}:${proxyProfile.port} %h %p`;
  }
  if (proxyProfile.type === "cmd") {
    return proxyProfile.cmd || "";
  }
  return "";
}

function proxyUsesRelayManagedPassword(proxyProfile) {
  return Boolean((proxyProfile.type === "socks5" || proxyProfile.type === "http") && proxyProfile.auth);
}

function jumpRouteUsesRelayManagedProxyPassword(jumpRoute) {
  if (jumpRoute?.type !== "structured") return false;
  return jumpRoute.jumpHosts.some(jump => proxyUsesRelayManagedPassword(normalizeProxyProfile(jump.proxy)));
}

function formatProxyHost(host) {
  const text = String(host || "").trim();
  return text.includes(":") && !text.startsWith("[") ? `[${text}]` : text;
}

function escapeNestedProxyCommandPlaceholders(command) {
  return String(command || "").replaceAll("%", "%%");
}

function formatForwardHost(host) {
  const text = String(host || "").trim();
  return text.includes(":") && !text.startsWith("[") ? `[${text}]` : text;
}

function normalizeIdentityFileArg(identityFile) {
  if (!identityFile) return "";
  const first = Array.isArray(identityFile) ? identityFile[0] : identityFile;
  return String(first || "").trim();
}

function formatStrictHostKeyCheckingOption(host) {
  if (host?.strictHostKey === false) return "StrictHostKeyChecking=no";
  if (host?.trustUnknownHostKey === true) return "StrictHostKeyChecking=accept-new";
  return "";
}

function formatConnectTimeoutOption(host) {
  const timeoutMs = Number(host?.connectTimeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return "";
  return `ConnectTimeout=${Math.max(1, Math.round(timeoutMs / 1000))}`;
}

function formatServerAliveOptions(host) {
  const intervalMs = Number(host?.serverAliveIntervalMs);
  const countMax = Number(host?.serverAliveCountMax);
  const options = [];
  if (Number.isFinite(intervalMs) && intervalMs > 0) {
    options.push(`ServerAliveInterval=${Math.max(1, Math.round(intervalMs / 1000))}`);
  }
  if (Number.isFinite(countMax) && countMax >= 0) {
    options.push(`ServerAliveCountMax=${Math.max(0, Math.round(countMax))}`);
  }
  return options;
}

function normalizeForwardRulesForCommand(forwards) {
  if (!Array.isArray(forwards)) return [];
  return forwards.reduce((items, rule) => {
    const normalized = normalizeForwardRule(rule);
    if (!normalized.on) return items;
    if (!validateForwardRule(normalized).ok) return items;
    items.push(normalized);
    return items;
  }, []);
}
