export function isHostOffline(host) {
  return String(host?.status || "").toLowerCase() === "offline";
}

export function isHostOnline(host) {
  return String(host?.status || "").toLowerCase() === "online";
}

export function canOpenHostSession(host) {
  return Boolean(host) && !isHostOffline(host);
}

export function canOpenHostSftp(host) {
  return canOpenHostSession(host);
}

export function countConnectableHosts(hosts) {
  return (hosts || []).filter(canOpenHostSession).length;
}

export function countOnlineHosts(hosts) {
  return (hosts || []).filter(isHostOnline).length;
}

export function buildHostListSummary(hosts) {
  const items = Array.isArray(hosts) ? hosts : [];
  const online = countOnlineHosts(items);
  const total = items.length;
  return {
    online,
    total,
    text: `${online} 在线 / ${total} 台`,
    tone: "neutral",
  };
}

export function buildHostListEmptyState({ visibleHosts = [], allHosts = [], selectedGroup = "" } = {}) {
  const visibleCount = Array.isArray(visibleHosts) ? visibleHosts.length : 0;
  const totalCount = Array.isArray(allHosts) ? allHosts.length : 0;
  const group = String(selectedGroup || "").trim() || "当前分组";
  if (visibleCount > 0) {
    return {
      visible: false,
      title: "",
      description: "",
      primaryActionLabel: "",
      secondaryActionLabel: "",
      secondaryAction: "",
    };
  }
  if (totalCount === 0) {
    return {
      visible: true,
      title: "还没有主机",
      description: "新增主机,或从 ~/.ssh/config 导入现有配置。",
      primaryActionLabel: "＋ 新增主机",
      secondaryActionLabel: "导入 SSH config",
      secondaryAction: "import",
    };
  }
  return {
    visible: true,
    title: `${group} 没有主机`,
    description: "切换到全部主机,或新增主机后选择这个分组。",
    primaryActionLabel: "＋ 新增主机",
    secondaryActionLabel: "查看全部主机",
    secondaryAction: "all",
  };
}

export function buildHostFormDisplay({ editing = false, message = "" } = {}) {
  const errorText = String(message || "").trim();
  return {
    title: editing ? "编辑主机" : "新增主机",
    fields: [
      { key: "name", label: "名称", placeholder: "prod-web-03", gridColumn: "" },
      { key: "host", label: "地址", placeholder: "10.2.1.13", gridColumn: "" },
      { key: "user", label: "用户", placeholder: "deploy", gridColumn: "" },
      { key: "port", label: "端口", placeholder: "22", gridColumn: "" },
      { key: "group", label: "分组", placeholder: "", gridColumn: "" },
      { key: "tags", label: "标签(逗号分隔)", placeholder: "nginx, 华东", gridColumn: "" },
      { key: "identityFile", label: "IdentityFile", placeholder: "~/.ssh/id_ed25519", gridColumn: "1 / -1" },
    ],
    errorText,
    errorVisible: Boolean(errorText),
    cancelLabel: "取消",
    submitLabel: "保存",
  };
}

export function buildHostListTopBarDisplay({ paletteShortcut = "", syncStatus = {}, agentDisplay = {} } = {}) {
  const syncText = String(syncStatus?.text || "").trim();
  return {
    brandText: "RELAY",
    brandSuffix: "SSH 控制台",
    searchPlaceholder: "搜索或快速连接…",
    paletteShortcut: String(paletteShortcut || "").trim(),
    syncPrefix: "⟳",
    syncText,
    syncTone: syncStatus?.tone || "success",
    syncVisible: Boolean(syncText),
    exportLabel: "导出配置",
    importLabel: "导入配置",
    agentPrefix: "●",
    agentLabel: String(agentDisplay?.label || "").trim(),
    agentTitle: String(agentDisplay?.title || "").trim(),
    agentTone: agentDisplay?.tone || "pending",
    agentVisible: Boolean(agentDisplay?.label),
  };
}

export function buildHostListToolbarDisplay({ probing = false } = {}) {
  const busy = Boolean(probing);
  return {
    addHostLabel: "＋ 新增主机",
    refreshStatusLabel: busy ? "探测中" : "刷新状态",
    refreshStatusDisabled: busy,
    refreshStatusOpacity: busy ? 0.6 : 1,
    editHostTitle: "编辑主机",
    configHostTitle: "链路 / 代理 / 转发配置",
    deleteHostTitle: "删除主机",
    connectLabel: "连接",
  };
}

export function buildHostSidebarDisplay({ snippetShortcut = "" } = {}) {
  const shortcut = String(snippetShortcut || "").trim();
  return {
    groupSectionLabel: "分组",
    toolSectionLabel: "工具",
    tools: [
      { id: "local", label: "›_ 本地终端" },
      { id: "snippets", label: `${shortcut ? `${shortcut} ` : ""}命令片段` },
      { id: "vault", label: "🔑 凭据保险库" },
      { id: "theme", label: "🎨 主题与外观" },
    ],
  };
}

export function buildHostCardDisplay(host, { hovered = false, actionsVisible = false, latestLatency = null } = {}) {
  const offline = isHostOffline(host);
  const favorite = Boolean(host?.fav);
  const canConnect = canOpenHostSession(host);
  const canSftp = canOpenHostSftp(host);
  const latency = normalizeLatency(latestLatency);
  return {
    opacity: offline ? 0.55 : 1,
    transform: hovered ? "translateY(-2px)" : "none",
    borderTone: actionsVisible ? "pending" : "neutral",
    favoriteIcon: favorite ? "★" : "☆",
    favoriteTitle: favorite ? "取消收藏" : "收藏",
    favoriteTone: favorite ? "pending" : "neutral",
    latency,
    latencyLabel: latency == null ? "" : `${latency}ms`,
    latencyTone: latency != null && latency > 40 ? "pending" : "success",
    canConnect,
    canSftp,
    sftpTitle: canSftp ? "SFTP 文件" : "离线主机不可打开 SFTP",
    connectTitle: canConnect ? "连接主机" : "离线主机不可连接",
    actionDisabledOpacity: 0.45,
    connectOpacity: canConnect ? 1 : 0.55,
    connectCursor: canConnect ? "pointer" : "not-allowed",
  };
}

export function getHostStatusPresentation(host) {
  const status = String(host?.status || "").toLowerCase();
  if (status === "online") return { tone: "online", animated: true };
  if (status === "busy") return { tone: "busy", animated: false };
  return { tone: "offline", animated: false };
}

export function areHostCardActionsVisible({ hovered = false, focusWithin = false } = {}) {
  return Boolean(hovered || focusWithin);
}

export function getHostCardActionTabIndex({ visible = false, disabled = false } = {}) {
  return visible && !disabled ? 0 : -1;
}

export function getHostCardActionPointerEvents(visible) {
  return visible ? "auto" : "none";
}

function normalizeLatency(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}
