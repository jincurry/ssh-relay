import { describe, expect, it, vi } from "vitest";
import {
  buildVaultStatusMessage,
  buildVaultUnlockDisplay,
  buildVaultUnlockResetConfirmation,
  clearVaultUnlockRecord,
  createVaultUnlockRecord,
  deriveVaultUnlockHash,
  loadVaultUnlockRecord,
  saveVaultUnlockRecord,
  VAULT_UNLOCK_STORAGE_KEY,
  verifyVaultUnlockRecord,
} from "./vaultUnlock.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(key => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
    removeItem: vi.fn(key => data.delete(key)),
  };
}

describe("vaultUnlock", () => {
  it("creates deterministic salted unlock records", async () => {
    const record = await createVaultUnlockRecord("correct horse", {
      salt: "00112233445566778899aabbccddeeff",
    });

    expect(record).toEqual({
      version: 1,
      algorithm: "SHA-256",
      salt: "00112233445566778899aabbccddeeff",
      hash: await deriveVaultUnlockHash("correct horse", "00112233445566778899aabbccddeeff"),
    });
  });

  it("verifies only the matching passphrase", async () => {
    const record = await createVaultUnlockRecord("correct horse", {
      salt: "00112233445566778899aabbccddeeff",
    });

    await expect(verifyVaultUnlockRecord("correct horse", record)).resolves.toBe(true);
    await expect(verifyVaultUnlockRecord("wrong horse", record)).resolves.toBe(false);
  });

  it("rejects weak passphrases and invalid salt", async () => {
    await expect(createVaultUnlockRecord("short", { salt: "0011223344556677" })).rejects.toThrow("保险库主密码至少需要 8 个字符");
    await expect(createVaultUnlockRecord("correct horse", { salt: "bad salt" })).rejects.toThrow("保险库随机盐无效");
    await expect(deriveVaultUnlockHash(null, "0011223344556677")).rejects.toThrow("保险库主密码不能为空");
  });

  it("loads, saves, and clears unlock records from storage", async () => {
    const storage = memoryStorage();
    const record = await createVaultUnlockRecord("correct horse", {
      salt: "00112233445566778899aabbccddeeff",
    });

    expect(saveVaultUnlockRecord(storage, record)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(VAULT_UNLOCK_STORAGE_KEY, expect.any(String));
    expect(loadVaultUnlockRecord(storage)).toEqual(record);

    expect(clearVaultUnlockRecord(storage)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledWith(VAULT_UNLOCK_STORAGE_KEY);
    expect(loadVaultUnlockRecord(storage)).toBeNull();

    expect(() => saveVaultUnlockRecord(storage, { version: 1, algorithm: "SHA-256", salt: "bad", hash: "" }))
      .toThrow("本地解锁门禁记录无效");
  });

  it("builds an explicit reset confirmation for the local unlock gate", () => {
    expect(buildVaultUnlockResetConfirmation()).toBe([
      "重置本地解锁门禁?",
      "",
      "只会删除 RELAY 保存在本机的加盐校验记录。",
      "不会删除系统钥匙串中的 SSH 密码、私钥口令或 TOTP 密钥。",
      "不会修改主机、跳板、代理或转发配置。",
    ].join("\n"));
  });

  it("builds unlock gate display metadata for setup, locked, and unlocked states", () => {
    expect(buildVaultUnlockDisplay({ ready: true, hasRecord: false, unlocked: false })).toEqual({
      pageTitle: "凭据保险库",
      setupMode: true,
      locked: true,
      action: { text: "🔒 等待设置主密码", tone: "pending", buttonText: "" },
      gate: {
        title: "设置本地解锁密码",
        subtitle: "SSH 密码、私钥口令和 TOTP 密钥仍保存在系统钥匙串;本地门禁只控制 RELAY 保险库界面访问。",
        passphraseLabel: "主密码",
        passphrasePlaceholder: "至少 8 个字符",
        confirmVisible: true,
        confirmLabel: "确认主密码",
        confirmPlaceholder: "再次输入主密码",
        submitText: "启用门禁",
        resetText: "重置本地门禁",
      },
    });

    expect(buildVaultUnlockDisplay({ ready: true, hasRecord: true, unlocked: false })).toMatchObject({
      setupMode: false,
      action: { text: "🔒 等待主密码", tone: "neutral", buttonText: "" },
      gate: {
        title: "输入主密码解锁",
        passphrasePlaceholder: "输入主密码",
        confirmVisible: false,
        submitText: "解锁",
      },
    });

    expect(buildVaultUnlockDisplay({ ready: true, hasRecord: true, unlocked: true })).toMatchObject({
      locked: false,
      action: { text: "🔓 主密码已解锁", tone: "success", buttonText: "锁定" },
    });
  });

  it("builds explicit vault status messages", () => {
    expect(buildVaultStatusMessage(" 主密码已解锁 ")).toEqual({ text: "主密码已解锁", tone: "neutral" });
    expect(buildVaultStatusMessage("本地解锁门禁已启用", "success")).toEqual({ text: "本地解锁门禁已启用", tone: "success" });
    expect(buildVaultStatusMessage("主密码不正确", "error")).toEqual({ text: "主密码不正确", tone: "error" });
    expect(buildVaultStatusMessage("状态已记录", "warn")).toEqual({ text: "状态已记录", tone: "neutral" });
  });

  it("localizes unavailable browser crypto errors", async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {});

    try {
      await expect(createVaultUnlockRecord("correct horse"))
        .rejects.toThrow("当前环境缺少浏览器加密接口,无法生成保险库随机盐");
      await expect(deriveVaultUnlockHash("correct horse", "0011223344556677"))
        .rejects.toThrow("当前环境缺少浏览器加密接口,无法生成保险库解锁校验记录");
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });

  it("ignores unavailable, malformed, or incompatible records", () => {
    expect(loadVaultUnlockRecord(null)).toBeNull();
    expect(loadVaultUnlockRecord(memoryStorage({ [VAULT_UNLOCK_STORAGE_KEY]: "bad json" }))).toBeNull();
    expect(loadVaultUnlockRecord(memoryStorage({
      [VAULT_UNLOCK_STORAGE_KEY]: JSON.stringify({ version: 2, algorithm: "SHA-256", salt: "0011223344556677", hash: "00".repeat(32) }),
    }))).toBeNull();
  });

  it("does not verify malformed records", async () => {
    await expect(verifyVaultUnlockRecord("correct horse", null)).resolves.toBe(false);
    await expect(verifyVaultUnlockRecord("correct horse", {
      version: 1,
      algorithm: "SHA-256",
      salt: "0011223344556677",
      hash: "not-a-hash",
    })).resolves.toBe(false);
  });
});
