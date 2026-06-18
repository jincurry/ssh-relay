const VALID_PROBE_STATUSES = new Set(["online", "offline"]);

export function mergeHostProbeResults(hosts, results, { historyLimit = 8 } = {}) {
  const byId = new Map((Array.isArray(results) ? results : []).map(result => [String(result?.id), result]));
  return (Array.isArray(hosts) ? hosts : []).map(host => {
    const result = byId.get(String(host?.id));
    if (!result) return host;
    const latency = normalizeLatency(result.latencyMs);
    const history = normalizeLatencyHistory(host?.lat, historyLimit);
    return {
      ...host,
      status: normalizeProbeStatus(result.status),
      lat: latency == null ? history : [...history.slice(-(historyLimit - 1)), latency],
      probeError: String(result.error || "").trim() || null,
    };
  });
}

export function buildHostProbeSummary(results = []) {
  const items = Array.isArray(results) ? results : [];
  if (!items.length) {
    return {
      text: "",
      tone: "neutral",
      online: 0,
      offline: 0,
      total: 0,
      title: "",
    };
  }

  const normalized = items.map(result => ({
    ...result,
    status: normalizeProbeStatus(result?.status),
    error: String(result?.error || "").trim(),
  }));
  const online = normalized.filter(result => result.status === "online").length;
  const offline = normalized.length - online;
  const title = normalized
    .map(result => {
      const label = String(result?.host || result?.name || result?.id || "未知主机").trim();
      const status = result.status === "online" ? "在线" : "离线";
      return [label, status, result.error].filter(Boolean).join(" · ");
    })
    .join("\n");

  return {
    text: `${online}/${normalized.length} 在线`,
    tone: online === normalized.length ? "success" : online > 0 ? "pending" : "error",
    online,
    offline,
    total: normalized.length,
    title,
  };
}

function normalizeProbeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return VALID_PROBE_STATUSES.has(value) ? value : "offline";
}

function normalizeLatency(latencyMs) {
  if (latencyMs == null) return null;
  const value = Number(latencyMs);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.max(1, Math.round(value));
}

function normalizeLatencyHistory(history, limit) {
  return (Array.isArray(history) ? history : [])
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value >= 0)
    .slice(-limit);
}
