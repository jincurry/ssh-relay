import { normalizeAppearance } from "./appearanceStore.js";
import { loadCommandHistory, saveCommandHistory } from "./commandHistory.js";
import { loadHosts, saveHosts } from "./hostStore.js";
import { isSensitiveShellText } from "./sensitiveShellText.js";
import { normalizeIdentityFile } from "./sessionAuth.js";
import { normalizeSnippetList } from "./snippets.js";
import { normalizeTotpProfileList } from "./totpStore.js";

export const CONFIG_SYNC_SCHEMA_VERSION = 1;
export const CONFIG_SYNC_APP = "relay-ssh-manager";
export const CONFIG_SYNC_DEVICE_STORAGE_KEY = "relay.syncDeviceId.v1";

export function buildConfigSnapshot(state, { now = () => new Date(), appearanceDefaults, deviceId = null } = {}) {
  assertAppearanceDefaults(appearanceDefaults);
  const exportedAt = now().toISOString();
  const appearance = normalizeAppearance(state?.appearance || {}, appearanceDefaults);
  const data = {
    hosts: normalizeHostsForSync(state?.hosts || []),
    appearance,
    snippets: normalizeSnippetsForSync(state?.snippets || []),
    totpProfiles: normalizeTotpProfilesForSync(state?.totpProfiles || []),
    commandHistory: normalizeCommandHistoryForSync(state?.commandHistory || []),
  };
  return {
    app: CONFIG_SYNC_APP,
    schemaVersion: CONFIG_SYNC_SCHEMA_VERSION,
    exportedAt,
    sync: buildSyncMetadata(data, { exportedAt, deviceId }),
    data,
  };
}

export function serializeConfigSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function parseConfigSnapshot(text, { appearanceDefaults } = {}) {
  return parseConfigSnapshotEnvelope(text, { appearanceDefaults }).data;
}

export function parseConfigSnapshotEnvelope(text, { appearanceDefaults } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("配置快照不是有效的 JSON 文件");
  }
  return normalizeConfigSnapshotEnvelope(parsed, { appearanceDefaults });
}

export function normalizeConfigSnapshot(snapshot, { appearanceDefaults } = {}) {
  return normalizeConfigSnapshotEnvelope(snapshot, { appearanceDefaults }).data;
}

export function normalizeConfigSnapshotEnvelope(snapshot, { appearanceDefaults } = {}) {
  assertAppearanceDefaults(appearanceDefaults);
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("配置快照内容不能为空");
  }
  if (snapshot.app !== CONFIG_SYNC_APP) {
    throw new Error("该配置快照不是由 RELAY 导出的文件");
  }
  if (snapshot.schemaVersion !== CONFIG_SYNC_SCHEMA_VERSION) {
    throw new Error(`不支持的配置快照版本: ${snapshot.schemaVersion}`);
  }

  const data = snapshot.data;
  if (!data || typeof data !== "object") {
    throw new Error("配置快照缺少 data 数据");
  }

  const normalizedData = {
    hosts: normalizeHostsForSync(data.hosts || []),
    appearance: normalizeAppearance(data.appearance || {}, appearanceDefaults),
    snippets: normalizeSnippetsForSync(data.snippets || []),
    totpProfiles: normalizeTotpProfilesForSync(data.totpProfiles || []),
    commandHistory: normalizeCommandHistoryForSync(data.commandHistory || []),
  };
  const sync = normalizeSyncMetadata(snapshot.sync, normalizedData, snapshot.exportedAt);

  return {
    app: CONFIG_SYNC_APP,
    schemaVersion: CONFIG_SYNC_SCHEMA_VERSION,
    exportedAt: normalizeIsoDate(snapshot.exportedAt),
    sync,
    data: normalizedData,
  };
}

export function makeConfigSnapshotFileName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `relay-config-${stamp}.json`;
}

export function getOrCreateConfigSyncDeviceId(storage, { random = Math.random } = {}) {
  if (!storage) return makeConfigSyncDeviceId(random);
  const stored = String(storage.getItem(CONFIG_SYNC_DEVICE_STORAGE_KEY) || "").trim();
  if (isValidDeviceId(stored)) return stored;
  const next = makeConfigSyncDeviceId(random);
  storage.setItem(CONFIG_SYNC_DEVICE_STORAGE_KEY, next);
  return next;
}

export function buildSyncMetadata(data, { exportedAt = new Date().toISOString(), deviceId = null } = {}) {
  const contentHash = hashConfigData(data);
  return {
    sourceDeviceId: isValidDeviceId(deviceId) ? deviceId : null,
    exportedAt: normalizeIsoDate(exportedAt),
    contentHash,
    itemCounts: countSnapshotItems(data),
  };
}

export function hashConfigData(data) {
  return `fnv1a32:${fnv1a32(stableStringify(data))}`;
}

export function countSnapshotItems(data) {
  return {
    hosts: Array.isArray(data?.hosts) ? data.hosts.length : 0,
    snippets: Array.isArray(data?.snippets) ? data.snippets.length : 0,
    totpProfiles: Array.isArray(data?.totpProfiles) ? data.totpProfiles.length : 0,
    commandHistory: Array.isArray(data?.commandHistory) ? data.commandHistory.length : 0,
  };
}

export function buildConfigSnapshotImportSummary(currentState, envelope, { localDeviceId = null } = {}) {
  const data = envelope?.data || {};
  const currentCounts = countSnapshotItems(currentState || {});
  const incomingCounts = countSnapshotItems(data);
  const sourceDeviceId = envelope?.sync?.sourceDeviceId || null;
  const origin = sourceDeviceId && sourceDeviceId === localDeviceId ? "本机快照" : "外部快照";
  return {
    origin,
    sourceDeviceId,
    contentHash: envelope?.sync?.contentHash || null,
    currentCounts,
    incomingCounts,
    removesItems: Object.keys(incomingCounts).some(key => incomingCounts[key] < currentCounts[key]),
  };
}

export function formatConfigSnapshotImportConfirmation(summary) {
  const current = summary?.currentCounts || countSnapshotItems({});
  const incoming = summary?.incomingCounts || countSnapshotItems({});
  const lines = [
    `导入 ${summary?.origin || "配置快照"} 会替换当前本地配置。`,
    "",
    `主机: ${current.hosts} -> ${incoming.hosts}`,
    `命令片段: ${current.snippets} -> ${incoming.snippets}`,
    `TOTP 配置: ${current.totpProfiles} -> ${incoming.totpProfiles}`,
    `命令历史: ${current.commandHistory} -> ${incoming.commandHistory}`,
  ];
  if (summary?.removesItems) {
    lines.push("", "导入后，当前多出的本地条目会从 RELAY 配置中移除。");
  }
  lines.push("", "确认导入?");
  return lines.join("\n");
}

function normalizeHostsForSync(hosts) {
  const stripped = Array.isArray(hosts) ? hosts.map(stripHostSecrets) : [];
  const storage = memoryStorage();
  saveHosts(storage, stripped);
  return loadHosts(storage, []);
}

function normalizeSnippetsForSync(snippets) {
  return normalizeSnippetList(snippets)
    .filter(snippet => !isSensitiveShellText(snippet.cmd));
}

function normalizeTotpProfilesForSync(profiles) {
  return normalizeTotpProfileList(profiles);
}

function normalizeCommandHistoryForSync(commandHistory) {
  const storage = memoryStorage();
  const safeHistory = Array.isArray(commandHistory)
    ? commandHistory.filter(command => !isSensitiveShellText(command))
    : [];
  saveCommandHistory(storage, safeHistory);
  return loadCommandHistory(storage);
}

function stripHostSecrets(host) {
  if (!host || typeof host !== "object") return {};
  const safe = pick(host, [
    "id",
    "name",
    "host",
    "user",
    "port",
    "group",
    "tags",
    "status",
    "lat",
    "chain",
    "fav",
    "identityFile",
    "totpProfileId",
    "proxy",
    "forwards",
    "jumpHosts",
    "updatedAt",
    "strictHostKey",
    "trustUnknownHostKey",
    "connectTimeoutMs",
    "serverAliveIntervalMs",
    "serverAliveCountMax",
  ]);

  if (safe.identityFile) safe.identityFile = normalizeIdentityFile(safe.identityFile);
  if (host?.privateKeyPath && !safe.identityFile) {
    safe.identityFile = normalizeIdentityFile(host.privateKeyPath);
  }
  if (safe.proxy) safe.proxy = stripProxy(safe.proxy);
  if (Array.isArray(safe.forwards)) safe.forwards = safe.forwards.map(stripForward);
  if (Array.isArray(safe.jumpHosts)) safe.jumpHosts = safe.jumpHosts.map(stripJumpHostSecrets);

  return safe;
}

function stripJumpHostSecrets(jump) {
  const safe = stripHostSecrets(jump);
  delete safe.status;
  delete safe.lat;
  delete safe.chain;
  delete safe.fav;
  delete safe.forwards;
  delete safe.jumpHosts;
  delete safe.updatedAt;
  if (jump?.privateKeyPath && !safe.identityFile) {
    safe.identityFile = normalizeIdentityFile(jump.privateKeyPath);
  }
  return safe;
}

function stripProxy(proxy) {
  return pick(proxy, ["type", "kind", "host", "port", "auth", "username", "cmd"]);
}

function stripForward(forward) {
  return pick(forward, ["id", "type", "lport", "rhost", "rport", "on"]);
}

function pick(source, keys) {
  return keys.reduce((out, key) => {
    if (source[key] !== undefined) out[key] = source[key];
    return out;
  }, {});
}

function normalizeSyncMetadata(sync, data, exportedAt) {
  const fallback = buildSyncMetadata(data, { exportedAt });
  if (!sync || typeof sync !== "object") return fallback;

  const expectedHash = hashConfigData(data);
  const contentHash = String(sync.contentHash || "").trim();
  if (contentHash && contentHash !== expectedHash) {
    throw new Error("配置快照校验和不匹配,文件可能已被修改");
  }

  return {
    sourceDeviceId: isValidDeviceId(sync.sourceDeviceId) ? sync.sourceDeviceId : null,
    exportedAt: normalizeIsoDate(sync.exportedAt || exportedAt),
    contentHash: expectedHash,
    itemCounts: countSnapshotItems(data),
  };
}

function normalizeIsoDate(value) {
  const date = value ? new Date(value) : new Date(0);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

function makeConfigSyncDeviceId(random) {
  const part = Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * 0xffffffff)
    .toString(36)
    .padStart(7, "0");
  return `relay-${part}`;
}

function isValidDeviceId(value) {
  return /^relay-[a-z0-9]{7,16}$/.test(String(value || ""));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

function assertAppearanceDefaults(defaults) {
  if (!defaults?.themeNames) {
    throw new Error("appearance defaults are required");
  }
}
