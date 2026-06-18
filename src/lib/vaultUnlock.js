export const VAULT_UNLOCK_STORAGE_KEY = "relay.vaultUnlock.v1";

const HASH_ALGORITHM = "SHA-256";
const RECORD_VERSION = 1;
const MIN_PASSPHRASE_LENGTH = 8;

export function loadVaultUnlockRecord(storage) {
  if (!storage) return null;
  try {
    return normalizeVaultUnlockRecord(JSON.parse(storage.getItem(VAULT_UNLOCK_STORAGE_KEY) || "null"));
  } catch {
    return null;
  }
}

export function saveVaultUnlockRecord(storage, record) {
  if (!storage) return false;
  let normalized;
  try {
    normalized = normalizeVaultUnlockRecord(record);
  } catch {
    normalized = null;
  }
  if (!normalized) throw new Error("本地解锁门禁记录无效");
  storage.setItem(VAULT_UNLOCK_STORAGE_KEY, JSON.stringify(normalized));
  return true;
}

export function clearVaultUnlockRecord(storage) {
  if (!storage) return false;
  storage.removeItem?.(VAULT_UNLOCK_STORAGE_KEY);
  return true;
}

export function buildVaultUnlockResetConfirmation() {
  return [
    "重置本地解锁门禁?",
    "",
    "只会删除 RELAY 保存在本机的加盐校验记录。",
    "不会删除系统钥匙串中的 SSH 密码、私钥口令或 TOTP 密钥。",
    "不会修改主机、跳板、代理或转发配置。",
  ].join("\n");
}

export function buildVaultStatusMessage(text, tone = "neutral") {
  const normalizedTone = tone === "error" ? "error" : tone === "success" ? "success" : "neutral";
  return {
    text: String(text || "").trim(),
    tone: normalizedTone,
  };
}

export function buildVaultUnlockDisplay({ ready = true, hasRecord = false, unlocked = false } = {}) {
  const setupMode = ready && !hasRecord;
  return {
    pageTitle: "凭据保险库",
    setupMode,
    locked: !unlocked,
    action: unlocked
      ? { text: "🔓 主密码已解锁", tone: "success", buttonText: "锁定" }
      : { text: `🔒 ${setupMode ? "等待设置主密码" : "等待主密码"}`, tone: setupMode ? "pending" : "neutral", buttonText: "" },
    gate: {
      title: setupMode ? "设置本地解锁密码" : "输入主密码解锁",
      subtitle: "SSH 密码、私钥口令和 TOTP 密钥仍保存在系统钥匙串;本地门禁只控制 RELAY 保险库界面访问。",
      passphraseLabel: "主密码",
      passphrasePlaceholder: setupMode ? "至少 8 个字符" : "输入主密码",
      confirmVisible: setupMode,
      confirmLabel: "确认主密码",
      confirmPlaceholder: "再次输入主密码",
      submitText: setupMode ? "启用门禁" : "解锁",
      resetText: "重置本地门禁",
    },
  };
}

export async function createVaultUnlockRecord(passphrase, { salt = generateVaultSalt() } = {}) {
  assertPassphrase(passphrase);
  const cleanSalt = normalizeSalt(salt);
  return {
    version: RECORD_VERSION,
    algorithm: HASH_ALGORITHM,
    salt: cleanSalt,
    hash: await deriveVaultUnlockHash(passphrase, cleanSalt),
  };
}

export async function verifyVaultUnlockRecord(passphrase, record) {
  let normalized;
  try {
    normalized = normalizeVaultUnlockRecord(record);
  } catch {
    normalized = null;
  }
  if (!normalized) return false;
  if (typeof passphrase !== "string" || passphrase.length === 0) return false;
  const hash = await deriveVaultUnlockHash(passphrase, normalized.salt);
  return timingSafeEqual(hash, normalized.hash);
}

export async function deriveVaultUnlockHash(passphrase, salt) {
  if (typeof passphrase !== "string") {
    throw new Error("保险库主密码不能为空");
  }
  const cleanSalt = normalizeSalt(salt);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) {
    throw new Error("当前环境缺少浏览器加密接口,无法生成保险库解锁校验记录");
  }
  const bytes = new TextEncoder().encode(`${cleanSalt}:${passphrase}`);
  const digest = await subtle.digest(HASH_ALGORITHM, bytes);
  return bytesToHex(new Uint8Array(digest));
}

export function generateVaultSalt() {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("当前环境缺少浏览器加密接口,无法生成保险库随机盐");
  }
  cryptoApi.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function normalizeVaultUnlockRecord(record) {
  if (!record || typeof record !== "object") return null;
  if (record.version !== RECORD_VERSION || record.algorithm !== HASH_ALGORITHM) return null;
  const salt = normalizeSalt(record.salt);
  const hash = typeof record.hash === "string" ? record.hash.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  return { version: RECORD_VERSION, algorithm: HASH_ALGORITHM, salt, hash };
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`保险库主密码至少需要 ${MIN_PASSPHRASE_LENGTH} 个字符`);
  }
}

function normalizeSalt(salt) {
  const clean = typeof salt === "string" ? salt.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{16,64}$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("保险库随机盐无效");
  }
  return clean;
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}
