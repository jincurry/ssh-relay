import { describe, expect, it } from "vitest";
import { buildSessionStatusBadge } from "./sessionStatusBadge.js";

describe("sessionStatusBadge", () => {
  it("builds main SSH session badge labels", () => {
    expect(buildSessionStatusBadge("connected", { kind: "ssh-main" })).toMatchObject({
      text: "russh 已连接",
      tone: "success",
      borderTone: "success",
      mode: "connected",
    });
    expect(buildSessionStatusBadge("error", { kind: "ssh-main", error: "auth failed" })).toMatchObject({
      text: "连接失败",
      title: "auth failed",
      tone: "error",
      borderTone: "error",
    });
    expect(buildSessionStatusBadge("connecting", { kind: "ssh-main" })).toMatchObject({
      text: "连接中",
      tone: "pending",
      borderTone: "neutral",
    });
    expect(buildSessionStatusBadge("preview", { kind: "ssh-main" })).toMatchObject({
      text: "预览模式",
      tone: "pending",
    });
  });

  it("builds prefixed split SSH session badge labels", () => {
    expect(buildSessionStatusBadge("connected", { prefix: "拆分" })).toMatchObject({
      text: "拆分 已连接",
      tone: "success",
    });
    expect(buildSessionStatusBadge("error", { prefix: "拆分", error: "split failed" })).toMatchObject({
      text: "拆分 失败",
      title: "split failed",
      tone: "error",
    });
    expect(buildSessionStatusBadge("connecting", { prefix: "拆分" })).toMatchObject({
      text: "拆分 连接中",
      tone: "pending",
    });
    expect(buildSessionStatusBadge("preview", { prefix: "拆分" })).toMatchObject({
      text: "拆分 预览",
      tone: "pending",
    });
  });

  it("builds PTY session badge labels", () => {
    expect(buildSessionStatusBadge("connected", { kind: "pty" })).toMatchObject({
      text: "pty 已连接",
      tone: "success",
      borderTone: "success",
    });
    expect(buildSessionStatusBadge("error", { kind: "pty", error: "shell unavailable" })).toMatchObject({
      text: "pty 失败",
      title: "shell unavailable",
      tone: "error",
      borderTone: "error",
    });
    expect(buildSessionStatusBadge("connecting", { kind: "pty" })).toMatchObject({
      text: "pty 启动中",
      tone: "pending",
    });
    expect(buildSessionStatusBadge("preview", { kind: "pty" })).toMatchObject({
      text: "预览模式",
      tone: "pending",
    });
  });

  it("falls back unknown modes to preview", () => {
    expect(buildSessionStatusBadge("stale", { prefix: "拆分", error: "  " })).toEqual({
      text: "拆分 预览",
      title: "",
      tone: "pending",
      borderTone: "neutral",
      mode: "preview",
    });
  });
});
