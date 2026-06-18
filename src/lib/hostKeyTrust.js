export function isUnknownHostKeyError(error) {
  return unknownHostKeyMessage(error) != null;
}

export function unknownHostKeyMessage(error) {
  const message = String(error?.message || error || "").trim();
  return /unknown server key/i.test(message) ? message : null;
}

export function buildUnknownHostKeyPrompt(host, error) {
  const target = unknownHostKeyTarget(error) || formatHostKeyTarget(host);
  const message = unknownHostKeyMessage(error) || String(error?.message || error || "").trim();
  return `首次连接 ${target}\n\n${message}\n\n确认信任此主机指纹并写入 known_hosts?`;
}

export function markAuthTrustedForUnknownHostKey(auth) {
  if (!auth) return auth;
  return { ...auth, trustUnknownHostKey: true };
}

export function shouldTrustUnknownHostKeyByDefault(auth) {
  return auth?.trustUnknownHostKey ?? false;
}

export function unknownHostKeyTarget(error) {
  const message = unknownHostKeyMessage(error);
  if (!message) return null;
  const match = message.match(/unknown server key for\s+(.+?)(?:\s+\(|$)/i);
  return normalizeHostKeyTargetText(match?.[1]) || null;
}

export function formatHostKeyTarget(host) {
  const name = String(host?.host || host?.name || "").trim() || "unknown-host";
  const port = Number(host?.port) || 22;
  const address = bracketIpv6Address(name);
  return `${address}:${port}`;
}

function normalizeHostKeyTargetText(target) {
  const text = String(target || "").trim();
  if (!text) return "";
  const bracketed = text.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracketed) return `[${bracketed[1]}]:${bracketed[2]}`;
  const lastColon = text.lastIndexOf(":");
  if (lastColon > -1) {
    const host = text.slice(0, lastColon);
    const port = text.slice(lastColon + 1);
    if (/^\d+$/.test(port)) {
      return `${bracketIpv6Address(host)}:${Number(port) || 22}`;
    }
  }
  return bracketIpv6Address(text);
}

function bracketIpv6Address(host) {
  const text = String(host || "").trim();
  if (text.includes(":") && !text.startsWith("[")) return `[${text}]`;
  return text;
}
