export const DEFAULT_MONITOR_SAMPLE = {
  cpu: 32,
  memory: 31,
  disk: 58,
  networkDownMbps: 7,
  load: "0.42",
  uptime: "47d 0h",
  os: "浏览器预览",
  processes: 183,
};

export const DEFAULT_MONITOR_HISTORY = {
  cpu: [32, 35, 30, 38, 34],
  networkDownMbps: [4, 6, 5, 8, 7],
};

export function normalizeMonitorSample(sample, fallback = DEFAULT_MONITOR_SAMPLE) {
  const base = fallback || DEFAULT_MONITOR_SAMPLE;
  return {
    cpu: normalizePercent(sample?.cpu, base.cpu),
    memory: normalizePercent(sample?.memory, base.memory),
    disk: normalizePercent(sample?.disk, base.disk),
    networkDownMbps: normalizeNonNegativeNumber(sample?.networkDownMbps, base.networkDownMbps),
    load: normalizeText(sample?.load, base.load),
    uptime: normalizeText(sample?.uptime, base.uptime),
    os: normalizeText(sample?.os, base.os),
    processes: normalizeNonNegativeInteger(sample?.processes, base.processes),
  };
}

export function appendMonitorHistory(history, value, limit = 20) {
  const next = normalizeNonNegativeNumber(value, 0);
  return [...(Array.isArray(history) ? history : []).slice(-(limit - 1)), next];
}

export function buildMonitorPanelDisplay({
  sample = DEFAULT_MONITOR_SAMPLE,
  cpuHistory = DEFAULT_MONITOR_HISTORY.cpu,
  networkHistory = DEFAULT_MONITOR_HISTORY.networkDownMbps,
} = {}) {
  const normalizedSample = normalizeMonitorSample(sample);
  const normalizedCpuHistory = normalizeMonitorHistory(cpuHistory, normalizedSample.cpu);
  const normalizedNetworkHistory = normalizeMonitorHistory(networkHistory, normalizedSample.networkDownMbps);
  const cpu = normalizedCpuHistory.at(-1) ?? normalizedSample.cpu;
  const network = normalizedNetworkHistory.at(-1) ?? normalizedSample.networkDownMbps;

  return {
    panelTitle: "实时监控",
    sample: normalizedSample,
    meters: [
      { key: "cpu", label: "CPU", value: cpu, suffix: "%", colorKey: cpu > 70 ? "red" : "green" },
      { key: "memory", label: "内存", value: normalizedSample.memory, suffix: "%", colorKey: "blue" },
      { key: "disk", label: "磁盘 /", value: normalizedSample.disk, suffix: "%", colorKey: "amber" },
    ],
    network: {
      label: "网络",
      rateLabel: `↓${formatMonitorRate(network)} MB/s`,
      data: normalizedNetworkHistory,
      colorKey: "green",
    },
    cpuTrend: {
      label: "CPU 趋势",
      data: normalizedCpuHistory,
      colorKey: "amber",
    },
    footerLine: `负载 ${normalizedSample.load} · 进程 ${normalizedSample.processes}`,
    footerDetail: `运行 ${normalizedSample.uptime} · ${normalizedSample.os}`,
  };
}

function normalizePercent(value, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return normalizePercent(fallback, 0);
  return Math.min(100, Math.max(0, Math.round(next)));
}

function normalizeNonNegativeNumber(value, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return normalizeNonNegativeNumber(fallback, 0);
  return Math.max(0, next);
}

function normalizeNonNegativeInteger(value, fallback) {
  return Math.round(normalizeNonNegativeNumber(value, fallback));
}

function normalizeText(value, fallback) {
  const next = String(value || "").trim();
  return next || String(fallback || "").trim();
}

function normalizeMonitorHistory(history, fallback) {
  const source = Array.isArray(history) && history.length ? history : [fallback];
  return source.slice(-20).map(value => normalizeNonNegativeNumber(value, fallback));
}

function formatMonitorRate(value) {
  return normalizeNonNegativeNumber(value, 0).toFixed(1);
}
