import { describe, expect, it, vi } from "vitest";
import { buildProxyFieldDisplay, buildProxyModeOptions, jumpHostsMatchChain, normalizeConnectTimeoutMs, normalizeIdentityFile, normalizeJumpHostProfile, normalizeJumpHosts, normalizeProxy, normalizeProxyForAuth, normalizeProxyProfile, normalizeServerAliveCountMax, normalizeServerAliveIntervalMs, resolveChainJumpHosts, resolveSshAuth, selectJumpHostsForHost } from "./sessionAuth.js";

describe("sessionAuth", () => {
  it("builds an SSH request from identityFile without prompting for password", async () => {
    const passwordProvider = vi.fn();
    const req = await resolveSshAuth({
      host: "10.2.1.11",
      port: 2222,
      user: "deploy",
      identityFile: "~/.ssh/id_ed25519",
    }, { passwordProvider });

    expect(req).toMatchObject({
      host: "10.2.1.11",
      port: 2222,
      user: "deploy",
      privateKeyPath: "~/.ssh/id_ed25519",
      password: null,
      totpCode: null,
    });
    expect(passwordProvider).not.toHaveBeenCalled();
  });

  it("treats privateKeyPath as an IdentityFile-compatible fallback", async () => {
    const passwordProvider = vi.fn();
    const req = await resolveSshAuth({
      host: "10.2.1.11",
      user: "deploy",
      privateKeyPath: " ~/.ssh/runtime_ed25519 ",
    }, { passwordProvider });

    expect(req).toMatchObject({
      privateKeyPath: "~/.ssh/runtime_ed25519",
      password: null,
    });
    expect(passwordProvider).not.toHaveBeenCalled();
  });

  it("prompts for a password when no identity file exists", async () => {
    const req = await resolveSshAuth({
      host: "192.168.3.40",
      user: "ubuntu",
    }, { passwordProvider: async () => "secret" });

    expect(req).toMatchObject({
      host: "192.168.3.40",
      port: 22,
      user: "ubuntu",
      privateKeyPath: null,
      password: "secret",
      totpCode: null,
    });
  });

  it("preserves target host-key policy in backend auth requests", async () => {
    const req = await resolveSshAuth({
      host: "192.0.2.10",
      user: "deploy",
      identityFile: "~/.ssh/prod",
      strictHostKey: false,
      trustUnknownHostKey: true,
      connectTimeoutMs: 5000,
      serverAliveIntervalMs: 15000,
      serverAliveCountMax: 4,
    });

    expect(req).toMatchObject({
      strictHostKey: false,
      trustUnknownHostKey: true,
      connectTimeoutMs: 5000,
      serverAliveIntervalMs: 15000,
      serverAliveCountMax: 4,
    });
  });

  it("normalizes connect timeout values for backend requests", () => {
    expect(normalizeConnectTimeoutMs(50)).toBe(100);
    expect(normalizeConnectTimeoutMs(5000.4)).toBe(5000);
    expect(normalizeConnectTimeoutMs(60000)).toBe(30000);
    expect(normalizeConnectTimeoutMs("bad")).toBeNull();
  });

  it("normalizes server-alive values for backend requests", () => {
    expect(normalizeServerAliveIntervalMs(500)).toBe(1000);
    expect(normalizeServerAliveIntervalMs(15_000.4)).toBe(15000);
    expect(normalizeServerAliveIntervalMs(900_000)).toBe(600000);
    expect(normalizeServerAliveIntervalMs("bad")).toBeNull();
    expect(normalizeServerAliveCountMax(-1)).toBeNull();
    expect(normalizeServerAliveCountMax(2.4)).toBe(2);
    expect(normalizeServerAliveCountMax(99)).toBe(20);
  });

  it("includes normalized proxy settings in SSH auth requests", async () => {
    const req = await resolveSshAuth({
      host: "10.2.1.11",
      port: 22,
      user: "deploy",
      identityFile: "~/.ssh/id_ed25519",
      proxy: { type: "socks5", host: " 127.0.0.1 ", port: "1080" },
    });

    expect(req.proxy).toEqual({
      kind: "socks5",
      host: "127.0.0.1",
      port: 1080,
      username: null,
      password: null,
      cmd: null,
    });
  });

  it("adds proxy passwords from the proxy secret provider only when auth is enabled", async () => {
    const proxyPasswordProvider = vi.fn(async () => "proxy-secret");
    const req = await resolveSshAuth({
      host: "10.2.1.11",
      user: "deploy",
      identityFile: "~/.ssh/id_ed25519",
      proxy: { type: "http", host: "proxy.local", port: "8080", auth: true, username: "edge" },
    }, { proxyPasswordProvider });

    expect(req.proxy).toEqual({
      kind: "http",
      host: "proxy.local",
      port: 8080,
      username: "edge",
      password: "proxy-secret",
      cmd: null,
    });
    expect(proxyPasswordProvider).toHaveBeenCalledWith(expect.objectContaining({
      host: "proxy.local",
      username: "edge",
    }));
  });

  it("includes normalized jump hosts in SSH auth requests", async () => {
    const req = await resolveSshAuth({
      host: "10.2.1.11",
      port: 22,
      user: "deploy",
      identityFile: "~/.ssh/id_ed25519",
      jumpHosts: [{
        host: "bastion.internal",
        port: "2222",
        user: "ops",
        identityFile: [" ~/.ssh/bastion "],
        proxy: { type: "cmd", cmd: "connect %h %p" },
        strictHostKey: false,
        connectTimeoutMs: 7000,
        serverAliveIntervalMs: 15000,
        serverAliveCountMax: 4,
      }],
    });

    expect(req.jumpHosts).toEqual([{
      host: "bastion.internal",
      port: 2222,
      user: "ops",
      password: null,
      privateKeyPath: "~/.ssh/bastion",
      privateKeyPassphrase: null,
      totpCode: null,
      proxy: {
        kind: "cmd",
        host: null,
        port: null,
        username: null,
        password: null,
        cmd: "connect %h %p",
      },
      strictHostKey: false,
      trustUnknownHostKey: false,
      connectTimeoutMs: 7000,
      serverAliveIntervalMs: 15000,
      serverAliveCountMax: 4,
    }]);
  });

  it("resolves saved chain names into jump hosts from known hosts", async () => {
    const req = await resolveSshAuth({
      host: "10.2.2.5",
      user: "dba",
      identityFile: "~/.ssh/db",
      chain: ["bastion-sh"],
    }, {
      knownHosts: [{
        name: "bastion-sh",
        host: "bastion.internal",
        port: 2222,
        user: "ops",
        identityFile: "~/.ssh/bastion",
        connectTimeoutMs: 9000,
        serverAliveIntervalMs: 20000,
        serverAliveCountMax: 2,
      }],
    });

    expect(req.jumpHosts[0]).toMatchObject({
      host: "bastion.internal",
      port: 2222,
      user: "ops",
      privateKeyPath: "~/.ssh/bastion",
      connectTimeoutMs: 9000,
      serverAliveIntervalMs: 20000,
      serverAliveCountMax: 2,
    });
  });

  it("ignores stale structured jump hosts when the visible chain changed", async () => {
    const req = await resolveSshAuth({
      host: "10.2.2.5",
      user: "dba",
      identityFile: "~/.ssh/db",
      chain: ["new-bastion"],
      jumpHosts: [{
        name: "old-bastion",
        host: "old.example",
        port: 2200,
        user: "old",
        identityFile: "~/.ssh/old",
      }],
    }, {
      knownHosts: [{
        name: "new-bastion",
        host: "new.example",
        port: 2222,
        user: "ops",
        identityFile: "~/.ssh/new",
      }],
    });

    expect(req.jumpHosts[0]).toMatchObject({
      host: "new.example",
      port: 2222,
      user: "ops",
      privateKeyPath: "~/.ssh/new",
    });
  });

  it("clears jump hosts when the visible chain is saved as direct", async () => {
    const req = await resolveSshAuth({
      host: "10.2.2.5",
      user: "dba",
      identityFile: "~/.ssh/db",
      chain: [],
      jumpHosts: [{ name: "old-bastion", host: "old.example", user: "ops" }],
    });

    expect(req.jumpHosts).toBeNull();
  });

  it("rejects missing credentials", async () => {
    await expect(resolveSshAuth({
      host: "192.168.3.40",
      user: "ubuntu",
    }, { passwordProvider: async () => "" })).rejects.toThrow("需要提供 SSH 密码或配置 IdentityFile 私钥");
  });

  it("rejects incomplete SSH targets with localized errors", async () => {
    await expect(resolveSshAuth({
      host: "",
      user: "ubuntu",
    })).rejects.toThrow("SSH 主机地址不能为空");

    await expect(resolveSshAuth({
      host: "192.168.3.40",
      user: "",
    })).rejects.toThrow("SSH 登录用户不能为空");
  });

  it("normalizes array identity files from imported configs", () => {
    expect(normalizeIdentityFile([" ~/.ssh/work ", "~/.ssh/fallback"])).toBe("~/.ssh/work");
    expect(normalizeIdentityFile("")).toBeNull();
  });

  it("normalizes persistable jump host profiles without runtime secrets", () => {
    expect(normalizeJumpHostProfile({
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
      connectTimeoutMs: 50_000,
      serverAliveIntervalMs: 500,
      serverAliveCountMax: 50,
    })).toEqual({
      name: "bastion",
      host: "bastion.internal",
      user: "ops",
      port: "22",
      identityFile: "~/.ssh/bastion",
      totpProfileId: "prod-2fa",
      connectTimeoutMs: 30_000,
      serverAliveIntervalMs: 1000,
      serverAliveCountMax: 20,
      proxy: {
        type: "http",
        host: "proxy.local",
        port: "8080",
        auth: true,
        username: "edge",
        cmd: "connect -S %h:%p",
      },
      strictHostKey: false,
    });

    expect(normalizeJumpHostProfile({ host: "bastion" })).toBeNull();
  });

  it("normalizes bracketed IPv6 jump host addresses before persistence", () => {
    expect(normalizeJumpHostProfile({
      name: "relay-v6",
      host: " [2001:db8::20] ",
      user: " ops ",
      port: "2200",
    })).toMatchObject({
      name: "relay-v6",
      host: "2001:db8::20",
      user: "ops",
      port: "2200",
    });
  });

  it("normalizes proxy configs for backend requests", () => {
    expect(normalizeProxy(null)).toBeNull();
    expect(normalizeProxy({ type: "none" })).toBeNull();
    expect(normalizeProxy({ type: " HTTP ", host: " proxy.local ", port: "bad" })).toEqual({
      kind: "http",
      host: "proxy.local",
      port: 8080,
      username: null,
      password: null,
      cmd: null,
    });
    expect(normalizeProxy({ type: "cmd", cmd: "connect -S %h:%p" })).toEqual({
      kind: "cmd",
      host: null,
      port: null,
      username: null,
      password: null,
      cmd: "connect -S %h:%p",
    });
  });

  it("disables custom proxy commands that contain sensitive-looking shell text", () => {
    expect(normalizeProxyProfile({
      type: "cmd",
      cmd: "sshpass -p secret ssh -W %h:%p bastion",
    })).toEqual({
      type: "none",
      host: "127.0.0.1",
      port: "1080",
      auth: false,
      username: undefined,
      cmd: "connect -S %h:%p",
    });

    expect(normalizeProxy({
      type: "cmd",
      cmd: "curl -H 'Authorization: Bearer token' https://proxy.example/connect %h %p",
    })).toBeNull();
  });

  it("normalizes bracketed IPv6 proxy hosts for backend requests", () => {
    expect(normalizeProxy({ type: "socks5", host: " [2001:db8::40] ", port: "1080" })).toEqual({
      kind: "socks5",
      host: "2001:db8::40",
      port: 1080,
      username: null,
      password: null,
      cmd: null,
    });
  });

  it("normalizes persistable proxy profiles without keeping passwords", () => {
    expect(normalizeProxyProfile({
      kind: " SOCKS5 ",
      host: " proxy.local ",
      port: "bad",
      auth: true,
      username: " edge ",
      password: "secret",
    })).toEqual({
      type: "socks5",
      host: "proxy.local",
      port: "1080",
      auth: true,
      username: "edge",
      cmd: "connect -S %h:%p",
    });

    expect(normalizeProxyProfile({
      kind: " HTTP ",
      host: " [2001:db8::41] ",
      port: "8080",
      auth: true,
      username: " edge ",
    })).toEqual({
      type: "http",
      host: "2001:db8::41",
      port: "8080",
      auth: true,
      username: "edge",
      cmd: "connect -S %h:%p",
    });

    expect(normalizeProxyProfile({ type: "unknown", password: "secret" })).toEqual({
      type: "none",
      host: "127.0.0.1",
      port: "1080",
      auth: false,
      username: undefined,
      cmd: "connect -S %h:%p",
    });
  });

  it("builds proxy mode option display metadata from normalized proxy profiles", () => {
    const options = buildProxyModeOptions({ kind: " HTTP ", host: " proxy.local ", port: "bad" });

    expect(options.map(option => ({ type: option.type, selected: option.selected }))).toEqual([
      { type: "none", selected: false },
      { type: "socks5", selected: false },
      { type: "http", selected: true },
      { type: "cmd", selected: false },
    ]);
    expect(options.find(option => option.type === "http")).toMatchObject({
      label: "HTTP CONNECT",
      description: "企业网关常见",
      colorKey: "blue",
      borderKey: "blue",
      backgroundKey: "blueSoft",
    });
    expect(options.find(option => option.type === "socks5")).toMatchObject({
      colorKey: "text",
      borderKey: "line",
      backgroundKey: "panelHi",
    });
  });

  it("builds conditional proxy field display metadata", () => {
    expect(buildProxyFieldDisplay({ type: "socks5", auth: true })).toEqual({
      type: "socks5",
      showEndpointFields: true,
      showAuthFields: true,
      showCommandField: false,
      hostLabel: "代理地址",
      portLabel: "端口",
      authLabel: "需要用户名密码认证",
      usernameLabel: "代理用户名",
      passwordLabel: "代理密码",
      passwordPlaceholder: "留空则连接时询问",
      commandLabel: "自定义命令(%h %p 为目标占位符)",
    });

    expect(buildProxyFieldDisplay({ type: "cmd", cmd: "connect -S %h:%p" })).toMatchObject({
      type: "cmd",
      showEndpointFields: false,
      showAuthFields: false,
      showCommandField: true,
    });
    expect(buildProxyFieldDisplay({ type: "none", auth: true })).toMatchObject({
      type: "none",
      showEndpointFields: false,
      showAuthFields: false,
      showCommandField: false,
    });
  });

  it("keeps proxy auth metadata separate from plain normalized proxy configs", async () => {
    expect(normalizeProxy({ type: "socks5", host: "proxy", port: "1080", auth: true, username: "ops", password: "secret" }))
      .toEqual({
        kind: "socks5",
        host: "proxy",
        port: 1080,
        username: "ops",
        password: null,
        cmd: null,
      });

    await expect(normalizeProxyForAuth({
      type: "socks5",
      host: "proxy",
      port: "1080",
      auth: true,
      username: "ops",
      password: "secret",
    })).resolves.toEqual({
      kind: "socks5",
      host: "proxy",
      port: 1080,
      username: "ops",
      password: "secret",
      cmd: null,
    });
  });

  it("normalizes jump hosts with provider supplied passwords", async () => {
    const jumpHosts = await normalizeJumpHosts([{
      host: " [2001:db8::30] ",
      user: "root",
    }], { passwordProvider: async () => "secret" });

    expect(jumpHosts[0]).toMatchObject({
      host: "2001:db8::30",
      port: 22,
      user: "root",
      password: "secret",
      privateKeyPath: null,
      totpCode: null,
    });
  });

  it("skips malformed jump hosts before building runtime auth requests", async () => {
    const jumpHosts = await normalizeJumpHosts([
      { host: "missing-user" },
      { host: " bastion ", user: " ops ", privateKeyPath: " ~/.ssh/bastion " },
    ], { passwordProvider: async () => "secret" });

    expect(jumpHosts).toEqual([
      expect.objectContaining({
        host: "bastion",
        user: "ops",
        privateKeyPath: "~/.ssh/bastion",
        password: null,
      }),
    ]);
  });

  it("includes provider supplied TOTP codes for target and jump hosts", async () => {
    const req = await resolveSshAuth({
      host: "10.2.1.11",
      user: "deploy",
      password: "ignored",
      jumpHosts: [{ host: "bastion", user: "ops" }],
    }, {
      passwordProvider: async host => host.host === "bastion" ? "jump-secret" : "secret",
      totpProvider: async host => host.host === "bastion" ? "654321" : "123456",
    });

    expect(req.totpCode).toBe("123456");
    expect(req.jumpHosts[0]).toMatchObject({
      password: "jump-secret",
      totpCode: "654321",
    });
  });

  it("falls back to chain labels when no known host matches", () => {
    expect(resolveChainJumpHosts({
      host: "10.0.0.5",
      user: "deploy",
      chain: ["bastion"],
    })).toEqual([{
      name: "bastion",
      host: "bastion",
      port: 22,
      user: "deploy",
      identityFile: undefined,
      privateKeyPath: undefined,
      privateKeyPassphrase: undefined,
      password: undefined,
      totpCode: undefined,
      proxy: undefined,
      strictHostKey: undefined,
      trustUnknownHostKey: undefined,
    }]);
  });

  it("selects structured jump hosts only when they still match the visible chain", () => {
    const matching = [{
      name: "bastion-sh",
      host: "203.0.113.10",
      user: "ops",
    }];

    expect(jumpHostsMatchChain(matching, ["bastion-sh"])).toBe(true);
    expect(jumpHostsMatchChain(matching, ["bastion-bj"])).toBe(false);
    expect(selectJumpHostsForHost({ chain: ["bastion-sh"], jumpHosts: matching })).toBe(matching);
    expect(selectJumpHostsForHost({ chain: [], jumpHosts: matching })).toBeNull();
  });
});
