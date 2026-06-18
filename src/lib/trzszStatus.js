import { describeConnectionPath, summarizeConnectionPath } from "./connectionPath.js";

export function getTrzszRouteInfo(host = {}) {
  const input = {
    chain: host.chain,
    jumpHosts: host.jumpHosts,
    name: host.name || host.host,
    proxy: host.proxy,
  };
  return {
    summary: summarizeConnectionPath(input),
    title: describeConnectionPath(input),
  };
}

export function buildTrzszNegotiationLine(host = {}) {
  const route = getTrzszRouteInfo(host);
  return `trzsz 协商成功 · 二进制模式 · 压缩传输 · ${route.summary}`;
}

export function buildTrzszCompletionLine({ name, sizeLabel, direction, routeInfo } = {}) {
  const verb = direction === "up" ? "上传" : "下载";
  const route = routeInfo?.summary || "直连";
  const suffix = sizeLabel ? `(${sizeLabel})` : "";
  return `${verb}完成:${name || "未命名"}${suffix} · ${route} · trzsz 校验通过 ✓`;
}

export function buildTrzszDragOverlayDisplay({ active = false, paneLabel = "当前窗格" } = {}) {
  const target = String(paneLabel || "").trim() || "当前窗格";
  return {
    visible: Boolean(active),
    icon: "⇡",
    title: `释放文件,经 trz 上传到${target}`,
    detail: "兼容 tmux · 支持目录与断点续传",
    tone: "pending",
  };
}
