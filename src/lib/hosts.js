import { sortHostsForDisplay } from "./hostGroups.js";

const QUICK_CONNECT_USER = /^[a-zA-Z0-9._-]+$/;
const SIMPLE_HOST = /^[a-zA-Z0-9._-]+$/;
const IPV6_SEGMENT = /^[0-9a-fA-F]{1,4}$/;
const IPV6_ZONE = /^[A-Za-z0-9_.:-]+$/;

export function parseQuickConnect(input) {
  const value = String(input || "").trim();
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return null;

  const user = value.slice(0, at);
  const target = value.slice(at + 1);
  if (!QUICK_CONNECT_USER.test(user) || !target) return null;

  const parsed = parseQuickConnectTarget(target);
  if (!parsed) return null;

  return {
    id: `temp-${user}@${parsed.host}:${parsed.port}`,
    name: parsed.host,
    host: parsed.host,
    user,
    port: parsed.port,
    group: "临时连接",
    tags: ["temporary"],
    status: "online",
    lat: [],
    chain: [],
    fav: false,
    temporary: true,
  };
}

function parseQuickConnectTarget(target) {
  const bracketed = target.match(/^\[([^\]]+)\](?::([0-9]{1,5}))?$/);
  if (bracketed) {
    const host = normalizeIpv6Zone(bracketed[1].trim());
    if (!isValidIpv6Host(host)) return null;
    return normalizeQuickTarget(host, bracketed[2]);
  }

  const colonCount = (target.match(/:/g) || []).length;
  if (colonCount > 1) {
    const host = normalizeIpv6Zone(target);
    return isValidIpv6Host(host) ? normalizeQuickTarget(host, null) : null;
  }

  const simple = target.match(/^([a-zA-Z0-9._-]+)(?::([0-9]{1,5}))?$/);
  if (!simple || !SIMPLE_HOST.test(simple[1])) return null;
  return normalizeQuickTarget(simple[1], simple[2]);
}

function normalizeQuickTarget(host, portText) {
  const port = portText ? Number(portText) : 22;
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port };
}

function isValidIpv6Host(host) {
  const { address, zone } = splitIpv6Zone(host);
  const text = address;
  if (zone != null && !IPV6_ZONE.test(zone)) return false;
  if (!text.includes(":")) return false;
  if ((text.match(/::/g) || []).length > 1) return false;

  const tail = text.split(":").pop();
  const hasIpv4Tail = tail?.includes(".");
  if (hasIpv4Tail && !isValidIpv4Host(tail)) return false;
  if (!hasIpv4Tail && !/^[0-9a-fA-F:]+$/.test(text)) return false;

  const compressed = text.includes("::");
  let parts = compressed ? text.split("::").flatMap(part => part ? part.split(":") : []) : text.split(":");
  if (hasIpv4Tail) parts = parts.slice(0, -1);
  if (!compressed && !parts.length) return false;
  if (parts.some(part => !IPV6_SEGMENT.test(part))) return false;
  const segmentCount = hasIpv4Tail ? parts.length + 2 : parts.length;
  if (compressed) return segmentCount < 8;
  return segmentCount === 8;
}

function normalizeIpv6Zone(host) {
  return String(host || "").trim().replace(/%25([^%]+)$/i, "%$1");
}

function splitIpv6Zone(host) {
  const text = normalizeIpv6Zone(host);
  const zoneIndex = text.lastIndexOf("%");
  if (zoneIndex < 0) return { address: text, zone: null };
  return {
    address: text.slice(0, zoneIndex),
    zone: text.slice(zoneIndex + 1),
  };
}

function isValidIpv4Host(host) {
  const parts = String(host || "").split(".");
  return parts.length === 4 && parts.every(part => {
    if (!/^[0-9]{1,3}$/.test(part)) return false;
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

export function findPaletteMatches(hosts, query, limit = 5) {
  const q = String(query || "").trim().toLowerCase();
  const items = Array.isArray(hosts) ? hosts : [];
  const matches = q
    ? items.filter(host => paletteSearchTerms(host).some(term => term.includes(q)))
    : items;
  return sortHostsForDisplay(matches)
    .slice(0, limit);
}

export function buildPaletteResults(hosts, query, limit = 5) {
  const items = Array.isArray(hosts) ? hosts : [];
  const matches = findPaletteMatches(items, query, limit);
  const quick = parseQuickConnect(query);
  if (!quick) return matches;

  const exact = sortHostsForDisplay(items.filter(host => isSamePaletteTarget(host, quick)));
  if (exact.length) {
    const exactHosts = new Set(exact);
    return [
      ...exact,
      ...matches.filter(host => !exactHosts.has(host)),
    ].slice(0, limit);
  }

  return [quick, ...matches].slice(0, limit);
}

function isSamePaletteTarget(host, target) {
  const leftUser = String(host?.user || "").trim();
  const rightUser = String(target?.user || "").trim();
  if (!leftUser || leftUser !== rightUser) return false;
  const leftHost = normalizePaletteTargetHost(host?.host);
  const rightHost = normalizePaletteTargetHost(target?.host);
  const leftPort = Number(host?.port) || 22;
  const rightPort = Number(target?.port) || 22;
  return Boolean(leftHost) && leftHost === rightHost && leftPort === rightPort;
}

function normalizePaletteTargetHost(host) {
  const text = String(host || "").trim().toLowerCase();
  const bracketed = text.match(/^\[([^\]]+)\]$/);
  return bracketed ? bracketed[1] : text;
}

function paletteSearchTerms(host) {
  const tags = Array.isArray(host?.tags) ? host.tags : [];
  return [
    host?.name,
    host?.host,
    host?.user,
    `${host?.user || ""}@${host?.host || ""}`,
    formatUserHostPort(host),
    ...tags,
  ]
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export function formatUserHostPort(host) {
  const user = String(host?.user || "").trim();
  const targetHost = formatHostAddress(host?.host);
  const port = Number(host?.port) || 22;
  const target = `${user ? `${user}@` : ""}${targetHost}`;
  return port !== 22 ? `${target}:${port}` : target;
}

export function formatHostAddress(host) {
  const text = String(host || "").trim();
  return text.includes(":") && !text.startsWith("[") ? `[${text}]` : text;
}
