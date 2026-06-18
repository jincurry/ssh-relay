import { describe, expect, it } from "vitest";
import { buildForwardDeleteConfirmation, buildForwardRuleDisplay, buildForwardRuleFieldDisplay, buildForwardTypeCreateOptions, createForwardRule, describeForwardRule, normalizeForwardRule, validateForwardRule } from "./forwardRules.js";

describe("forwardRules", () => {
  it("creates sensible defaults for each rule type", () => {
    expect(createForwardRule("L", 1)).toMatchObject({ id: 1, type: "L", lport: "8080", rhost: "127.0.0.1", rport: "80" });
    expect(createForwardRule("R", 2)).toMatchObject({ id: 2, type: "R", lport: "8080", rport: "18080" });
    expect(createForwardRule("D", 3)).toMatchObject({ id: 3, type: "D", lport: "1080", rhost: "", rport: "" });
  });

  it("validates ports and target host", () => {
    expect(validateForwardRule({ type: "L", lport: "15432", rhost: "db", rport: "5432" })).toEqual({ ok: true });
    expect(validateForwardRule({ type: " l ", lport: " 15432 ", rhost: " db ", rport: " 5432 " })).toEqual({ ok: true });
    expect(validateForwardRule({ type: "L", lport: "15432", rhost: "", rport: "5432" })).toMatchObject({ ok: false, message: "目标主机不能为空" });
    expect(validateForwardRule({ type: "D", lport: "99999" })).toMatchObject({ ok: false, message: "本地监听端口必须是 1-65535 之间的整数" });
    expect(validateForwardRule({ type: "R", lport: "8080", rport: "0" })).toMatchObject({ ok: false, message: "远端监听端口必须是 1-65535 之间的整数" });
    expect(validateForwardRule({ type: "R", lport: "bad", rport: "18080" })).toMatchObject({ ok: false, message: "本地目标端口必须是 1-65535 之间的整数" });
    expect(validateForwardRule({ type: "X", lport: "8080", rhost: "db", rport: "80" })).toMatchObject({ ok: false, message: "不支持的转发类型: X" });
  });

  it("normalizes persisted rule fields and fallback ids", () => {
    expect(normalizeForwardRule({
      id: "  ",
      type: " r ",
      lport: " 8080 ",
      rhost: " app.internal ",
      rport: " 18080 ",
      on: 1,
      runtimeId: "old",
    }, { fallbackId: " saved-1 " })).toEqual({
      id: "saved-1",
      type: "R",
      lport: "8080",
      rhost: "app.internal",
      rport: "18080",
      on: true,
    });

    expect(normalizeForwardRule({ type: "D", lport: " 1080 ", rhost: "ignored", rport: "ignored" }))
      .toMatchObject({ type: "D", lport: "1080", rhost: "", rport: "" });
  });

  it("describes rules for compact UI display", () => {
    expect(describeForwardRule({ type: "D", lport: "1086" })).toBe("SOCKS5 localhost:1086");
    expect(describeForwardRule({ type: " l ", lport: " 5432 ", rhost: " db ", rport: " 5432 " })).toBe("localhost:5432 -> db:5432");
    expect(describeForwardRule({ type: " r ", lport: " 8080 ", rhost: " app.internal ", rport: " 18080 " })).toBe("remote:18080 -> app.internal:8080");
    expect(describeForwardRule({ type: "R", lport: "8080", rhost: "app.internal", rport: "18080" })).toBe("remote:18080 -> app.internal:8080");
    expect(describeForwardRule({ type: "R", lport: "8080", rport: "18080" })).toBe("remote:18080 -> 127.0.0.1:8080");
    expect(describeForwardRule({ type: "L", lport: "5432", rhost: "db", rport: "5432" })).toBe("localhost:5432 -> db:5432");
    expect(describeForwardRule({ type: "X" })).toBe("不支持的转发: X");
  });

  it("builds a delete confirmation for stopped and active rules", () => {
    expect(buildForwardDeleteConfirmation({ type: "L", lport: "15432", rhost: "db", rport: "5432" }))
      .toBe("删除端口转发规则?\n\nlocalhost:15432 -> db:5432");
    expect(buildForwardDeleteConfirmation({ type: "D", lport: "1086", on: true }))
      .toContain("RELAY 会先停止当前监听器");
    expect(buildForwardDeleteConfirmation({ type: "R", lport: "8080", rport: "18080", runtimeId: "live" }))
      .toContain("remote:18080 -> 127.0.0.1:8080");
  });

  it("builds config-row display metadata for forwarding rules", () => {
    expect(buildForwardRuleDisplay({ type: "L", lport: "15432", rhost: "db", rport: "5432" })).toMatchObject({
      type: "L",
      typeName: "本地转发",
      typeBadge: "-L 本地转发",
      colorKey: "green",
      description: "localhost:15432 -> db:5432",
      opacity: 0.55,
      activeVisible: false,
      runtimeVisible: false,
      toggleText: "已停用",
      toggleTone: "neutral",
      toggleDisabled: false,
      deleteDisabled: false,
      supported: true,
    });

    expect(buildForwardRuleDisplay({ type: "R", lport: "8080", rhost: "app.internal", rport: "18080", on: true, runtimeId: "live" })).toMatchObject({
      typeName: "远程转发",
      colorKey: "blue",
      description: "remote:18080 -> app.internal:8080",
      opacity: 1,
      activeVisible: true,
      runtimeVisible: true,
      runtimeLabel: "runtime",
      toggleText: "已启用",
      toggleTone: "success",
    });

    expect(buildForwardRuleDisplay({ type: "D", lport: "1086", busy: true })).toMatchObject({
      typeName: "动态 SOCKS",
      colorKey: "amber",
      description: "SOCKS5 localhost:1086",
      toggleText: "处理中",
      toggleDisabled: true,
      deleteDisabled: true,
    });

    expect(buildForwardRuleDisplay({ type: "X", lport: "8080" })).toMatchObject({
      type: "X",
      typeName: "未知转发",
      typeBadge: "-X 未知转发",
      colorKey: "red",
      description: "不支持的转发: X",
      toggleDisabled: true,
      deleteDisabled: false,
      supported: false,
    });
  });

  it("builds config-row field metadata for forwarding rules", () => {
    expect(buildForwardRuleFieldDisplay({ type: "L", lport: "15432", rhost: "db", rport: "5432" })).toEqual({
      type: "L",
      sourcePrefix: "localhost:",
      sourcePortValue: "15432",
      sourcePortPatchKey: "lport",
      sourcePortTitle: "本地监听端口",
      arrowPoints: "32,5 26,2 26,8",
      showDynamicTarget: false,
      dynamicTargetLabel: "任意目标(SOCKS5)",
      showTargetFields: true,
      targetHostValue: "db",
      targetHostPatchKey: "rhost",
      targetHostTitle: "目标主机",
      targetPortValue: "5432",
      targetPortPatchKey: "rport",
      targetPortTitle: "目标端口",
    });

    expect(buildForwardRuleFieldDisplay({ type: " r ", lport: " 8080 ", rhost: "", rport: " 18080 " })).toMatchObject({
      type: "R",
      sourcePrefix: "remote:",
      sourcePortValue: "18080",
      sourcePortPatchKey: "rport",
      sourcePortTitle: "远端监听端口",
      arrowPoints: "2,5 8,2 8,8",
      showTargetFields: true,
      targetHostValue: "127.0.0.1",
      targetPortValue: "8080",
      targetPortPatchKey: "lport",
      targetPortTitle: "本地目标端口",
    });

    expect(buildForwardRuleFieldDisplay({ type: "D", lport: "1086" })).toMatchObject({
      type: "D",
      sourcePrefix: "localhost:",
      sourcePortValue: "1086",
      showDynamicTarget: true,
      showTargetFields: false,
      dynamicTargetLabel: "任意目标(SOCKS5)",
    });
  });

  it("builds forward type create-button metadata", () => {
    expect(buildForwardTypeCreateOptions()).toEqual([
      { type: "L", name: "本地转发", label: "＋ 本地转发", colorKey: "green", supported: true },
      { type: "R", name: "远程转发", label: "＋ 远程转发", colorKey: "blue", supported: true },
      { type: "D", name: "动态 SOCKS", label: "＋ 动态 SOCKS", colorKey: "amber", supported: true },
    ]);

    expect(buildForwardTypeCreateOptions([" x "])).toEqual([
      { type: "X", name: "未知转发", label: "＋ 未知转发", colorKey: "red", supported: false },
    ]);
  });
});
