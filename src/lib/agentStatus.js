export function buildSshAgentStatusDisplay(agentStatus = {}) {
  const status = normalizeAgentStatus(agentStatus?.status);
  const identityCount = normalizeIdentityCount(agentStatus?.identityCount);

  return {
    status,
    label: getAgentStatusLabel(status, identityCount),
    tone: getAgentStatusTone(status),
    title: buildAgentStatusTitle(agentStatus),
    identityCount,
  };
}

function normalizeAgentStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return value || "unknown";
}

function normalizeIdentityCount(identityCount) {
  const value = Number(identityCount);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function getAgentStatusLabel(status, identityCount) {
  if (status === "ready") return `密钥代理就绪(${identityCount})`;
  if (status === "empty") return "密钥代理空";
  if (status === "missing") return "未发现密钥代理";
  if (status === "preview") return "密钥代理预览";
  if (status === "checking") return "检测密钥代理";
  return "密钥代理异常";
}

function getAgentStatusTone(status) {
  if (status === "ready" || status === "preview") return "success";
  if (status === "error") return "error";
  return "pending";
}

function buildAgentStatusTitle(agentStatus) {
  return [
    String(agentStatus?.message || "").trim(),
    agentStatus?.socket ? `SSH_AUTH_SOCK=${String(agentStatus.socket).trim()}` : "",
  ].filter(Boolean).join("\n");
}
