import { describe, expect, it, vi } from "vitest";
import { addTotpProfile, attachTotpUsage, buildTotpDeleteConfirmation, buildTotpProfileDisplay, buildTotpVaultDisplay, findTotpProfileForTarget, loadTotpProfiles, normalizeTotpProfile, normalizeTotpProfileList, removeTotpProfile, saveTotpProfiles, TOTP_STORAGE_KEY, updateTotpProfile, validateTotpSecretSubmission } from "./totpStore.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(key => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
  };
}

describe("totpStore", () => {
  it("normalizes TOTP profile metadata without keeping secrets", () => {
    const profile = normalizeTotpProfile({
      label: " Prod Bastion ",
      issuer: " RELAY ",
      account: " deploy@example.com ",
      secret: "SHOULD_NOT_PERSIST",
      digits: 9,
      period: 5,
    });

    expect(profile).toEqual({
      id: "relay-deploy@example.com-prod-bastion",
      label: "Prod Bastion",
      issuer: "RELAY",
      account: "deploy@example.com",
      digits: 8,
      period: 15,
      createdAt: null,
    });
    expect(profile).not.toHaveProperty("secret");
  });

  it("adds and removes profiles", () => {
    const now = () => new Date("2026-06-16T08:00:00.000Z");
    const profiles = addTotpProfile([], {
      label: "prod-2fa",
      issuer: "bastion",
      account: "deploy",
    }, { now });

    expect(profiles[0]).toMatchObject({
      id: "bastion-deploy-prod-2fa",
      createdAt: "2026-06-16T08:00:00.000Z",
    });
    expect(() => addTotpProfile(profiles, profiles[0])).toThrow("TOTP 配置已存在: bastion-deploy-prod-2fa");
    expect(removeTotpProfile(profiles, profiles[0].id)).toEqual([]);
  });

  it("builds delete confirmations with usage and keychain seed context", () => {
    expect(buildTotpDeleteConfirmation({
      label: "prod-2fa",
      issuer: "bastion-sh",
      account: "deploy",
      usedHosts: [{ name: "prod-web" }, { name: "prod-api" }],
    })).toBe("删除 TOTP prod-2fa?\n\nbastion-sh / deploy\n\n当前有 2 台主机引用该 TOTP: prod-web, prod-api\n\n删除后会同时移除系统钥匙串中的 TOTP seed。");

    expect(buildTotpDeleteConfirmation({ label: "  ", used: 1 }))
      .toBe("删除 TOTP 未命名 TOTP?\n\n当前有 1 台主机引用该 TOTP\n\n删除后会同时移除系统钥匙串中的 TOTP seed。");
  });

  it("updates profile metadata while preserving id and excluding secrets", () => {
    const now = () => new Date("2026-06-16T08:00:00.000Z");
    const profiles = addTotpProfile([], {
      label: "prod-2fa",
      issuer: "bastion",
      account: "deploy",
    }, { now });

    const updated = updateTotpProfile(profiles, profiles[0].id, {
      label: " Prod Ops 2FA ",
      issuer: " bastion-sh ",
      account: " ops ",
      secret: "SHOULD_NOT_PERSIST",
      digits: 9,
      period: 5,
    });

    expect(updated).toEqual([
      {
        id: profiles[0].id,
        label: "Prod Ops 2FA",
        issuer: "bastion-sh",
        account: "ops",
        digits: 8,
        period: 15,
        createdAt: "2026-06-16T08:00:00.000Z",
      },
    ]);
    expect(updated[0]).not.toHaveProperty("secret");
  });

  it("rejects TOTP updates for missing profiles or ids", () => {
    const profiles = [normalizeTotpProfile({ id: "prod-2fa", label: "prod-2fa" })];

    expect(() => updateTotpProfile(profiles, "", { label: "new" })).toThrow("TOTP ID 不能为空");
    expect(() => updateTotpProfile(profiles, "missing", { label: "new" })).toThrow("未找到 TOTP 配置: missing");
    expect(() => updateTotpProfile(profiles, "prod-2fa", { label: "" })).toThrow("TOTP 名称不能为空");
  });

  it("requires a Base32 seed when creating TOTP profiles but allows blank edit submissions", () => {
    expect(validateTotpSecretSubmission({ editing: false, secret: "  " })).toEqual({
      ok: false,
      shouldSave: false,
      secret: "",
      message: "TOTP Base32 密钥不能为空",
    });
    expect(validateTotpSecretSubmission({ editing: true, secret: "  " })).toEqual({
      ok: true,
      shouldSave: false,
      secret: "",
      message: "",
    });
    expect(validateTotpSecretSubmission({ editing: true, secret: " JBSW Y3DP " })).toEqual({
      ok: true,
      shouldSave: true,
      secret: "JBSW Y3DP",
      message: "",
    });
  });

  it("builds TOTP vault section display metadata", () => {
    expect(buildTotpVaultDisplay()).toEqual({
      sectionTitle: "TOTP 动态口令",
      sectionSubtitle: "TOTP 密钥存入系统钥匙串,本地配置只保存签发方/账号等非敏感元数据。",
      defaultMessage: "用于堡垒机 2FA 的 6 位动态口令",
      toggleText: "新增 TOTP",
      emptyText: "尚未保存 TOTP。新增后可在连接堡垒机时手动复制验证码。",
      form: {
        fields: [
          { key: "label", label: "名称", placeholder: "prod-2fa", type: "text" },
          { key: "issuer", label: "签发方", placeholder: "bastion-sh", type: "text" },
          { key: "account", label: "账号", placeholder: "deploy", type: "text" },
          { key: "secret", label: "Base32 密钥", placeholder: "JBSWY3DPEHPK3PXP", type: "password" },
          { key: "digits", label: "位数", type: "number", min: 6, max: 8 },
          { key: "period", label: "周期秒", type: "number", min: 15, max: 120 },
        ],
        submitText: "保存",
        cancelText: "取消",
      },
      rowActions: {
        generateText: "生成",
        copyText: "复制",
        editText: "编辑",
        deleteText: "删除",
      },
    });

    const editing = buildTotpVaultDisplay({ showForm: true, editing: true });
    expect(editing.toggleText).toBe("收起");
    expect(editing.form.submitText).toBe("更新");
    expect(editing.form.fields.find(field => field.key === "secret").placeholder).toBe("留空则保留原密钥");
  });

  it("builds TOTP row display metadata for codes and usage", () => {
    expect(buildTotpProfileDisplay({
      id: "prod-2fa",
      label: " prod 2fa ",
      issuer: "",
      account: "",
      usedHosts: [],
    })).toMatchObject({
      label: "prod 2fa",
      scope: "local",
      meta: "30s · 6 digits · prod-2fa",
      codeText: "------",
      codeActive: false,
      remainingText: "",
      usageText: "0 台主机使用",
      usageTitle: "未被当前主机配置引用",
      usageTone: "neutral",
    });

    expect(buildTotpProfileDisplay({
      id: "bastion-deploy-prod",
      label: "prod",
      issuer: "bastion",
      account: "deploy",
      digits: 8,
      period: 45,
      used: 1,
      usedHosts: [{ name: "prod-web", user: "ops", host: "10.0.0.1" }],
    }, { code: "12345678", remainingSeconds: 17.9 })).toEqual({
      label: "prod",
      scope: "bastion / deploy",
      meta: "45s · 8 digits · bastion-deploy-prod",
      codeText: "12345678",
      codeActive: true,
      remainingText: "17s",
      usageText: "1 台主机使用",
      usageTitle: "prod-web (ops@10.0.0.1)",
      usageTone: "success",
    });
  });

  it("finds profiles by explicit id, label, and issuer/account target metadata", () => {
    const profiles = [
      normalizeTotpProfile({ label: "prod-2fa", issuer: "bastion-sh", account: "deploy" }),
      normalizeTotpProfile({ label: "db-2fa", issuer: "prod-db", account: "dba" }),
    ];

    expect(findTotpProfileForTarget({ totpProfileId: profiles[0].id }, profiles)?.label).toBe("prod-2fa");
    expect(findTotpProfileForTarget({ name: "db-2fa" }, profiles)?.label).toBe("db-2fa");
    expect(findTotpProfileForTarget({ name: "bastion-sh", host: "203.0.113.10", user: "deploy" }, profiles)?.label).toBe("prod-2fa");
  });

  it("attaches TOTP usage for target and structured jump hosts", () => {
    const [profile] = addTotpProfile([], {
      label: "prod-2fa",
      issuer: "bastion-sh",
      account: "ops",
    });
    const [withUsage] = attachTotpUsage([profile], [{
      id: 1,
      name: "prod-web",
      host: "10.0.0.1",
      user: "deploy",
      jumpHosts: [{ name: "bastion-sh", host: "203.0.113.10", user: "ops" }],
    }]);

    expect(withUsage.used).toBe(1);
    expect(withUsage.usedHosts).toEqual([
      { id: 1, name: "prod-web", user: "deploy", host: "10.0.0.1" },
    ]);
  });

  it("counts a host once when target and jump host match the same TOTP profile", () => {
    const profile = normalizeTotpProfile({ id: "shared-2fa", label: "shared-2fa", issuer: "bastion", account: "ops" });
    const [withUsage] = attachTotpUsage([profile], [{
      id: 2,
      name: "shared-route",
      host: "10.0.0.2",
      user: "deploy",
      totpProfileId: "shared-2fa",
      jumpHosts: [{ name: "bastion", host: "203.0.113.10", user: "ops" }],
    }]);

    expect(withUsage.used).toBe(1);
    expect(withUsage.usedHosts.map(host => host.name)).toEqual(["shared-route"]);
  });

  it("uses visible chain selection when counting structured jump-host TOTP usage", () => {
    const staleProfile = normalizeTotpProfile({ id: "old-2fa", label: "old-2fa", issuer: "old-bastion", account: "ops" });
    const activeProfile = normalizeTotpProfile({ id: "active-2fa", label: "active-2fa", issuer: "new-bastion", account: "ops" });
    const hosts = [{
      id: 3,
      name: "prod-api",
      host: "10.0.0.3",
      user: "deploy",
      chain: ["new-bastion"],
      jumpHosts: [{ name: "old-bastion", host: "old.example", user: "ops", totpProfileId: "old-2fa" }],
    }];
    const knownHosts = [{ name: "new-bastion", host: "new.example", user: "ops", totpProfileId: "active-2fa" }];

    const usage = attachTotpUsage([staleProfile, activeProfile], hosts, knownHosts);
    expect(usage.find(profile => profile.id === "old-2fa").used).toBe(0);
    expect(usage.find(profile => profile.id === "active-2fa").usedHosts.map(host => host.name)).toEqual(["prod-api"]);
  });

  it("loads and saves profile metadata", () => {
    const storage = memoryStorage();
    const profiles = [normalizeTotpProfile({ label: "prod", issuer: "relay", account: "ops" })];

    expect(saveTotpProfiles(storage, profiles)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(TOTP_STORAGE_KEY, expect.any(String));
    expect(loadTotpProfiles(storage)).toEqual(profiles);
  });

  it("keeps valid TOTP profiles when nearby records are invalid or duplicated", () => {
    const storage = memoryStorage({
      [TOTP_STORAGE_KEY]: JSON.stringify([
        { id: "prod-2fa", label: " Prod 2FA ", issuer: " bastion ", account: " ops ", secret: "ignored" },
        { id: "PROD-2FA", label: "Duplicate", issuer: "other", account: "ops" },
        { id: "../bad", label: "bad" },
        { label: "", issuer: "missing" },
      ]),
    });

    expect(loadTotpProfiles(storage)).toEqual([
      expect.objectContaining({
        id: "prod-2fa",
        label: "Prod 2FA",
        issuer: "bastion",
        account: "ops",
      }),
    ]);
    expect(loadTotpProfiles(storage)[0]).not.toHaveProperty("secret");
    expect(normalizeTotpProfileList(null)).toEqual([]);
  });

  it("returns empty profiles for unavailable or invalid storage", () => {
    expect(loadTotpProfiles(null)).toEqual([]);
    expect(loadTotpProfiles(memoryStorage({ [TOTP_STORAGE_KEY]: "bad json" }))).toEqual([]);
  });

  it("rejects invalid profile metadata", () => {
    expect(() => normalizeTotpProfile({ label: "" })).toThrow("TOTP 名称不能为空");
    expect(() => normalizeTotpProfile({ label: "bad", id: "../bad" })).toThrow("TOTP ID 只能包含字母、数字、短横线、下划线、点号或 @");
  });
});
