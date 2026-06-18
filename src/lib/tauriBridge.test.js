import { describe, expect, it } from "vitest";
import { createLocalDir, createLocalFile, createRemoteSftpDir, deleteKeychainSecret, deleteTotpSecret, getHealth, getKeychainSecret, getLocalPathInfo, getSshAgentStatus, getTotpCode, isTauriRuntime, listCredentials, listForwards, listLocalDir, listRemoteSftpDir, openLocalPty, openSshSession, pickTrzszSaveDirectory, pickTrzszUploadPaths, probeHosts, readDefaultSshConfig, readLocalFileBase64, readLocalFileChunkBase64, readLocalText, readRemoteSftpFileBase64, readRemoteSftpFileChunkBase64, readRemoteSftpText, repairCredentialPermissions, sampleMonitor, saveKeychainSecret, saveTotpSecret, startDynamicForward, startLocalForward, startRemoteForward, stopForward, testJumpChain, truncateLocalFile, writeLocalFileBase64, writeLocalFileChunkBase64, writeLocalText, writeRemoteSftpFileBase64, writeRemoteSftpFileChunkBase64, writeRemoteSftpText } from "./tauriBridge.js";

describe("tauriBridge", () => {
  it("detects non-Tauri browser runtime", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("returns web preview health outside Tauri", async () => {
    await expect(getHealth()).resolves.toMatchObject({
      app: "RELAY",
      version: "web-preview",
      channel_streaming: false,
      frame_aggregation_ms: 16
    });
  });

  it("returns preview SSH agent status outside Tauri", async () => {
    await expect(getSshAgentStatus()).resolves.toMatchObject({
      available: true,
      socket: null,
      identityCount: 1,
      status: "preview",
      message: "浏览器预览 SSH Agent 状态"
    });
  });

  it("rejects real SSH sessions outside Tauri", async () => {
    await expect(openSshSession({
      host: "127.0.0.1",
      user: "deploy",
      password: "secret",
      onData: () => {}
    })).rejects.toThrow("真实 SSH 会话 仅在 Tauri 桌面端可用");
  });

  it("rejects local PTY sessions outside Tauri", async () => {
    await expect(openLocalPty({
      cols: 120,
      rows: 32,
      onData: () => {},
    })).rejects.toThrow("本地 PTY 仅在 Tauri 桌面端可用");
  });

  it("returns an empty forward list outside Tauri", async () => {
    await expect(listForwards()).resolves.toEqual([]);
  });

  it("rejects port forward controls outside Tauri", async () => {
    await expect(startLocalForward({
      bindPort: 15432,
      targetHost: "127.0.0.1",
      targetPort: 5432
    })).rejects.toThrow("端口转发 仅在 Tauri 桌面端可用");

    await expect(startDynamicForward({
      bindPort: 1086
    })).rejects.toThrow("端口转发 仅在 Tauri 桌面端可用");

    await expect(startRemoteForward({
      bindPort: 18080,
      targetHost: "127.0.0.1",
      targetPort: 8080
    })).rejects.toThrow("端口转发 仅在 Tauri 桌面端可用");

    await expect(stopForward("forward-id")).rejects.toThrow("端口转发 仅在 Tauri 桌面端可用");
  });

  it("returns deterministic preview jump-chain results outside Tauri", async () => {
    await expect(testJumpChain({
      nodes: [
        { label: "本机" },
        { label: "bastion-sh", host: "bastion.local", port: 22 },
        { label: "prod-web-01", host: "10.2.1.11", port: 22 }
      ]
    })).resolves.toEqual([
      expect.objectContaining({ from: "本机", to: "bastion-sh", status: "ok", latencyMs: expect.any(Number), message: "浏览器预览路径检查" }),
      expect.objectContaining({ from: "bastion-sh", to: "prod-web-01", status: "unchecked", latencyMs: null, message: "需要桌面端 SSH 通道" })
    ]);
  });

  it("returns preview host probe results outside Tauri", async () => {
    await expect(probeHosts({
      targets: [
        { id: 1, host: "prod-web-01", port: 22 },
        { id: 2, host: "backup-archive", port: 22 }
      ]
    })).resolves.toEqual([
      expect.objectContaining({ id: 1, status: "online", latencyMs: expect.any(Number), error: null }),
      expect.objectContaining({ id: 2, status: "offline", latencyMs: null, error: "浏览器预览中主机离线" })
    ]);
  });

  it("does not read default SSH config outside Tauri", async () => {
    await expect(readDefaultSshConfig()).resolves.toBeNull();
  });

  it("returns preview monitor data outside Tauri", async () => {
    await expect(sampleMonitor()).resolves.toMatchObject({
      cpu: expect.any(Number),
      memory: expect.any(Number),
      disk: expect.any(Number),
      networkDownMbps: expect.any(Number),
      load: expect.any(String),
      uptime: expect.any(String),
      os: "浏览器预览",
      processes: expect.any(Number)
    });
  });

  it("guards local file APIs outside Tauri", async () => {
    await expect(listLocalDir("~")).resolves.toBeNull();
    await expect(listRemoteSftpDir({ host: "example.com", user: "deploy", password: "secret" })).resolves.toBeNull();
    await expect(readLocalText("/tmp/file.txt")).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(writeLocalText("/tmp/file.txt", "data")).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(readLocalFileBase64("/tmp/file.bin")).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(writeLocalFileBase64("/tmp", "file.bin", "AAE=")).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(readLocalFileChunkBase64("/tmp/file.bin", 0, 65536)).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(writeLocalFileChunkBase64("/tmp/file.bin", 0, "AAE=", true)).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(truncateLocalFile("/tmp/file.bin", 1)).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(readRemoteSftpText({ host: "example.com", user: "deploy", password: "secret", path: "/etc/hosts" })).rejects.toThrow("真实远端 SFTP 仅在 Tauri 桌面端可用");
    await expect(writeRemoteSftpText({ host: "example.com", user: "deploy", password: "secret", path: "/tmp/relay.txt", content: "data" })).rejects.toThrow("真实远端 SFTP 仅在 Tauri 桌面端可用");
    await expect(readRemoteSftpFileBase64({ host: "example.com", user: "deploy", password: "secret", path: "/tmp/file.bin" })).rejects.toThrow("真实远端 SFTP 仅在 Tauri 桌面端可用");
    await expect(writeRemoteSftpFileBase64({ host: "example.com", user: "deploy", password: "secret", path: "/tmp/file.bin", contentBase64: "AAE=" })).rejects.toThrow("真实远端 SFTP 仅在 Tauri 桌面端可用");
    await expect(readRemoteSftpFileChunkBase64({ host: "example.com", user: "deploy", password: "secret", path: "/tmp/file.bin", offset: 0, length: 65536 })).rejects.toThrow("真实远端 SFTP 仅在 Tauri 桌面端可用");
    await expect(writeRemoteSftpFileChunkBase64({ host: "example.com", user: "deploy", password: "secret", path: "/tmp/file.bin", offset: 0, contentBase64: "AAE=", truncate: true })).rejects.toThrow("真实远端 SFTP 仅在 Tauri 桌面端可用");
    await expect(createRemoteSftpDir({ host: "example.com", user: "deploy", password: "secret", parent: "/tmp", name: "release" })).rejects.toThrow("真实远端 SFTP 仅在 Tauri 桌面端可用");
    await expect(createLocalDir("/tmp", "relay")).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(createLocalFile("/tmp", "download.bin", 1024)).rejects.toThrow("本地文件访问 仅在 Tauri 桌面端可用");
    await expect(getLocalPathInfo("/tmp/file.txt")).resolves.toBeNull();
    await expect(pickTrzszUploadPaths()).resolves.toEqual([]);
    await expect(pickTrzszSaveDirectory()).resolves.toBeNull();
  });

  it("returns preview credentials outside Tauri", async () => {
    const credentials = await listCredentials();
    expect(credentials).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "id_ed25519_work", kind: "ED25519 密钥", status: "ready", message: "浏览器预览凭据" }),
      expect.objectContaining({ name: "id_rsa_legacy", kind: "RSA 密钥", status: "warning", message: "旧版 RSA 密钥,建议评估轮换策略" }),
      expect.objectContaining({ name: "prod-2fa", fingerprint: "绑定到 bastion-sh", message: "浏览器预览 TOTP 凭据" })
    ]));
  });

  it("guards credential repair outside Tauri", async () => {
    await expect(repairCredentialPermissions("/tmp/id_ed25519")).rejects.toThrow("私钥权限修复 仅在 Tauri 桌面端可用");
  });

  it("guards system keychain writes outside Tauri", async () => {
    await expect(getKeychainSecret({
      host: "example.com",
      user: "deploy",
      kind: "password",
    })).resolves.toMatchObject({ found: false, secret: null, message: "系统钥匙串 仅在 Tauri 桌面端可用。" });
    await expect(saveKeychainSecret({
      host: "example.com",
      user: "deploy",
      kind: "password",
      secret: "secret",
    })).rejects.toThrow("系统钥匙串 仅在 Tauri 桌面端可用");
    await expect(deleteKeychainSecret({
      host: "example.com",
      user: "deploy",
      kind: "password",
    })).rejects.toThrow("系统钥匙串 仅在 Tauri 桌面端可用");
  });

  it("returns TOTP preview responses outside Tauri", async () => {
    await expect(saveTotpSecret({ id: "prod", secret: "GEZDGNBVGY3T" })).resolves.toMatchObject({
      saved: false,
      message: "TOTP 钥匙串存储 仅在 Tauri 桌面端可用。",
    });
    await expect(getTotpCode({ id: "prod", digits: 6, period: 30 })).resolves.toMatchObject({
      code: "000000",
      remainingSeconds: 30,
      period: 30,
      digits: 6,
    });
    await expect(deleteTotpSecret({ id: "prod" })).resolves.toMatchObject({
      saved: false,
      message: "TOTP 钥匙串存储 仅在 Tauri 桌面端可用。",
    });
  });
});
