import { describe, expect, it } from "vitest";
import { buildPaletteChromeDisplay, buildPaletteStatusMessage, getPaletteActionGuard, getPaletteActionHint } from "./paletteActions.js";

describe("paletteActions", () => {
  it("allows copy actions regardless of host reachability", () => {
    expect(getPaletteActionGuard({ status: "offline" }, "copy")).toEqual({ ok: true, message: "" });
  });

  it("blocks connecting to offline hosts with an explicit message", () => {
    expect(getPaletteActionGuard({ status: "offline" }, "connect")).toEqual({
      ok: false,
      message: "离线主机不可连接",
    });
  });

  it("blocks SFTP for offline hosts with an explicit message", () => {
    expect(getPaletteActionGuard({ status: "offline" }, "sftp")).toEqual({
      ok: false,
      message: "离线主机不可打开 SFTP",
    });
  });

  it("returns selected-row hints that reflect disabled connect actions", () => {
    expect(getPaletteActionHint({ status: "online" }, true)).toEqual({ text: "↵ 连接", tone: "neutral" });
    expect(getPaletteActionHint({ status: "offline" }, true)).toEqual({ text: "离线主机不可连接", tone: "error" });
    expect(getPaletteActionHint({ status: "online" }, false)).toEqual({ text: "", tone: "neutral" });
  });

  it("builds explicit palette status messages without text parsing", () => {
    expect(buildPaletteStatusMessage("SSH 命令已复制")).toEqual({ text: "SSH 命令已复制", tone: "success" });
    expect(buildPaletteStatusMessage("  离线主机不可连接  ", "error")).toEqual({ text: "离线主机不可连接", tone: "error" });
    expect(buildPaletteStatusMessage("复制失败,当前环境不允许访问剪贴板", "warn")).toEqual({
      text: "复制失败,当前环境不允许访问剪贴板",
      tone: "success",
    });
  });

  it("builds command-palette chrome display metadata with platform shortcuts", () => {
    expect(buildPaletteChromeDisplay({ platform: "MacIntel" })).toEqual({
      inputPlaceholder: "输入主机名、IP 或标签,回车直接连接…",
      escapeKey: "esc",
      emptyResultsText: "没有匹配的主机 — 输入 user@host 可直接发起新连接",
      shortcuts: [
        { key: "↵", label: "连接" },
        { key: "↑↓", label: "选择" },
        { key: "⌘C", label: "复制 ssh 命令" },
        { key: "⌘F", label: "SFTP 打开" },
      ],
    });

    expect(buildPaletteChromeDisplay({ platform: "Linux x86_64" }).shortcuts.slice(2)).toEqual([
      { key: "Ctrl+C", label: "复制 ssh 命令" },
      { key: "Ctrl+F", label: "SFTP 打开" },
    ]);
  });
});
