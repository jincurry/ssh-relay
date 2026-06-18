import { normalizeForwardRule, validateForwardRule } from "./forwardRules.js";

export function getEnabledForwardRules(forwards = []) {
  return (Array.isArray(forwards) ? forwards : []).filter(rule => rule?.on);
}

export function getForwardRulesSignature(forwards = []) {
  return getEnabledForwardRules(forwards)
    .map(rule => {
      const normalized = normalizeForwardRule(rule);
      return [normalized.id, normalized.type, normalized.lport, normalized.rhost, normalized.rport].map(value => String(value ?? "")).join(":");
    })
    .join("|");
}

export function createForwardStartRequest(rule, ssh) {
  const normalized = normalizeForwardRule(rule);
  const validation = validateForwardRule(normalized);
  if (!validation.ok) throw new Error(validation.message);

  if (normalized.type === "D") {
    return {
      kind: "D",
      args: {
        bindPort: Number(normalized.lport),
        ssh,
      },
    };
  }

  if (normalized.type === "R") {
    return {
      kind: "R",
      args: {
        bindPort: Number(normalized.rport),
        targetHost: normalized.rhost || "127.0.0.1",
        targetPort: Number(normalized.lport),
        ssh,
      },
    };
  }

  return {
    kind: "L",
    args: {
      bindPort: Number(normalized.lport),
      targetHost: normalized.rhost,
      targetPort: Number(normalized.rport),
      ssh,
    },
  };
}

export async function startForwardRule(rule, ssh, starters) {
  const request = createForwardStartRequest(rule, ssh);
  if (request.kind === "D") return starters.startDynamicForward(request.args);
  if (request.kind === "R") return starters.startRemoteForward(request.args);
  return starters.startLocalForward(request.args);
}

export function applyStartedForwardRuntime(rule, started) {
  const normalized = normalizeForwardRule(rule);
  return {
    on: true,
    busy: false,
    runtimeId: started.id,
    ...(normalized.type === "R" ? { rport: String(started.bindPort) } : { lport: String(started.bindPort) }),
    error: null,
  };
}

export function buildSessionForwardBadge(status = {}) {
  const total = Math.max(0, Number(status.total) || 0);
  const started = Math.max(0, Math.min(Number(status.started) || 0, total));
  const state = normalizeForwardBadgeState(status.state);
  const title = [status.message, ...(Array.isArray(status.errors) ? status.errors : [])]
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .join("\n");

  if (!total) {
    return {
      visible: false,
      text: "",
      title,
      tone: "neutral",
      borderTone: "neutral",
    };
  }

  if (state === "ready") {
    return {
      visible: true,
      text: `转发 ${started}/${total}`,
      title,
      tone: "success",
      borderTone: "neutral",
    };
  }

  if (state === "partial") {
    return {
      visible: true,
      text: `转发异常 ${started}/${total}`,
      title,
      tone: "error",
      borderTone: "error",
    };
  }

  if (state === "preview") {
    return {
      visible: true,
      text: `转发预览 ${total}`,
      title,
      tone: "pending",
      borderTone: "neutral",
    };
  }

  return {
    visible: true,
    text: `转发 ${started}/${total}`,
    title,
    tone: "pending",
    borderTone: "neutral",
  };
}

function normalizeForwardBadgeState(state) {
  const value = String(state || "").trim().toLowerCase();
  if (value === "ready" || value === "partial" || value === "preview" || value === "waiting" || value === "starting") return value;
  return "idle";
}
