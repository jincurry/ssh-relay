import { describe, expect, it, vi } from "vitest";
import {
  buildConfigSnapshot,
  buildConfigSnapshotImportSummary,
  CONFIG_SYNC_APP,
  CONFIG_SYNC_DEVICE_STORAGE_KEY,
  CONFIG_SYNC_SCHEMA_VERSION,
  getOrCreateConfigSyncDeviceId,
  hashConfigData,
  makeConfigSnapshotFileName,
  parseConfigSnapshot,
  parseConfigSnapshotEnvelope,
  formatConfigSnapshotImportConfirmation,
  serializeConfigSnapshot,
} from "./configSync.js";

const appearanceDefaults = {
  themeName: "琥珀夜航",
  themeNames: ["琥珀夜航", "极昼"],
  accent: "#E8A33D",
  termSize: 13,
  termLigatures: true,
  minTermSize: 11,
  maxTermSize: 18,
};

describe("configSync", () => {
  function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
      getItem: vi.fn(key => data.get(key) ?? null),
      setItem: vi.fn((key, value) => data.set(key, value)),
    };
  }

  it("builds a versioned RELAY config snapshot", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [{
        id: 1,
        name: "prod-web",
        host: "10.0.0.2",
        user: "deploy",
        port: 22,
        tags: ["nginx"],
        chain: ["bastion"],
      }],
      appearance: { themeName: "极昼", accent: "#4CC38A", termSize: 16, termLigatures: false },
      snippets: [{ name: "Disk", cmd: "df -h", tag: "巡检" }],
      totpProfiles: [{ label: "prod-2fa", issuer: "bastion", account: "deploy", secret: "IGNORED" }],
      commandHistory: ["df -h", ""],
    }, {
      now: () => new Date("2026-06-16T08:00:00.000Z"),
      appearanceDefaults,
      deviceId: "relay-source1",
    });

    expect(snapshot).toMatchObject({
      app: CONFIG_SYNC_APP,
      schemaVersion: CONFIG_SYNC_SCHEMA_VERSION,
      exportedAt: "2026-06-16T08:00:00.000Z",
      sync: {
        sourceDeviceId: "relay-source1",
        exportedAt: "2026-06-16T08:00:00.000Z",
        itemCounts: { hosts: 1, snippets: 1, totpProfiles: 1, commandHistory: 1 },
      },
      data: {
        appearance: { themeName: "极昼", accent: "#4CC38A", termSize: 16, termLigatures: false },
        commandHistory: ["df -h"],
      },
    });
    expect(snapshot.sync.contentHash).toBe(hashConfigData(snapshot.data));
    expect(snapshot.data.hosts[0]).toMatchObject({ name: "prod-web", chain: ["bastion"] });
    expect(snapshot.data.snippets[0]).toMatchObject({ name: "Disk", cmd: "df -h", tag: "巡检" });
    expect(snapshot.data.totpProfiles[0]).toMatchObject({ label: "prod-2fa", issuer: "bastion", account: "deploy" });
    expect(snapshot.data.totpProfiles[0]).not.toHaveProperty("secret");
  });

  it("does not export password or passphrase fields", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [{
        id: 1,
        name: "prod-web",
        host: "10.0.0.2",
        user: "deploy",
        password: "secret",
        privateKeyPath: " ~/.ssh/runtime-host ",
        privateKeyPassphrase: "phrase",
        token: "totp-token",
        strictHostKey: false,
        trustUnknownHostKey: true,
        connectTimeoutMs: 5000,
        serverAliveIntervalMs: 15000,
        serverAliveCountMax: 4,
        proxy: { type: "http", host: "proxy.local", port: "8080", auth: true, username: "edge", password: "proxy-secret" },
        jumpHosts: [{
          host: "bastion",
          user: "ops",
          password: "jump-secret",
          privateKeyPath: "~/.ssh/bastion",
          privateKeyPassphrase: "jump-phrase",
          totpCode: "654321",
          totpProfileId: "prod-2fa",
          connectTimeoutMs: 7000,
          serverAliveIntervalMs: 20000,
          serverAliveCountMax: 2,
        }],
      }],
      appearance: {},
      snippets: [],
      totpProfiles: [{ label: "prod", secret: "totp-secret" }],
      commandHistory: [],
    }, { appearanceDefaults });

    const text = serializeConfigSnapshot(snapshot);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("totp-secret");
    expect(text).not.toContain("phrase");
    expect(text).not.toContain("totp-token");
    expect(text).not.toContain("proxy-secret");
    expect(text).not.toContain("654321");
    expect(text).not.toContain("privateKeyPath");
    expect(snapshot.data.hosts[0].identityFile).toBe("~/.ssh/runtime-host");
    expect(snapshot.data.hosts[0]).toMatchObject({
      strictHostKey: false,
      trustUnknownHostKey: true,
      connectTimeoutMs: 5000,
      serverAliveIntervalMs: 15000,
      serverAliveCountMax: 4,
    });
    expect(snapshot.data.hosts[0].proxy).toEqual(expect.objectContaining({
      type: "http",
      host: "proxy.local",
      port: "8080",
      auth: true,
      username: "edge",
    }));
    expect(snapshot.data.hosts[0].proxy).not.toHaveProperty("password");
    expect(snapshot.data.hosts[0].jumpHosts[0]).toEqual(expect.objectContaining({
      host: "bastion",
      user: "ops",
      identityFile: "~/.ssh/bastion",
      totpProfileId: "prod-2fa",
      connectTimeoutMs: 7000,
      serverAliveIntervalMs: 20000,
      serverAliveCountMax: 2,
    }));
  });

  it("parses and normalizes imported snapshots", () => {
    const parsed = parseConfigSnapshot(JSON.stringify({
      app: CONFIG_SYNC_APP,
      schemaVersion: CONFIG_SYNC_SCHEMA_VERSION,
      data: {
        hosts: [
          { id: 1, name: "good", host: "10.0.0.2", user: "deploy", password: "ignored" },
          { id: 2, host: "missing-name", user: "deploy" },
        ],
        appearance: { themeName: "missing", accent: "red", termSize: 99, termLigatures: false },
        snippets: [
          { name: "Logs", cmd: "tail -f app.log", tag: "" },
          { name: "logs", cmd: "journalctl -f", tag: "日志" },
          { name: "Broken", cmd: "" },
        ],
        totpProfiles: [
          { id: "prod-2fa", label: "Prod 2FA", issuer: "bastion", account: "deploy", secret: "ignored" },
          { id: "PROD-2FA", label: "Duplicate", issuer: "other", account: "deploy" },
          { id: "../bad", label: "Broken" },
        ],
        commandHistory: ["uptime", "x".repeat(501)],
      },
    }), { appearanceDefaults });

    expect(parsed.hosts).toHaveLength(1);
    expect(parsed.hosts[0]).not.toHaveProperty("password");
    expect(parsed.appearance).toEqual({ themeName: "琥珀夜航", accent: "#E8A33D", termSize: 18, termLigatures: false });
    expect(parsed.snippets).toHaveLength(1);
    expect(parsed.snippets[0]).toMatchObject({ name: "Logs", cmd: "tail -f app.log", tag: "自定义" });
    expect(parsed.totpProfiles).toHaveLength(1);
    expect(parsed.totpProfiles[0]).toMatchObject({ id: "prod-2fa", label: "Prod 2FA", issuer: "bastion", account: "deploy" });
    expect(parsed.totpProfiles[0]).not.toHaveProperty("secret");
    expect(parsed.commandHistory).toEqual(["uptime"]);
  });

  it("omits sensitive-looking command history entries from exported and imported snapshots", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [],
      appearance: {},
      snippets: [],
      totpProfiles: [],
      commandHistory: [
        "uptime",
        "export DB_PASSWORD=secret",
        "AWS_SECRET_ACCESS_KEY=abc deploy",
        "curl -H 'Authorization: Bearer token' https://api.example.com",
        "docker login -u relay -p secret registry.example.com",
        "mysql -uroot -psecret",
        "kubectl get pods",
      ],
    }, { appearanceDefaults });

    expect(snapshot.data.commandHistory).toEqual(["uptime", "kubectl get pods"]);
    const text = serializeConfigSnapshot(snapshot);
    expect(text).not.toContain("DB_PASSWORD");
    expect(text).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(text).not.toContain("Bearer token");
    expect(text).not.toContain("-psecret");

    const imported = parseConfigSnapshot(JSON.stringify({
      app: CONFIG_SYNC_APP,
      schemaVersion: CONFIG_SYNC_SCHEMA_VERSION,
      data: {
        hosts: [],
        appearance: {},
        snippets: [],
        totpProfiles: [],
        commandHistory: [
          "df -h",
          "TOKEN=abc curl https://api.example.com",
          "sshpass -p secret ssh root@example.com",
          "journalctl -u nginx",
        ],
      },
    }), { appearanceDefaults });

    expect(imported.commandHistory).toEqual(["df -h", "journalctl -u nginx"]);
  });

  it("omits sensitive-looking command snippets from exported and imported snapshots", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [],
      appearance: {},
      snippets: [
        { name: "Disk", cmd: "df -h", tag: "巡检" },
        { name: "Login", cmd: "docker login -u relay -p secret registry.example.com", tag: "发布" },
        { name: "Token curl", cmd: "curl -H 'Authorization: Bearer token' https://api.example.com", tag: "网络" },
        { name: "Restart", cmd: "systemctl restart nginx", tag: "服务", danger: true },
      ],
      totpProfiles: [],
      commandHistory: [],
    }, { appearanceDefaults });

    expect(snapshot.data.snippets).toEqual([
      expect.objectContaining({ name: "Disk", cmd: "df -h" }),
      expect.objectContaining({ name: "Restart", cmd: "systemctl restart nginx", danger: true }),
    ]);
    const text = serializeConfigSnapshot(snapshot);
    expect(text).not.toContain("docker login");
    expect(text).not.toContain("Bearer token");

    const imported = parseConfigSnapshot(JSON.stringify({
      app: CONFIG_SYNC_APP,
      schemaVersion: CONFIG_SYNC_SCHEMA_VERSION,
      data: {
        hosts: [],
        appearance: {},
        snippets: [
          { name: "Logs", cmd: "journalctl -u nginx", tag: "日志" },
          { name: "Password export", cmd: "export DB_PASSWORD=secret", tag: "发布" },
        ],
        totpProfiles: [],
        commandHistory: [],
      },
    }), { appearanceDefaults });

    expect(imported.snippets).toEqual([
      expect.objectContaining({ name: "Logs", cmd: "journalctl -u nginx" }),
    ]);
  });

  it("normalizes bracketed IPv6 host and jump-host addresses in snapshots", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [{
        id: 1,
        name: "prod-v6",
        host: " [2001:db8::10] ",
        user: "deploy",
        jumpHosts: [{
          name: "relay-v6",
          host: " [2001:db8::20] ",
          user: "ops",
        }],
      }],
      appearance: {},
      snippets: [],
      totpProfiles: [],
      commandHistory: [],
    }, { appearanceDefaults });

    expect(snapshot.data.hosts[0]).toMatchObject({
      host: "2001:db8::10",
      jumpHosts: [expect.objectContaining({ host: "2001:db8::20" })],
    });

    const parsed = parseConfigSnapshot(serializeConfigSnapshot(snapshot), { appearanceDefaults });
    expect(parsed.hosts[0]).toMatchObject({
      host: "2001:db8::10",
      jumpHosts: [expect.objectContaining({ host: "2001:db8::20" })],
    });
  });

  it("omits sensitive-looking custom ProxyCommand text from snapshots", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [{
        id: 1,
        name: "prod-web",
        host: "10.0.0.2",
        user: "deploy",
        proxy: { type: "cmd", cmd: "sshpass -p secret ssh -W %h:%p bastion" },
        jumpHosts: [{
          name: "bastion",
          host: "203.0.113.10",
          user: "ops",
          proxy: { type: "cmd", cmd: "curl -H 'Authorization: Bearer token' https://proxy.example/connect %h %p" },
        }],
      }],
      appearance: {},
      snippets: [],
      totpProfiles: [],
      commandHistory: [],
    }, { appearanceDefaults });

    const text = serializeConfigSnapshot(snapshot);
    expect(text).not.toContain("sshpass");
    expect(text).not.toContain("Bearer token");
    expect(snapshot.data.hosts[0].proxy.type).toBe("none");
    expect(snapshot.data.hosts[0].jumpHosts[0].proxy.type).toBe("none");

    const imported = parseConfigSnapshot(JSON.stringify({
      app: CONFIG_SYNC_APP,
      schemaVersion: CONFIG_SYNC_SCHEMA_VERSION,
      data: {
        hosts: [{
          id: 2,
          name: "imported",
          host: "10.0.0.3",
          user: "ops",
          proxy: { type: "cmd", cmd: "export PROXY_TOKEN=secret; connect %h %p" },
        }],
        appearance: {},
        snippets: [],
        totpProfiles: [],
        commandHistory: [],
      },
    }), { appearanceDefaults });

    expect(imported.hosts[0].proxy).toEqual(expect.objectContaining({ type: "none" }));
  });

  it("rejects invalid snapshots", () => {
    expect(() => parseConfigSnapshot("not json", { appearanceDefaults })).toThrow("配置快照不是有效的 JSON 文件");
    expect(() => parseConfigSnapshot(JSON.stringify(null), { appearanceDefaults })).toThrow("配置快照内容不能为空");
    expect(() => parseConfigSnapshot(JSON.stringify({ app: "other", schemaVersion: 1, data: {} }), { appearanceDefaults })).toThrow("该配置快照不是由 RELAY 导出的文件");
    expect(() => parseConfigSnapshot(JSON.stringify({ app: CONFIG_SYNC_APP, schemaVersion: 99, data: {} }), { appearanceDefaults })).toThrow("不支持的配置快照版本: 99");
    expect(() => parseConfigSnapshot(JSON.stringify({ app: CONFIG_SYNC_APP, schemaVersion: 1 }), { appearanceDefaults })).toThrow("配置快照缺少 data 数据");
  });

  it("parses snapshot envelopes with sync metadata", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [{ id: 1, name: "prod-web", host: "10.0.0.2", user: "deploy" }],
      appearance: {},
      snippets: [{ name: "Disk", cmd: "df -h", tag: "巡检" }],
      totpProfiles: [],
      commandHistory: ["uptime"],
    }, {
      now: () => new Date("2026-06-16T08:00:00.000Z"),
      appearanceDefaults,
      deviceId: "relay-source1",
    });

    const envelope = parseConfigSnapshotEnvelope(serializeConfigSnapshot(snapshot), { appearanceDefaults });

    expect(envelope.sync).toEqual({
      sourceDeviceId: "relay-source1",
      exportedAt: "2026-06-16T08:00:00.000Z",
      contentHash: hashConfigData(envelope.data),
      itemCounts: { hosts: 1, snippets: 1, totpProfiles: 0, commandHistory: 1 },
    });
  });

  it("summarizes snapshot import impact before replacing local data", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [{ id: 1, name: "prod-web", host: "10.0.0.2", user: "deploy" }],
      appearance: {},
      snippets: [{ name: "Disk", cmd: "df -h", tag: "巡检" }],
      totpProfiles: [],
      commandHistory: [],
    }, {
      now: () => new Date("2026-06-16T08:00:00.000Z"),
      appearanceDefaults,
      deviceId: "relay-source1",
    });
    const envelope = parseConfigSnapshotEnvelope(serializeConfigSnapshot(snapshot), { appearanceDefaults });
    const summary = buildConfigSnapshotImportSummary({
      hosts: [{ id: 1 }, { id: 2 }],
      snippets: [{ id: "a" }],
      totpProfiles: [{ id: "totp" }],
      commandHistory: ["uptime", "df -h"],
    }, envelope, { localDeviceId: "relay-local1" });

    expect(summary).toMatchObject({
      origin: "外部快照",
      sourceDeviceId: "relay-source1",
      currentCounts: { hosts: 2, snippets: 1, totpProfiles: 1, commandHistory: 2 },
      incomingCounts: { hosts: 1, snippets: 1, totpProfiles: 0, commandHistory: 0 },
      removesItems: true,
    });
    expect(formatConfigSnapshotImportConfirmation(summary)).toContain("主机: 2 -> 1");
    expect(formatConfigSnapshotImportConfirmation(summary)).toContain("当前多出的本地条目");
  });

  it("labels imports from the same device as local snapshots", () => {
    const summary = buildConfigSnapshotImportSummary({}, {
      data: {},
      sync: { sourceDeviceId: "relay-source1", contentHash: "fnv1a32:abc" },
    }, { localDeviceId: "relay-source1" });

    expect(summary.origin).toBe("本机快照");
    expect(formatConfigSnapshotImportConfirmation(summary)).toContain("导入 本机快照");
  });

  it("rejects snapshots whose sync checksum no longer matches normalized data", () => {
    const snapshot = buildConfigSnapshot({
      hosts: [{ id: 1, name: "prod-web", host: "10.0.0.2", user: "deploy" }],
      appearance: {},
      snippets: [],
      totpProfiles: [],
      commandHistory: [],
    }, {
      appearanceDefaults,
      deviceId: "relay-source1",
    });
    snapshot.data.hosts[0].host = "10.0.0.99";

    expect(() => parseConfigSnapshotEnvelope(serializeConfigSnapshot(snapshot), { appearanceDefaults })).toThrow("配置快照校验和不匹配");
  });

  it("creates and reuses stable local sync device ids", () => {
    const storage = memoryStorage();
    const first = getOrCreateConfigSyncDeviceId(storage, { random: () => 0.25 });
    const second = getOrCreateConfigSyncDeviceId(storage, { random: () => 0.75 });

    expect(first).toMatch(/^relay-[a-z0-9]{7,16}$/);
    expect(second).toBe(first);
    expect(storage.setItem).toHaveBeenCalledWith(CONFIG_SYNC_DEVICE_STORAGE_KEY, first);
  });

  it("creates stable snapshot filenames", () => {
    expect(makeConfigSnapshotFileName(new Date("2026-06-16T08:00:00.123Z"))).toBe("relay-config-2026-06-16T08-00-00-123Z.json");
  });
});
