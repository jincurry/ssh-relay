import { describe, expect, it, vi } from "vitest";
import { applyStartedForwardRuntime, buildSessionForwardBadge, createForwardStartRequest, getEnabledForwardRules, getForwardRulesSignature, startForwardRule } from "./sessionForwards.js";

describe("sessionForwards", () => {
  const ssh = { host: "example.com", user: "deploy" };

  it("selects enabled rules and builds a stable signature", () => {
    const rules = [
      { id: 1, type: "L", lport: "15432", rhost: "db", rport: "5432", on: true },
      { id: 2, type: "D", lport: "1080", on: false },
      { id: 3, type: "R", lport: "8080", rhost: "127.0.0.1", rport: "18080", on: true },
    ];

    expect(getEnabledForwardRules(rules).map(rule => rule.id)).toEqual([1, 3]);
    expect(getForwardRulesSignature(rules)).toBe("1:L:15432:db:5432|3:R:8080:127.0.0.1:18080");
  });

  it("maps local, remote, and dynamic rules to runtime start requests", () => {
    expect(createForwardStartRequest({ type: "L", lport: "15432", rhost: "db", rport: "5432" }, ssh)).toEqual({
      kind: "L",
      args: { bindPort: 15432, targetHost: "db", targetPort: 5432, ssh },
    });
    expect(createForwardStartRequest({ type: "R", lport: "8080", rhost: "127.0.0.1", rport: "18080" }, ssh)).toEqual({
      kind: "R",
      args: { bindPort: 18080, targetHost: "127.0.0.1", targetPort: 8080, ssh },
    });
    expect(createForwardStartRequest({ type: "D", lport: "1086" }, ssh)).toEqual({
      kind: "D",
      args: { bindPort: 1086, ssh },
    });
  });

  it("normalizes rule fields before building signatures and start requests", () => {
    const rules = [{ id: " f1 ", type: " l ", lport: " 15432 ", rhost: " db.internal ", rport: " 5432 ", on: true }];

    expect(getForwardRulesSignature(rules)).toBe("f1:L:15432:db.internal:5432");
    expect(createForwardStartRequest(rules[0], ssh)).toEqual({
      kind: "L",
      args: { bindPort: 15432, targetHost: "db.internal", targetPort: 5432, ssh },
    });
  });

  it("dispatches to the matching bridge starter", async () => {
    const starters = {
      startLocalForward: vi.fn().mockResolvedValue({ id: "local", bindPort: 15432 }),
      startRemoteForward: vi.fn().mockResolvedValue({ id: "remote", bindPort: 18080 }),
      startDynamicForward: vi.fn().mockResolvedValue({ id: "dynamic", bindPort: 1086 }),
    };

    await expect(startForwardRule({ type: "L", lport: "15432", rhost: "db", rport: "5432" }, ssh, starters)).resolves.toMatchObject({ id: "local" });
    await expect(startForwardRule({ type: "R", lport: "8080", rhost: "127.0.0.1", rport: "18080" }, ssh, starters)).resolves.toMatchObject({ id: "remote" });
    await expect(startForwardRule({ type: "D", lport: "1086" }, ssh, starters)).resolves.toMatchObject({ id: "dynamic" });

    expect(starters.startLocalForward).toHaveBeenCalledOnce();
    expect(starters.startRemoteForward).toHaveBeenCalledOnce();
    expect(starters.startDynamicForward).toHaveBeenCalledOnce();
  });

  it("applies runtime ids and assigned bind ports back to rules", () => {
    expect(applyStartedForwardRuntime({ type: "L" }, { id: "l1", bindPort: 15432 })).toMatchObject({
      on: true,
      busy: false,
      runtimeId: "l1",
      lport: "15432",
      error: null,
    });
    expect(applyStartedForwardRuntime({ type: "R" }, { id: "r1", bindPort: 18080 })).toMatchObject({
      on: true,
      busy: false,
      runtimeId: "r1",
      rport: "18080",
      error: null,
    });
  });

  it("normalizes rule type before writing assigned runtime ports", () => {
    expect(applyStartedForwardRuntime({ type: " r " }, { id: "r2", bindPort: 18081 })).toMatchObject({
      runtimeId: "r2",
      rport: "18081",
    });
    expect(applyStartedForwardRuntime({ type: " d " }, { id: "d1", bindPort: 1087 })).toMatchObject({
      runtimeId: "d1",
      lport: "1087",
    });
  });

  it("rejects invalid rules before dispatch", () => {
    expect(() => createForwardStartRequest({ type: "L", lport: "bad", rhost: "db", rport: "5432" }, ssh)).toThrow("本地监听端口");
    expect(() => createForwardStartRequest({ type: "X", lport: "15432", rhost: "db", rport: "5432" }, ssh)).toThrow("不支持的转发类型");
  });

  it("builds session auto-forward badge display state", () => {
    expect(buildSessionForwardBadge({ state: "idle", total: 0 })).toEqual({
      visible: false,
      text: "",
      title: "",
      tone: "neutral",
      borderTone: "neutral",
    });

    expect(buildSessionForwardBadge({ state: "preview", total: 3, message: "桌面端自动建立" })).toMatchObject({
      visible: true,
      text: "转发预览 3",
      title: "桌面端自动建立",
      tone: "pending",
      borderTone: "neutral",
    });

    expect(buildSessionForwardBadge({ state: "starting", total: 3, started: 1 })).toMatchObject({
      text: "转发 1/3",
      tone: "pending",
    });

    expect(buildSessionForwardBadge({
      state: "partial",
      total: 3,
      started: 2,
      message: "转发自动建立失败 1 条",
      errors: ["L 15432: bind failed", "", null],
    })).toMatchObject({
      text: "转发异常 2/3",
      title: "转发自动建立失败 1 条\nL 15432: bind failed",
      tone: "error",
      borderTone: "error",
    });

    expect(buildSessionForwardBadge({ state: "ready", total: 2, started: 99 })).toMatchObject({
      text: "转发 2/2",
      tone: "success",
      borderTone: "neutral",
    });
  });
});
