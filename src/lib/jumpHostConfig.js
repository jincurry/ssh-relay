import { normalizeIdentityFile, normalizeJumpHostProfile } from "./sessionAuth.js";

export function buildEditableJumpHosts({ host = {}, chain = host.chain, knownHosts = [] } = {}) {
  return reconcileJumpHostsForChain(chain, {
    currentJumpHosts: host.jumpHosts,
    knownHosts,
    fallbackUser: host.user,
  });
}

export function reconcileJumpHostsForChain(chain, { currentJumpHosts = [], knownHosts = [], fallbackUser = "" } = {}) {
  const labels = normalizeChain(chain);
  if (!labels.length) return [];

  return labels.map((label) => {
    const source = findJumpByLabel(currentJumpHosts, label)
      || findKnownHostByLabel(knownHosts, label)
      || { name: label, host: label };
    return normalizeEditableJumpHost(source, { label, fallbackUser });
  });
}

export function patchEditableJumpHost(jumpHosts, index, patch) {
  const items = Array.isArray(jumpHosts) ? jumpHosts.slice() : [];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return items;
  const next = { ...items[index], ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "identityFile")) {
    next.identityFile = normalizeIdentityFile(patch.identityFile) || undefined;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "totpProfileId")) {
    next.totpProfileId = clean(patch.totpProfileId) || undefined;
  }
  items[index] = next;
  return items;
}

export function finalizeJumpHostsForSave(chain, jumpHosts, { fallbackUser = "" } = {}) {
  const labels = normalizeChain(chain);
  if (!labels.length) return undefined;

  return labels.map((label, index) => normalizeEditableJumpHost(jumpHosts?.[index], { label, fallbackUser }));
}

function normalizeEditableJumpHost(input = {}, { label = "", fallbackUser = "" } = {}) {
  return normalizeJumpHostProfile(input, { label, fallbackUser }) || {
    name: clean(label),
    host: clean(label),
    user: clean(fallbackUser),
    port: "22",
  };
}

function findJumpByLabel(jumpHosts, label) {
  if (!Array.isArray(jumpHosts)) return null;
  return jumpHosts.find(jump => jumpMatchesLabel(jump, label)) || null;
}

function findKnownHostByLabel(knownHosts, label) {
  if (!Array.isArray(knownHosts)) return null;
  return knownHosts.find(host => {
    const values = [host?.id, host?.name, host?.host].map(clean).filter(Boolean);
    return values.includes(clean(label));
  }) || null;
}

function jumpMatchesLabel(jump, label) {
  const key = clean(label);
  if (!key) return false;
  return [jump?.name, jump?.host, jump?.id].map(clean).includes(key);
}

function normalizeChain(chain) {
  return Array.isArray(chain) ? chain.map(clean).filter(Boolean) : [];
}

function clean(value) {
  return String(value ?? "").trim();
}
