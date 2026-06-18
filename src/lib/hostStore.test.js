import { describe, expect, it, vi } from "vitest";
import { addHost, buildHostDeleteConfirmation, HOSTS_STORAGE_KEY, loadHosts, removeHost, saveHosts, toggleHostFavorite, updateHostConfig, updateHostProfile } from "./hostStore.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
  };
}

const hosts = [
  { id: 1, name: "prod-web-01", host: "10.2.1.11", user: "deploy", chain: [], tags: ["nginx"], lat: [] },
  { id: 2, name: "staging-api", host: "192.168.3.40", user: "ubuntu", chain: [], tags: [], lat: [] },
];

describe("hostStore", () => {
  it("returns fallback hosts when storage is unavailable or invalid", () => {
    expect(loadHosts(null, hosts)).toBe(hosts);

    const storage = memoryStorage();
    storage.setItem(HOSTS_STORAGE_KEY, "{bad json");
    expect(loadHosts(storage, hosts)).toBe(hosts);
  });

  it("saves and loads host profiles", () => {
    const storage = memoryStorage();
    expect(saveHosts(storage, hosts)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(HOSTS_STORAGE_KEY, expect.any(String));
    expect(loadHosts(storage, [])).toEqual(hosts.map(host => expect.objectContaining({ id: host.id, name: host.name })));
  });

  it("normalizes saved IdentityFile values when loading hosts", () => {
    const storage = memoryStorage();
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify([
      { ...hosts[0], identityFile: [" ~/.ssh/prod ", "~/.ssh/fallback"] },
      { ...hosts[1], identityFile: "   " },
    ]));

    expect(loadHosts(storage, [])).toEqual([
      expect.objectContaining({ id: 1, identityFile: "~/.ssh/prod" }),
      expect.not.objectContaining({ identityFile: expect.anything() }),
    ]);
  });

  it("normalizes sparse persisted host profile defaults", () => {
    const storage = memoryStorage();
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify([{
      id: 9,
      name: " legacy-prod ",
      host: " 10.0.0.8 ",
      user: " root ",
      port: "bad",
      group: " ",
      status: "stale",
      fav: 1,
      tags: " ops, prod , ",
      chain: [" bastion ", "", null],
      lat: [18, "21", -1, "bad", 0],
    }]));

    expect(loadHosts(storage, [])[0]).toMatchObject({
      id: 9,
      name: "legacy-prod",
      host: "10.0.0.8",
      user: "root",
      port: 22,
      group: "手动添加",
      status: "online",
      fav: true,
      tags: ["ops", "prod"],
      chain: ["bastion"],
      lat: [18, 21, 0],
    });
  });

  it("deduplicates persisted host tags before they reach host cards", () => {
    const storage = memoryStorage();
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify([{
      id: 10,
      name: "tag-heavy",
      host: "10.0.0.10",
      user: "deploy",
      tags: [" prod ", "nginx", "prod", "", "华东", "nginx"],
    }]));

    expect(loadHosts(storage, [])[0].tags).toEqual(["prod", "nginx", "华东"]);
  });

  it("bounds persisted latency history to the latest sparkline samples", () => {
    const storage = memoryStorage();
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify([{
      id: 11,
      name: "latency-heavy",
      host: "10.0.0.11",
      user: "deploy",
      lat: [1, 2, "bad", -1, 3, 4, 5, 6, 7, 8, 9, 10],
    }]));

    expect(loadHosts(storage, [])[0].lat).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("normalizes bracketed IPv6 host addresses from persisted profiles", () => {
    const storage = memoryStorage();
    storage.setItem(HOSTS_STORAGE_KEY, JSON.stringify([{
      id: 10,
      name: "v6-prod",
      host: " [2001:db8::10] ",
      user: "deploy",
    }]));

    expect(loadHosts(storage, [])[0]).toMatchObject({
      id: 10,
      host: "2001:db8::10",
    });
  });

  it("preserves non-secret host-key policy flags when saving hosts", () => {
    const storage = memoryStorage();
    saveHosts(storage, [{
      ...hosts[0],
      strictHostKey: false,
      trustUnknownHostKey: true,
      connectTimeoutMs: 50_000,
      serverAliveIntervalMs: 900_000,
      serverAliveCountMax: 50,
    }]);

    expect(loadHosts(storage, [])[0]).toMatchObject({
      strictHostKey: false,
      trustUnknownHostKey: true,
      connectTimeoutMs: 30_000,
      serverAliveIntervalMs: 600_000,
      serverAliveCountMax: 20,
    });
  });

  it("strips runtime auth secrets from saved host profiles and jump hosts", () => {
    const storage = memoryStorage();
    const source = [{
      ...hosts[0],
      password: "host-password",
      privateKeyPath: "~/.ssh/host",
      privateKeyPassphrase: "host-passphrase",
      totpCode: "123456",
      jumpHosts: [{
        name: "bastion-sh",
        host: "203.0.113.10",
        user: "ops",
        port: 2222,
        password: "jump-password",
        privateKeyPath: " ~/.ssh/bastion ",
        privateKeyPassphrase: "jump-passphrase",
        totpCode: "654321",
        connectTimeoutMs: 50_000,
        proxy: { type: "cmd", cmd: "ssh -W %h:%p edge" },
      }],
    }];

    saveHosts(storage, source);
    const raw = storage.setItem.mock.calls[0][1];

    expect(raw).not.toContain("host-password");
    expect(raw).not.toContain("host-passphrase");
    expect(raw).not.toContain("jump-password");
    expect(raw).not.toContain("jump-passphrase");
    expect(raw).not.toContain("123456");
    expect(raw).not.toContain("654321");
    expect(raw).not.toContain("privateKeyPath");

    expect(loadHosts(storage, [])[0]).toMatchObject({
      name: "prod-web-01",
      identityFile: "~/.ssh/host",
      jumpHosts: [{
        name: "bastion-sh",
        host: "203.0.113.10",
        user: "ops",
        port: "2222",
        identityFile: "~/.ssh/bastion",
        connectTimeoutMs: 30_000,
        proxy: { type: "cmd", cmd: "ssh -W %h:%p edge" },
      }],
    });
    expect(loadHosts(storage, [])[0]).not.toHaveProperty("password");
    expect(loadHosts(storage, [])[0].jumpHosts[0]).not.toHaveProperty("password");
    expect(loadHosts(storage, [])[0].jumpHosts[0]).not.toHaveProperty("privateKeyPassphrase");
  });

  it("updates connection config and strips runtime-only forward fields", () => {
    const updated = updateHostConfig(hosts, 1, {
      chain: ["bastion-sh", "relay-db"],
      proxy: { type: "socks5", host: "127.0.0.1", port: 1080, auth: true, username: "edge", password: "proxy-secret" },
      forwards: [
        { id: 7, type: "L", lport: 15432, rhost: "db.internal", rport: 5432, on: true, runtimeId: "live", busy: true, error: "old" },
      ],
    });

    expect(updated[0]).toMatchObject({
      chain: ["bastion-sh", "relay-db"],
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080", auth: true, username: "edge" },
      forwards: [{ id: 7, type: "L", lport: "15432", rhost: "db.internal", rport: "5432", on: true }],
    });
    expect(updated[0].forwards[0]).not.toHaveProperty("runtimeId");
    expect(updated[0].proxy).not.toHaveProperty("password");
    expect(updated[0].updatedAt).toEqual(expect.any(String));
    expect(updated[1]).toBe(hosts[1]);
  });

  it("normalizes proxy metadata before saving host profiles", () => {
    const storage = memoryStorage();
    saveHosts(storage, [{
      ...hosts[0],
      proxy: { kind: " SOCKS5 ", host: " proxy.local ", port: "bad", auth: true, username: " edge ", password: "proxy-secret" },
    }]);

    const raw = storage.setItem.mock.calls[0][1];
    expect(raw).not.toContain("proxy-secret");
    expect(loadHosts(storage, [])[0].proxy).toEqual({
      type: "socks5",
      host: "proxy.local",
      port: "1080",
      auth: true,
      username: "edge",
      cmd: "connect -S %h:%p",
    });
  });

  it("does not persist sensitive-looking custom ProxyCommand text", () => {
    const storage = memoryStorage();
    saveHosts(storage, [{
      ...hosts[0],
      proxy: { type: "cmd", cmd: "sshpass -p secret ssh -W %h:%p bastion" },
      jumpHosts: [{
        name: "bastion-sh",
        host: "203.0.113.10",
        user: "ops",
        proxy: { type: "cmd", cmd: "curl -H 'Authorization: Bearer token' https://proxy.example/connect %h %p" },
      }],
    }]);

    const raw = storage.setItem.mock.calls[0][1];
    expect(raw).not.toContain("sshpass");
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("Bearer token");
    const [host] = loadHosts(storage, []);
    expect(host.proxy.type).toBe("none");
    expect(host.jumpHosts[0].proxy.type).toBe("none");
  });

  it("normalizes bracketed IPv6 proxy hosts before saving host profiles", () => {
    const storage = memoryStorage();
    saveHosts(storage, [{
      ...hosts[0],
      proxy: { type: "http", host: " [2001:db8::40] ", port: "8080", auth: true, username: " edge " },
    }]);

    expect(loadHosts(storage, [])[0].proxy).toEqual({
      type: "http",
      host: "2001:db8::40",
      port: "8080",
      auth: true,
      username: "edge",
      cmd: "connect -S %h:%p",
    });
  });

  it("normalizes persisted forwarding rules while stripping runtime fields", () => {
    const storage = memoryStorage();
    saveHosts(storage, [{
      ...hosts[0],
      forwards: [
        { id: "  ", type: " l ", lport: " 15432 ", rhost: " db.internal ", rport: " 5432 ", on: 1, runtimeId: "old", busy: true },
        { id: "dyn", type: "D", lport: " 1086 ", rhost: "ignored", rport: "ignored", on: false },
      ],
    }]);

    const [host] = loadHosts(storage, []);
    expect(host.forwards).toEqual([
      { id: "forward-1", type: "L", lport: "15432", rhost: "db.internal", rport: "5432", on: true },
      { id: "dyn", type: "D", lport: "1086", rhost: "", rport: "", on: false },
    ]);
    expect(JSON.parse(storage.setItem.mock.calls[0][1])[0].forwards[0]).not.toHaveProperty("runtimeId");
  });

  it("persists matching structured jump hosts from connection config", () => {
    const updated = updateHostConfig(hosts, 1, {
      chain: ["bastion-sh"],
      jumpHosts: [{
        name: "bastion-sh",
        host: "203.0.113.10",
        port: "2222",
        user: "ops",
        privateKeyPath: "~/.ssh/bastion",
        privateKeyPassphrase: "ignored",
        password: "ignored",
        totpCode: "ignored",
        totpProfileId: "prod-2fa",
      }],
      proxy: { type: "none" },
      forwards: [],
    });

    expect(updated[0].jumpHosts).toEqual([expect.objectContaining({
      name: "bastion-sh",
      host: "203.0.113.10",
      port: "2222",
      user: "ops",
      identityFile: "~/.ssh/bastion",
      totpProfileId: "prod-2fa",
    })]);
    expect(updated[0].jumpHosts[0]).not.toHaveProperty("password");
    expect(updated[0].jumpHosts[0]).not.toHaveProperty("privateKeyPassphrase");
    expect(updated[0].jumpHosts[0]).not.toHaveProperty("totpCode");
  });

  it("normalizes persisted jump-host metadata and skips unusable entries", () => {
    const storage = memoryStorage();
    saveHosts(storage, [{
      ...hosts[0],
      jumpHosts: [
        {
          name: " bastion ",
          host: " bastion.internal ",
          user: " ops ",
          port: "70000",
          privateKeyPath: " ~/.ssh/bastion ",
          privateKeyPassphrase: "secret",
          password: "secret",
          totpCode: "123456",
          totpProfileId: " prod-2fa ",
          proxy: { type: " HTTP ", host: " proxy.local ", port: "bad", auth: true, username: " edge ", password: "proxy-secret" },
          strictHostKey: false,
        },
        { host: "missing-user" },
      ],
    }]);

    const raw = storage.setItem.mock.calls[0][1];
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("123456");
    expect(raw).not.toContain("privateKeyPath");

    expect(loadHosts(storage, [])[0].jumpHosts).toEqual([{
      name: "bastion",
      host: "bastion.internal",
      user: "ops",
      port: "22",
      identityFile: "~/.ssh/bastion",
      totpProfileId: "prod-2fa",
      proxy: {
        type: "http",
        host: "proxy.local",
        port: "8080",
        auth: true,
        username: "edge",
        cmd: "connect -S %h:%p",
      },
      strictHostKey: false,
    }]);
  });

  it("drops stale structured jump hosts when connection chain changes", () => {
    const source = [{
      ...hosts[0],
      chain: ["old-bastion"],
      jumpHosts: [{ name: "old-bastion", host: "old.example", user: "ops" }],
    }, hosts[1]];

    const updated = updateHostConfig(source, 1, {
      chain: ["new-bastion"],
      proxy: { type: "none" },
      forwards: [],
    });

    expect(updated[0].chain).toEqual(["new-bastion"]);
    expect(updated[0].jumpHosts).toBeUndefined();
  });

  it("drops structured jump hosts when connection chain is cleared", () => {
    const source = [{
      ...hosts[0],
      chain: ["bastion-sh"],
      jumpHosts: [{ name: "bastion-sh", host: "203.0.113.10", user: "ops" }],
    }, hosts[1]];

    const updated = updateHostConfig(source, 1, {
      chain: [],
      proxy: { type: "none" },
      forwards: [],
    });

    expect(updated[0].chain).toEqual([]);
    expect(updated[0].jumpHosts).toBeUndefined();
  });

  it("adds a manually-created host", () => {
    const updated = addHost(hosts, {
      name: "prod-cache-01",
      host: "10.2.3.9",
      user: "deploy",
      port: "2222",
      group: "生产环境",
      tags: "redis, cache",
      identityFile: [" ~/.ssh/prod ", "~/.ssh/fallback"],
    });

    expect(updated).toHaveLength(3);
    expect(updated[2]).toMatchObject({
      id: 3,
      name: "prod-cache-01",
      host: "10.2.3.9",
      user: "deploy",
      port: 2222,
      group: "生产环境",
      tags: ["redis", "cache"],
      identityFile: "~/.ssh/prod",
      chain: [],
      fav: false,
    });
  });

  it("normalizes bracketed IPv6 addresses when adding manual hosts", () => {
    const updated = addHost(hosts, {
      name: "prod-v6",
      host: " [2001:db8::20] ",
      user: "deploy",
      port: "2200",
    });

    expect(updated[2]).toMatchObject({
      name: "prod-v6",
      host: "2001:db8::20",
      port: 2200,
    });
  });

  it("rejects duplicate or invalid manual hosts", () => {
    expect(() => addHost(hosts, {
      name: "prod-web-01",
      host: "10.2.1.11",
      user: "deploy",
      port: 22,
    })).toThrow("主机配置已存在");

    expect(() => addHost(hosts, {
      name: "",
      host: "10.0.0.1",
      user: "root",
      port: 22,
    })).toThrow("主机名称不能为空");

    expect(() => addHost(hosts, {
      name: "bad",
      host: "",
      user: "root",
      port: 22,
    })).toThrow("主机地址不能为空");

    expect(() => addHost(hosts, {
      name: "bad",
      host: "10.0.0.1",
      user: "",
      port: 22,
    })).toThrow("登录用户不能为空");

    expect(() => addHost(hosts, {
      name: "bad",
      host: "10.0.0.1",
      user: "root",
      port: 70000,
    })).toThrow("端口必须是 1-65535 之间的整数");
  });

  it("rejects case-only duplicate manual hosts", () => {
    expect(() => addHost(hosts, {
      name: "PROD-WEB-01",
      host: "10.2.1.11",
      user: "DEPLOY",
      port: "22",
    })).toThrow("主机配置已存在");
  });

  it("rejects bracketed and unbracketed IPv6 duplicates", () => {
    const source = [{
      id: 9,
      name: "prod-v6",
      host: "2001:db8::20",
      user: "deploy",
      port: 2200,
    }];

    expect(() => addHost(source, {
      name: "prod-v6",
      host: "[2001:db8::20]",
      user: "deploy",
      port: "2200",
    })).toThrow("主机配置已存在");
  });

  it("updates an existing host profile while preserving connection config", () => {
    const now = new Date("2026-06-16T08:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const source = [{
      ...hosts[0],
      status: "busy",
      fav: true,
      lat: [22, 23],
      chain: ["bastion-sh"],
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080", auth: false },
      forwards: [{ id: 9, type: "L", lport: "15432", rhost: "db.internal", rport: "5432", on: true }],
    }, hosts[1]];

    const updated = updateHostProfile(source, 1, {
      name: "prod-web-main",
      host: "10.2.1.21",
      user: "ops",
      port: "2200",
      group: "生产环境",
      tags: "web, primary",
      identityFile: "~/.ssh/prod",
    });

    expect(updated[0]).toMatchObject({
      id: 1,
      name: "prod-web-main",
      host: "10.2.1.21",
      user: "ops",
      port: 2200,
      group: "生产环境",
      tags: ["web", "primary"],
      identityFile: "~/.ssh/prod",
      status: "busy",
      fav: true,
      lat: [22, 23],
      chain: ["bastion-sh"],
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080", auth: false },
      forwards: [{ id: 9, type: "L", lport: "15432", rhost: "db.internal", rport: "5432", on: true }],
      updatedAt: now.toISOString(),
    });
    expect(updated[1]).toBe(source[1]);

    vi.useRealTimers();
  });

  it("rejects editing a host into a duplicate profile", () => {
    expect(() => updateHostProfile(hosts, 2, {
      name: "prod-web-01",
      host: "10.2.1.11",
      user: "deploy",
      port: 22,
    })).toThrow("主机配置已存在");
  });

  it("rejects editing a host into a case-only duplicate profile", () => {
    expect(() => updateHostProfile(hosts, 2, {
      name: "PROD-WEB-01",
      host: "10.2.1.11",
      user: "DEPLOY",
      port: "22",
    })).toThrow("主机配置已存在");
  });

  it("rejects editing a host into a bracketed IPv6 duplicate profile", () => {
    const source = [
      { id: 1, name: "prod-v6", host: "2001:db8::20", user: "deploy", port: 2200 },
      { id: 2, name: "staging-v6", host: "2001:db8::21", user: "deploy", port: 2200 },
    ];

    expect(() => updateHostProfile(source, 2, {
      name: "prod-v6",
      host: "[2001:db8::20]",
      user: "deploy",
      port: "2200",
    })).toThrow("主机配置已存在");
  });

  it("toggles favorite state for one host", () => {
    const updated = toggleHostFavorite(hosts, 1);
    expect(updated[0].fav).toBe(true);
    expect(updated[1]).toBe(hosts[1]);

    expect(toggleHostFavorite(updated, 1)[0].fav).toBe(false);
  });

  it("removes one host", () => {
    expect(removeHost(hosts, 1)).toEqual([hosts[1]]);
    expect(removeHost(hosts, "missing")).toEqual(hosts);
  });

  it("builds a delete confirmation with target and dependent config counts", () => {
    expect(buildHostDeleteConfirmation({
      name: "prod-web",
      user: "deploy",
      host: "2001:db8::10",
      port: "2200",
      chain: ["bastion-sh", "relay-db"],
      forwards: [{ id: 1 }, { id: 2 }],
    })).toBe("删除主机 prod-web?\n\ndeploy@[2001:db8::10]:2200\n\n删除后会同时移除该主机保存的 2 个跳板节点和 2 条端口转发规则配置。");

    expect(buildHostDeleteConfirmation({ name: "  ", host: "10.0.0.2", user: "root" }))
      .toBe("删除主机 未命名主机?\n\nroot@10.0.0.2");
  });
});
