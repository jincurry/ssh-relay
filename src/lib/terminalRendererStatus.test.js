import { describe, expect, it } from "vitest";
import { buildTerminalRendererStatus } from "./terminalRendererStatus.js";

describe("terminalRendererStatus", () => {
  it("labels browser preview mode without implying an xterm renderer", () => {
    expect(buildTerminalRendererStatus(null, { runtime: false })).toEqual({
      tone: "muted",
      label: "终端预览",
      title: "浏览器预览终端; xterm 渲染器只会在 Tauri 桌面端创建。",
    });
  });

  it("labels pending runtime renderer initialization", () => {
    expect(buildTerminalRendererStatus(null, { runtime: true })).toEqual({
      tone: "pending",
      label: "渲染器检测中",
      title: "正在等待 xterm 渲染器初始化。",
    });
  });

  it("labels WebGL renderer status", () => {
    expect(buildTerminalRendererStatus({
      renderer: "webgl",
      rendererMessage: "WebGL renderer enabled",
      webglEnabled: true,
    })).toEqual({
      tone: "ok",
      label: "WebGL 渲染",
      title: "WebGL 渲染器已启用。",
    });
  });

  it("labels Canvas fallback renderer status", () => {
    expect(buildTerminalRendererStatus({
      renderer: "canvas",
      rendererMessage: "WebGL renderer unavailable; using Canvas fallback: disabled",
      webglEnabled: false,
    })).toEqual({
      tone: "warn",
      label: "Canvas 降级",
      title: "WebGL 渲染器不可用,已降级为 Canvas: 已禁用",
    });
  });

  it("keeps localized renderer messages unchanged", () => {
    expect(buildTerminalRendererStatus({
      renderer: "canvas",
      rendererMessage: "WebGL 渲染器不可用,已降级为 Canvas: WebGL 已禁用",
      webglEnabled: false,
    })).toEqual({
      tone: "warn",
      label: "Canvas 降级",
      title: "WebGL 渲染器不可用,已降级为 Canvas: WebGL 已禁用",
    });
  });
});
