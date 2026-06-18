import { normalizeIdentityFile, selectJumpHostsForHost } from "./sessionAuth.js";

export function attachCredentialUsage(credentials, hosts, knownHosts = hosts) {
  return (credentials || []).map(credential => {
    const usedHosts = findCredentialHosts(credential, hosts, knownHosts);
    return {
      ...credential,
      used: usedHosts.length || Number(credential?.used) || 0,
      usedHosts,
    };
  });
}

export function findCredentialHosts(credential, hosts, knownHosts = hosts) {
  const keys = credentialMatchKeys(credential);
  if (!keys.size) return [];

  return (hosts || [])
    .filter(host => {
      return collectHostIdentityFiles(host, knownHosts)
        .some(identity => identityMatchKeys(identity).some(key => keys.has(key)));
    })
    .map(host => ({
      id: host.id,
      name: host.name,
      user: host.user,
      host: host.host,
    }));
}

function collectHostIdentityFiles(host, knownHosts) {
  const jumpHosts = selectJumpHostsForHost(host, knownHosts) || [];
  const identities = [
    normalizeIdentityFile(host?.identityFile || host?.privateKeyPath),
    ...jumpHosts.map(jump => normalizeIdentityFile(jump?.identityFile || jump?.privateKeyPath)),
  ].filter(Boolean);
  return Array.from(new Set(identities));
}

export function credentialMatchKeys(credential) {
  const keys = new Set();
  [
    credential?.privatePath,
    credential?.path,
    stripPublicSuffix(credential?.path),
    credential?.name,
  ].forEach(value => addPathKeys(keys, value));
  return keys;
}

function identityMatchKeys(identity) {
  const keys = new Set();
  addPathKeys(keys, identity);
  return Array.from(keys);
}

function addPathKeys(keys, value) {
  const raw = String(value || "").trim();
  if (!raw) return;
  keys.add(raw);
  keys.add(raw.replace(/\\/g, "/"));
  const base = basename(raw);
  if (base) keys.add(base);
}

function stripPublicSuffix(path) {
  const value = String(path || "");
  return value.endsWith(".pub") ? value.slice(0, -4) : value;
}

function basename(path) {
  const normalized = String(path || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.at(-1) || normalized;
}
