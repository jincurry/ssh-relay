export function getCredentialStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "ready") return "就绪";
  if (normalized === "warning") return "需检查";
  if (normalized === "missing") return "缺失";
  return normalized || "未知";
}

export function buildCredentialStatusDisplay(credential = {}) {
  const status = normalizeCredentialStatus(credential?.status);
  return {
    status,
    label: getCredentialStatusLabel(status),
    tone: getCredentialStatusTone(status),
    title: String(credential?.message || "").trim(),
  };
}

export function buildCredentialScanStatus(credentials = [], { desktop = true } = {}) {
  const items = Array.isArray(credentials) ? credentials : [];
  if (!desktop) {
    return {
      text: "浏览器预览数据",
      tone: "success",
      total: items.length,
      warnings: 0,
      missing: 0,
    };
  }

  const warnings = items.filter(item => normalizeCredentialStatus(item?.status) === "warning").length;
  const missing = items.filter(item => normalizeCredentialStatus(item?.status) === "missing").length;
  const suffix = warnings || missing ? ` · ${warnings} 个警告 / ${missing} 个缺失私钥` : "";
  return {
    text: `已扫描本机 ~/.ssh/*.pub 公钥${suffix}`,
    tone: missing > 0 ? "error" : warnings > 0 ? "pending" : "success",
    total: items.length,
    warnings,
    missing,
  };
}

export function buildCredentialVaultDisplay() {
  return {
    sectionTitle: "密钥与口令",
    sectionSubtitle: "私钥永不出库:签名在本地代理完成,跳板与目标只见到公钥。支持 TOTP 动态口令保存与复制。",
    refreshText: "⟳ 刷新",
    emptyText: "未发现公钥。把 `.pub` 文件放入 ~/.ssh 后刷新。",
    repairText: "修复权限",
    repairingText: "修复中",
  };
}

export function buildCredentialRowDisplay(credential = {}, { repairing = false } = {}) {
  const status = buildCredentialStatusDisplay(credential);
  const name = String(credential?.name || "").trim() || "未命名密钥";
  const kind = String(credential?.kind || "").trim() || "SSH 公钥";
  const fingerprint = String(credential?.fingerprint || "").trim();
  const privatePath = String(credential?.privatePath || "").trim();
  const message = String(credential?.message || "").trim();
  const usedHosts = Array.isArray(credential?.usedHosts) ? credential.usedHosts : [];
  const used = Number.isInteger(credential?.used) ? credential.used : usedHosts.length;
  const usageNames = usedHosts
    .map(host => {
      const hostName = String(host?.name || host?.host || "").trim();
      const user = String(host?.user || "").trim();
      const address = String(host?.host || "").trim();
      if (!hostName) return "";
      const target = user && address ? `${user}@${address}` : user || address;
      return target ? `${hostName} (${target})` : hostName;
    })
    .filter(Boolean);

  return {
    name,
    kind,
    fingerprint,
    privatePath,
    message,
    status,
    usageText: `${used} 台主机使用`,
    usageTitle: usageNames.length ? usageNames.join("\n") : "未被当前主机配置引用",
    usageTone: usageNames.length ? "success" : "neutral",
    repairText: repairing ? "修复中" : "修复权限",
  };
}

function normalizeCredentialStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function getCredentialStatusTone(status) {
  if (status === "ready") return "success";
  if (status === "warning") return "pending";
  if (status === "missing") return "error";
  return "neutral";
}
