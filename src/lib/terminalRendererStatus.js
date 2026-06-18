export function buildTerminalRendererStatus(rendererInfo, { runtime = true } = {}) {
  if (!runtime) {
    return {
      tone: "muted",
      label: "终端预览",
      title: "浏览器预览终端; xterm 渲染器只会在 Tauri 桌面端创建。",
    };
  }

  if (!rendererInfo) {
    return {
      tone: "pending",
      label: "渲染器检测中",
      title: "正在等待 xterm 渲染器初始化。",
    };
  }

  if (rendererInfo.renderer === "webgl" || rendererInfo.webglEnabled) {
    return {
      tone: "ok",
      label: "WebGL 渲染",
      title: localizeRendererStatusMessage(rendererInfo.message || rendererInfo.rendererMessage || "WebGL 渲染器已启用。"),
    };
  }

  return {
    tone: "warn",
    label: "Canvas 降级",
    title: localizeRendererStatusMessage(rendererInfo.message || rendererInfo.rendererMessage || "WebGL 渲染器不可用,已降级为 Canvas。"),
  };
}

function localizeRendererStatusMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (/^WebGL renderer enabled\.?$/i.test(text)) return "WebGL 渲染器已启用。";
  const fallback = text.match(/^WebGL renderer unavailable;\s*using Canvas fallback(?::\s*(.*))?\.?$/i);
  if (fallback) {
    const reason = localizeRendererReason(fallback[1]);
    return `WebGL 渲染器不可用,已降级为 Canvas${reason ? `: ${reason}` : "。"}`;
  }
  if (/^Canvas renderer fallback is active\.?$/i.test(text)) return "Canvas 渲染器降级已启用。";
  return text;
}

function localizeRendererReason(reason) {
  const text = String(reason || "").trim().replace(/\.$/, "");
  if (!text) return "";
  if (/webgl disabled/i.test(text)) return "WebGL 已禁用";
  if (/disabled/i.test(text)) return "已禁用";
  return text;
}
