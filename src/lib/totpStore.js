import { normalizeJumpHostProfile, selectJumpHostsForHost } from "./sessionAuth.js";

export const TOTP_STORAGE_KEY = "relay.totpProfiles.v1";

export function loadTotpProfiles(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(TOTP_STORAGE_KEY) || "[]");
    return normalizeTotpProfileList(parsed);
  } catch {
    return [];
  }
}

export function saveTotpProfiles(storage, profiles) {
  if (!storage) return false;
  storage.setItem(TOTP_STORAGE_KEY, JSON.stringify(normalizeTotpProfileList(profiles)));
  return true;
}

export function addTotpProfile(profiles, input, { now = () => new Date() } = {}) {
  const profile = normalizeTotpProfile({
    ...input,
    createdAt: input.createdAt || now().toISOString(),
  });
  if (profiles.some(item => item.id === profile.id)) {
    throw new Error(`TOTP 配置已存在: ${profile.id}`);
  }
  return [...profiles, profile];
}

export function updateTotpProfile(profiles, id, input) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("TOTP ID 不能为空");
  const current = profiles.find(profile => profile.id === targetId);
  if (!current) throw new Error(`未找到 TOTP 配置: ${targetId}`);

  const profile = normalizeTotpProfile({
    ...current,
    ...input,
    id: targetId,
    createdAt: current.createdAt,
  });

  return profiles.map(item => item.id === targetId ? profile : item);
}

export function validateTotpSecretSubmission({ editing = false, secret = "" } = {}) {
  const value = String(secret || "").trim();
  if (!value) {
    return editing
      ? { ok: true, shouldSave: false, secret: "", message: "" }
      : { ok: false, shouldSave: false, secret: "", message: "TOTP Base32 密钥不能为空" };
  }
  return { ok: true, shouldSave: true, secret: value, message: "" };
}

export function buildTotpVaultDisplay({ showForm = false, editing = false } = {}) {
  return {
    sectionTitle: "TOTP 动态口令",
    sectionSubtitle: "TOTP 密钥存入系统钥匙串,本地配置只保存签发方/账号等非敏感元数据。",
    defaultMessage: "用于堡垒机 2FA 的 6 位动态口令",
    toggleText: showForm ? "收起" : "新增 TOTP",
    emptyText: "尚未保存 TOTP。新增后可在连接堡垒机时手动复制验证码。",
    form: {
      fields: [
        { key: "label", label: "名称", placeholder: "prod-2fa", type: "text" },
        { key: "issuer", label: "签发方", placeholder: "bastion-sh", type: "text" },
        { key: "account", label: "账号", placeholder: "deploy", type: "text" },
        { key: "secret", label: "Base32 密钥", placeholder: editing ? "留空则保留原密钥" : "JBSWY3DPEHPK3PXP", type: "password" },
        { key: "digits", label: "位数", type: "number", min: 6, max: 8 },
        { key: "period", label: "周期秒", type: "number", min: 15, max: 120 },
      ],
      submitText: editing ? "更新" : "保存",
      cancelText: "取消",
    },
    rowActions: {
      generateText: "生成",
      copyText: "复制",
      editText: "编辑",
      deleteText: "删除",
    },
  };
}

export function buildTotpProfileDisplay(profile = {}, code = null) {
  const label = String(profile?.label || "").trim() || "未命名 TOTP";
  const issuer = String(profile?.issuer || "").trim() || "local";
  const account = String(profile?.account || "").trim();
  const id = String(profile?.id || "").trim();
  const period = Number.isInteger(profile?.period) ? profile.period : 30;
  const digits = Number.isInteger(profile?.digits) ? profile.digits : 6;
  const usedHosts = Array.isArray(profile?.usedHosts) ? profile.usedHosts : [];
  const used = Number.isInteger(profile?.used) ? profile.used : usedHosts.length;
  const codeText = String(code?.code || "").trim();
  const remainingSeconds = Number.isFinite(code?.remainingSeconds) ? Math.max(0, Math.floor(code.remainingSeconds)) : null;
  const usageNames = usedHosts
    .map(host => {
      const name = String(host?.name || host?.host || "").trim();
      const user = String(host?.user || "").trim();
      const hostName = String(host?.host || "").trim();
      if (!name) return "";
      const target = user && hostName ? `${user}@${hostName}` : user || hostName;
      return target ? `${name} (${target})` : name;
    })
    .filter(Boolean);

  return {
    label,
    scope: account ? `${issuer} / ${account}` : issuer,
    meta: `${period}s · ${digits} digits · ${id || "totp"}`,
    codeText: codeText || "------",
    codeActive: Boolean(codeText),
    remainingText: remainingSeconds == null ? "" : `${remainingSeconds}s`,
    usageText: `${used} 台主机使用`,
    usageTitle: usageNames.length ? usageNames.join("\n") : "未被当前主机配置引用",
    usageTone: usageNames.length ? "success" : "neutral",
  };
}

export function removeTotpProfile(profiles, id) {
  return profiles.filter(profile => profile.id !== id);
}

export function buildTotpDeleteConfirmation(profile) {
  const label = String(profile?.label || "").trim() || "未命名 TOTP";
  const issuer = String(profile?.issuer || "").trim();
  const account = String(profile?.account || "").trim();
  const usedHosts = Array.isArray(profile?.usedHosts) ? profile.usedHosts : [];
  const used = Number.isInteger(profile?.used) ? profile.used : usedHosts.length;
  const lines = [`删除 TOTP ${label}?`];
  const scope = [issuer, account].filter(Boolean).join(" / ");
  if (scope) lines.push("", scope);
  if (used > 0) {
    const names = usedHosts.map(host => String(host?.name || host?.host || "").trim()).filter(Boolean);
    const suffix = names.length ? `: ${names.join(", ")}` : "";
    lines.push("", `当前有 ${used} 台主机引用该 TOTP${suffix}`);
  }
  lines.push("", "删除后会同时移除系统钥匙串中的 TOTP seed。");
  return lines.join("\n");
}

export function attachTotpUsage(profiles, hosts, knownHosts = hosts) {
  return (profiles || []).map(profile => {
    const usedHosts = findTotpProfileHosts(profile, hosts, knownHosts);
    return {
      ...profile,
      used: usedHosts.length,
      usedHosts,
    };
  });
}

export function findTotpProfileHosts(profile, hosts, knownHosts = hosts) {
  return (hosts || [])
    .filter(host => collectTotpTargets(host, knownHosts).some(target => totpProfileMatchesTarget(profile, target)))
    .map(host => ({
      id: host.id,
      name: host.name,
      user: host.user,
      host: host.host,
    }));
}

export function findTotpProfileForTarget(target, profiles = []) {
  if (!target || !Array.isArray(profiles) || !profiles.length) return null;
  return profiles.find(profile => totpProfileMatchesTarget(profile, target)) || null;
}

export function normalizeTotpProfile(input) {
  const label = String(input?.label || "").trim();
  const issuer = String(input?.issuer || "").trim();
  const account = String(input?.account || "").trim();
  const id = String(input?.id || makeTotpId(label, issuer, account)).trim();
  const digits = clampInt(input?.digits, 6, 8, 6);
  const period = clampInt(input?.period, 15, 120, 30);

  if (!label) throw new Error("TOTP 名称不能为空");
  if (!id) throw new Error("TOTP ID 不能为空");
  if (!/^[A-Za-z0-9_.@-]{1,128}$/.test(id)) {
    throw new Error("TOTP ID 只能包含字母、数字、短横线、下划线、点号或 @");
  }

  return {
    id,
    label,
    issuer,
    account,
    digits,
    period,
    createdAt: input?.createdAt || null,
  };
}

export function normalizeTotpProfileList(profiles) {
  if (!Array.isArray(profiles)) return [];
  const seenIds = new Set();
  return profiles.reduce((items, profile) => {
    try {
      const normalized = normalizeTotpProfile(profile);
      const idKey = normalized.id.toLowerCase();
      if (seenIds.has(idKey)) return items;
      seenIds.add(idKey);
      items.push(normalized);
    } catch {
      // Ignore one bad persisted/imported profile without losing other TOTP metadata.
    }
    return items;
  }, []);
}

function collectTotpTargets(host, knownHosts) {
  const jumpHosts = (selectJumpHostsForHost(host, knownHosts) || [])
    .map(jump => normalizeJumpHostProfile(jump))
    .filter(Boolean);
  return [
    host,
    ...jumpHosts,
  ].filter(Boolean);
}

function totpProfileMatchesTarget(profile, target) {
  if (!profile || !target) return false;
  const targetValues = [
    target.totpProfileId,
    target.name,
    target.host,
    `${target.user || ""}@${target.host || ""}`,
  ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean);

  const profileValues = [profile.id, profile.label, profile.issuer]
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (profileValues.some(value => targetValues.includes(value))) return true;

  const issuer = String(profile.issuer || "").trim().toLowerCase();
  const account = String(profile.account || "").trim().toLowerCase();
  return account && account === String(target.user || "").trim().toLowerCase()
    && issuer
    && targetValues.includes(issuer);
}

function makeTotpId(label, issuer, account) {
  const base = [issuer, account, label].filter(Boolean).join("-") || "totp";
  return slug(base).slice(0, 96);
}

function slug(value) {
  const out = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.@-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "totp";
}

function clampInt(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isInteger(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}
