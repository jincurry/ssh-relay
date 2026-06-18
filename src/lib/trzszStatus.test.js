import { describe, expect, it } from "vitest";
import { buildTrzszCompletionLine, buildTrzszDragOverlayDisplay, buildTrzszNegotiationLine, getTrzszRouteInfo } from "./trzszStatus.js";

describe("trzszStatus", () => {
  it("labels direct transfer routes", () => {
    expect(getTrzszRouteInfo({ name: "prod-web" })).toEqual({
      summary: "直连",
      title: "本机 -> prod-web",
    });
    expect(buildTrzszNegotiationLine({ name: "prod-web" })).toBe("trzsz 协商成功 · 二进制模式 · 压缩传输 · 直连");
  });

  it("labels jump-host transfer routes", () => {
    expect(getTrzszRouteInfo({
      chain: ["bastion-sh", "relay-db"],
      name: "prod-db",
    })).toEqual({
      summary: "2 跳",
      title: "本机 -> bastion-sh -> relay-db -> prod-db",
    });
  });

  it("labels structured jump-host transfer routes", () => {
    expect(getTrzszRouteInfo({
      chain: ["bastion-sh"],
      jumpHosts: [{ name: "bastion-sh", host: "203.0.113.10", user: "ops", port: 2222 }],
      name: "prod-web",
    })).toEqual({
      summary: "1 跳",
      title: "本机 -> ops@203.0.113.10:2222 -> prod-web",
    });
  });

  it("labels proxy and jump-host transfer routes together", () => {
    expect(getTrzszRouteInfo({
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080" },
      chain: ["bastion-sh"],
      name: "prod-web",
    })).toEqual({
      summary: "经出口代理 · 1 跳",
      title: "本机 -> SOCKS5 127.0.0.1:1080 -> bastion-sh -> prod-web",
    });
  });

  it("builds completion lines with route labels", () => {
    expect(buildTrzszCompletionLine({
      name: "access.log",
      sizeLabel: "2.0 MB",
      direction: "down",
      routeInfo: { summary: "经出口代理 · 1 跳" },
    })).toBe("下载完成:access.log(2.0 MB) · 经出口代理 · 1 跳 · trzsz 校验通过 ✓");
  });

  it("builds drag overlay display metadata for upload drops", () => {
    expect(buildTrzszDragOverlayDisplay()).toEqual({
      visible: false,
      icon: "⇡",
      title: "释放文件,经 trz 上传到当前窗格",
      detail: "兼容 tmux · 支持目录与断点续传",
      tone: "pending",
    });
    expect(buildTrzszDragOverlayDisplay({ active: true, paneLabel: "拆分会话" })).toEqual({
      visible: true,
      icon: "⇡",
      title: "释放文件,经 trz 上传到拆分会话",
      detail: "兼容 tmux · 支持目录与断点续传",
      tone: "pending",
    });
  });
});
