import { describe, expect, it } from "vitest";
import { buildCredentialRowDisplay, buildCredentialScanStatus, buildCredentialStatusDisplay, buildCredentialVaultDisplay, getCredentialStatusLabel } from "./credentialDisplay.js";

describe("credentialDisplay", () => {
  it("localizes credential status labels for vault badges", () => {
    expect(getCredentialStatusLabel("ready")).toBe("就绪");
    expect(getCredentialStatusLabel("warning")).toBe("需检查");
    expect(getCredentialStatusLabel("missing")).toBe("缺失");
    expect(getCredentialStatusLabel("custom")).toBe("custom");
    expect(getCredentialStatusLabel("")).toBe("未知");
  });

  it("builds vault credential badge display metadata", () => {
    expect(buildCredentialStatusDisplay({ status: "ready" })).toEqual({
      status: "ready",
      label: "就绪",
      tone: "success",
      title: "",
    });
    expect(buildCredentialStatusDisplay({ status: " warning ", message: "  chmod needed  " })).toEqual({
      status: "warning",
      label: "需检查",
      tone: "pending",
      title: "chmod needed",
    });
    expect(buildCredentialStatusDisplay({ status: "missing" })).toMatchObject({
      label: "缺失",
      tone: "error",
    });
    expect(buildCredentialStatusDisplay({ status: "custom" })).toMatchObject({
      label: "custom",
      tone: "neutral",
    });
  });

  it("summarizes desktop credential scans with explicit tones", () => {
    expect(buildCredentialScanStatus([
      { status: "ready" },
      { status: " warning " },
    ])).toEqual({
      text: "已扫描本机 ~/.ssh/*.pub 公钥 · 1 个警告 / 0 个缺失私钥",
      tone: "pending",
      total: 2,
      warnings: 1,
      missing: 0,
    });
    expect(buildCredentialScanStatus([
      { status: "ready" },
      { status: "missing" },
      { status: "warning" },
    ])).toEqual({
      text: "已扫描本机 ~/.ssh/*.pub 公钥 · 1 个警告 / 1 个缺失私钥",
      tone: "error",
      total: 3,
      warnings: 1,
      missing: 1,
    });
    expect(buildCredentialScanStatus([{ status: "ready" }])).toEqual({
      text: "已扫描本机 ~/.ssh/*.pub 公钥",
      tone: "success",
      total: 1,
      warnings: 0,
      missing: 0,
    });
  });

  it("summarizes browser preview credential scans", () => {
    expect(buildCredentialScanStatus([{ status: "missing" }], { desktop: false })).toEqual({
      text: "浏览器预览数据",
      tone: "success",
      total: 1,
      warnings: 0,
      missing: 0,
    });
    expect(buildCredentialScanStatus(null)).toEqual({
      text: "已扫描本机 ~/.ssh/*.pub 公钥",
      tone: "success",
      total: 0,
      warnings: 0,
      missing: 0,
    });
  });

  it("builds credential vault section display metadata", () => {
    expect(buildCredentialVaultDisplay()).toEqual({
      sectionTitle: "密钥与口令",
      sectionSubtitle: "私钥永不出库:签名在本地代理完成,跳板与目标只见到公钥。支持 TOTP 动态口令保存与复制。",
      refreshText: "⟳ 刷新",
      emptyText: "未发现公钥。把 `.pub` 文件放入 ~/.ssh 后刷新。",
      repairText: "修复权限",
      repairingText: "修复中",
    });
  });

  it("builds credential row display metadata with usage and repair state", () => {
    expect(buildCredentialRowDisplay({
      name: " id_ed25519 ",
      kind: "ED25519",
      fingerprint: "SHA256:abc",
      privatePath: " ~/.ssh/id_ed25519 ",
      message: " chmod 600 required ",
      status: "warning",
      used: 1,
      usedHosts: [{ name: "prod-web", user: "deploy", host: "10.0.0.1" }],
    }, { repairing: true })).toEqual({
      name: "id_ed25519",
      kind: "ED25519",
      fingerprint: "SHA256:abc",
      privatePath: "~/.ssh/id_ed25519",
      message: "chmod 600 required",
      status: {
        status: "warning",
        label: "需检查",
        tone: "pending",
        title: "chmod 600 required",
      },
      usageText: "1 台主机使用",
      usageTitle: "prod-web (deploy@10.0.0.1)",
      usageTone: "success",
      repairText: "修复中",
    });

    expect(buildCredentialRowDisplay({ status: "ready" })).toMatchObject({
      name: "未命名密钥",
      kind: "SSH 公钥",
      fingerprint: "",
      usageText: "0 台主机使用",
      usageTitle: "未被当前主机配置引用",
      usageTone: "neutral",
      repairText: "修复权限",
    });
  });
});
