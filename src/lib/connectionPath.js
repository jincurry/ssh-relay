import { formatHostAddress } from "./hosts.js";
import { normalizeJumpHostProfile, normalizeProxyProfile } from "./sessionAuth.js";

export const CONNECTION_PATH_DISPLAY_NODE_LIMIT = 7;

export function buildConnectionPathNodes({ chain = [], jumpHosts = [], name, proxy = null } = {}) {
  const nodes = [{ kind: "local", label: "本机" }];
  const proxyLabel = formatProxyNode(proxy);
  if (proxyLabel) nodes.push({ kind: "proxy", label: proxyLabel });
  const hops = formatPathHops(jumpHosts, chain);
  for (const hop of hops) {
    const label = String(hop || "").trim();
    if (label) nodes.push({ kind: "hop", label });
  }
  const target = String(name || "").trim();
  if (target) nodes.push({ kind: "target", label: target });
  return nodes;
}

export function buildConnectionPathDisplayNodes(input = {}, { limit = CONNECTION_PATH_DISPLAY_NODE_LIMIT } = {}) {
  const nodes = buildConnectionPathNodes(input);
  const safeLimit = normalizeDisplayNodeLimit(limit);
  if (nodes.length <= safeLimit) return nodes;

  const headCount = safeLimit - 2;
  const hiddenCount = nodes.length - headCount - 1;
  return [
    ...nodes.slice(0, headCount),
    { kind: "overflow", label: `+${hiddenCount} 跳`, hiddenCount },
    nodes[nodes.length - 1],
  ];
}

export function describeConnectionPath(input = {}) {
  return buildConnectionPathNodes(input).map(node => node.label).join(" -> ");
}

export function summarizeConnectionPath(input = {}) {
  const nodes = buildConnectionPathNodes(input);
  const proxyCount = nodes.some(node => node.kind === "proxy") ? 1 : 0;
  const hopCount = nodes.filter(node => node.kind === "hop").length;
  const segments = [];
  if (proxyCount) segments.push("经出口代理");
  if (hopCount) segments.push(`${hopCount} 跳`);
  return segments.length ? segments.join(" · ") : "直连";
}

export function buildConnectionConfigPageDisplay({ hostName = "", testing = false, hasJumpHosts = false } = {}) {
  const accentWord = String(hostName || "").trim() || "未命名主机";
  return {
    pageTitle: "连接配置",
    accentWord,
    saveButtonLabel: "保存",
    chainSectionTitle: "连接链路编排",
    chainSectionSubtitle: "从本机到目标的完整路径。可视化拼装代理、堡垒机与中继,顺序即连接顺序。",
    insertNodeLabel: "＋ 插入跳板 / 中继",
    testButtonLabel: testing ? "探测中" : "⚡ 测试链路",
    testButtonDisabled: Boolean(testing),
    hopDragTitle: "拖拽调整跳板顺序",
    moveLeftTitle: "左移",
    moveRightTitle: "右移",
    removeHopTitle: "移除",
    jumpAuthVisible: Boolean(hasJumpHosts),
    jumpAuthTitle: "跳板认证详情",
    jumpAuthSubtitle: "保存后用于终端、SFTP、转发与 TOTP 自动填充",
    jumpIndexLabelPrefix: "第",
    jumpIndexLabelSuffix: "跳",
    jumpHostLabel: "主机 / IP",
    jumpUserLabel: "用户",
    jumpPortLabel: "端口",
    jumpIdentityFileLabel: "IdentityFile",
    jumpTotpLabel: "TOTP",
    jumpTotpUnboundLabel: "不绑定",
    defaultJumpPortPlaceholder: "22",
    defaultIdentityFilePlaceholder: "~/.ssh/bastion_ed25519",
    proxySectionTitle: "出口代理",
    proxySectionSubtitle: "第一跳之前经过的代理。链路图中会以蓝色节点显示。",
    forwardsSectionTitle: "端口转发与隧道",
    forwardsSectionSubtitle: "本地转发 -L · 远程转发 -R · 动态 SOCKS -D。可随会话自动建立。",
    sshCommandSectionTitle: "等效 SSH 命令",
    sshCommandSectionSubtitle: "所有配置实时编译为标准 OpenSSH 命令,可直接复制到任何终端使用。",
  };
}

export function buildConnectionConfigProxyNodeDisplay(proxy) {
  const profile = normalizeProxyProfile(proxy);
  if (!profile || profile.type === "none") {
    return {
      visible: false,
      label: "",
      sub: "",
      type: "none",
    };
  }
  if (profile.type === "cmd") {
    return {
      visible: true,
      label: "ProxyCommand",
      sub: profile.cmd,
      type: "cmd",
    };
  }
  return {
    visible: true,
    label: `${profile.type.toUpperCase()} 代理`,
    sub: formatProxyEndpoint(profile, "127.0.0.1", profile.type === "http" ? "8080" : "1080"),
    type: profile.type,
  };
}

export function formatConnectionProbeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "ok") return "已通过";
  if (normalized === "failed") return "失败";
  if (normalized === "unchecked") return "待验证";
  return normalized || "未知";
}

export function buildConnectionProbeSegmentDisplay(result = null) {
  if (!result || typeof result !== "object") {
    return {
      hasResult: false,
      status: "",
      label: "",
      tone: "neutral",
      title: "",
      latencyLabel: "",
      showEdgeStatus: false,
    };
  }

  const status = normalizeProbeResultStatus(result.status);
  const tone = probeStatusTone(status);
  return {
    hasResult: true,
    status,
    label: formatConnectionProbeStatus(status),
    tone,
    title: String(result.message || "").trim(),
    latencyLabel: formatProbeLatencyLabel(result.latencyMs),
    showEdgeStatus: status === "failed" || status === "unchecked",
  };
}

export function buildConnectionProbeSummary(results = []) {
  const items = Array.isArray(results) ? results : [];
  if (!items.length) return { text: "", tone: "neutral", title: "" };

  const total = items.length;
  const okItems = items.filter(result => normalizeProbeResultStatus(result?.status) === "ok");
  const uncheckedItems = items.filter(result => normalizeProbeResultStatus(result?.status) === "unchecked");
  const failed = items.find(result => normalizeProbeResultStatus(result?.status) === "failed");
  const totalLatency = okItems.reduce((sum, result) => sum + normalizeLatencyMs(result?.latencyMs), 0);
  const title = items
    .map(result => {
      const from = String(result?.from || "").trim();
      const to = String(result?.to || "").trim();
      const route = from && to ? `${from} -> ${to}` : to || from || "未知链路";
      const status = formatConnectionProbeStatus(result?.status);
      const latency = normalizeLatencyMs(result?.latencyMs);
      const message = String(result?.message || "").trim();
      return [route, status, latency ? `${latency}ms` : "", message].filter(Boolean).join(" · ");
    })
    .join("\n");

  if (failed) {
    const failedTo = String(failed?.to || failed?.label || "").trim() || "链路";
    const prefix = totalLatency ? ` · 已测 ${totalLatency}ms` : "";
    return {
      text: `× ${failedTo} 不可达 · 已通过 ${okItems.length}/${total} 段${prefix}`,
      tone: "error",
      title,
    };
  }

  if (uncheckedItems.length) {
    const latency = totalLatency ? ` · 已测 ${totalLatency}ms` : "";
    return {
      text: `已探测 ${okItems.length}/${total} 段 · ${uncheckedItems.length} 段需 SSH 通道验证${latency}`,
      tone: "pending",
      title,
    };
  }

  return {
    text: `✓ 已探测 · 共 ${totalLatency}ms`,
    tone: "success",
    title,
  };
}

function normalizeProbeResultStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "ok" || value === "failed" || value === "unchecked") return value;
  return "unchecked";
}

function probeStatusTone(status) {
  if (status === "ok") return "success";
  if (status === "failed") return "error";
  if (status === "unchecked") return "pending";
  return "neutral";
}

function normalizeLatencyMs(latencyMs) {
  const value = Number(latencyMs);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function formatProbeLatencyLabel(latencyMs) {
  if (latencyMs == null) return "";
  const value = Number(latencyMs);
  if (!Number.isFinite(value) || value < 0) return "";
  return `${Math.round(value)}ms`;
}

function normalizeDisplayNodeLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value)) return CONNECTION_PATH_DISPLAY_NODE_LIMIT;
  return Math.max(3, Math.floor(value));
}

function formatProxyNode(proxy) {
  const profile = normalizeProxyProfile(proxy);
  if (!profile || profile.type === "none") return "";
  if (profile.type === "socks5") return `SOCKS5 ${formatProxyEndpoint(profile, "127.0.0.1", "1080")}`;
  if (profile.type === "http") return `HTTP ${formatProxyEndpoint(profile, "127.0.0.1", "8080")}`;
  if (profile.type === "cmd") return "ProxyCommand";
  return "";
}

export function formatProxyEndpoint(proxy, fallbackHost = "127.0.0.1", fallbackPort = "1080") {
  const host = String(proxy?.host || fallbackHost).trim();
  const port = String(proxy?.port || fallbackPort).trim();
  const username = String(proxy?.username || "").trim();
  const authPrefix = proxy?.auth && username ? `${username}@` : "";
  return `${authPrefix}${formatHostAddress(host)}:${port}`;
}

function formatPathHops(jumpHosts, chain) {
  if (Array.isArray(jumpHosts) && jumpHosts.length) {
    if (Array.isArray(chain) && chain.length && !jumpHostsMatchChain(jumpHosts, chain)) {
      return chain;
    }
    const normalized = jumpHosts.map(jump => normalizeJumpHostProfile(jump));
    if (normalized.every(Boolean)) return normalized.map(formatJumpHostLabel);
    if (Array.isArray(chain) && chain.length) return chain;
    return normalized.filter(Boolean).map(formatJumpHostLabel);
  }
  return Array.isArray(chain) ? chain : [];
}

function jumpHostsMatchChain(jumpHosts, chain) {
  if (jumpHosts.length !== chain.length) return false;
  return jumpHosts.every((jump, index) => {
    const label = String(jump?.name || jump?.host || "").trim();
    return label === String(chain[index] || "").trim();
  });
}

function formatJumpHostLabel(jump) {
  const profile = normalizeJumpHostProfile(jump) || jump;
  const host = String(profile?.host || profile?.name || "").trim();
  if (!host) return "";
  const user = String(profile?.user || "").trim();
  const port = Number(profile?.port) || 22;
  const target = `${user ? `${user}@` : ""}${formatHostAddress(host)}`;
  return port !== 22 ? `${target}:${port}` : target;
}
