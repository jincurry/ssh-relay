import { describe, expect, it } from "vitest";
import { buildKeychainSecretDeleteConfirmation, buildKeychainSecretPromptLabel, buildKeychainSecretRowDisplay, buildKeychainSecretSaveConfirmation, buildKeychainSecretSaveErrorMessage, buildKeychainVaultDisplay, buildManageableKeychainSecrets, buildProxyKeychainSecretTarget } from "./keychainSecrets.js";

describe("keychainSecrets", () => {
  it("builds manageable target password and private-key passphrase requests", () => {
    const secrets = buildManageableKeychainSecrets([
      { id: 1, name: "web", host: "Example.COM", user: "deploy", port: 2222 },
      { id: 2, name: "db", host: "10.0.0.5", user: "dba", identityFile: " ~/.ssh/db " },
    ]);

    expect(secrets).toEqual([
      expect.objectContaining({
        label: "web",
        kindLabel: "SSH 密码",
        request: {
          host: "Example.COM",
          port: 2222,
          user: "deploy",
          kind: "password",
          privateKeyPath: null,
        },
      }),
      expect.objectContaining({
        label: "db",
        kindLabel: "私钥口令",
        request: {
          host: "10.0.0.5",
          port: 22,
          user: "dba",
          kind: "privateKeyPassphrase",
          privateKeyPath: "~/.ssh/db",
        },
      }),
    ]);
  });

  it("includes structured and resolved jump-host auth secrets", () => {
    const knownHosts = [
      { name: "relay", host: "relay.internal", user: "ops", port: 2200, identityFile: "~/.ssh/relay" },
    ];
    const secrets = buildManageableKeychainSecrets([
      {
        name: "prod",
        host: "prod.internal",
        user: "deploy",
        identityFile: "~/.ssh/prod",
        chain: ["bastion"],
        jumpHosts: [{ name: "bastion", host: "bastion.internal", user: "ops" }],
      },
      {
        name: "db",
        host: "db.internal",
        user: "dba",
        chain: ["relay"],
      },
    ], knownHosts);

    expect(secrets.map(secret => ({
      scope: secret.scope,
      host: secret.request.host,
      user: secret.request.user,
      kind: secret.request.kind,
      privateKeyPath: secret.request.privateKeyPath,
    }))).toEqual([
      { scope: "target", host: "prod.internal", user: "deploy", kind: "privateKeyPassphrase", privateKeyPath: "~/.ssh/prod" },
      { scope: "jump", host: "bastion.internal", user: "ops", kind: "password", privateKeyPath: null },
      { scope: "target", host: "db.internal", user: "dba", kind: "password", privateKeyPath: null },
      { scope: "jump", host: "relay.internal", user: "ops", kind: "privateKeyPassphrase", privateKeyPath: "~/.ssh/relay" },
    ]);
  });

  it("includes authenticated proxy passwords and removes duplicates", () => {
    const secrets = buildManageableKeychainSecrets([
      {
        name: "web-a",
        host: "10.0.0.1",
        user: "deploy",
        identityFile: "~/.ssh/web",
        proxy: { type: " HTTP ", auth: true, host: " proxy.local ", port: "bad", username: " edge " },
      },
      {
        name: "web-b",
        host: "10.0.0.2",
        user: "deploy",
        identityFile: "~/.ssh/web",
        proxy: { type: "http", auth: true, host: "PROXY.local", port: "8080", username: "edge" },
      },
    ]);

    expect(secrets.filter(secret => secret.kindLabel === "代理密码")).toEqual([
      expect.objectContaining({
        label: "HTTP proxy.local:8080",
        request: {
          host: "proxy.local",
          port: 8080,
          user: "edge",
          kind: "proxyPassword",
          privateKeyPath: null,
        },
      }),
    ]);
  });

  it("builds normalized proxy keychain targets for prompt and vault paths", () => {
    expect(buildProxyKeychainSecretTarget({
      type: " HTTP ",
      auth: true,
      host: " proxy.local ",
      port: "bad",
      username: " edge ",
    })).toEqual({
      name: "HTTP proxy.local:8080",
      host: "proxy.local",
      port: 8080,
      user: "edge",
    });

    expect(buildProxyKeychainSecretTarget({
      type: "socks5",
      auth: true,
      host: "proxy.local",
      username: "edge",
    })).toEqual({
      name: "SOCKS5 proxy.local:1080",
      host: "proxy.local",
      port: 1080,
      user: "edge",
    });

    expect(buildProxyKeychainSecretTarget({
      type: "http",
      auth: true,
      host: " [2001:db8::40] ",
      port: "8080",
      username: " edge ",
    })).toEqual({
      name: "HTTP [2001:db8::40]:8080",
      host: "2001:db8::40",
      port: 8080,
      user: "edge",
    });

    expect(buildProxyKeychainSecretTarget({
      type: "http",
      auth: false,
      host: "proxy.local",
      username: "edge",
    })).toBeNull();
  });

  it("builds vault keychain section display metadata", () => {
    expect(buildKeychainVaultDisplay({ desktop: true })).toEqual({
      sectionTitle: "钥匙串口令",
      sectionSubtitle: "按当前主机、跳板和代理配置推导可清理的系统钥匙串条目;不会显示口令内容。",
      defaultMessage: "可清除已保存的 SSH 密码、私钥口令和代理密码",
      emptyText: "当前主机配置没有可推导的钥匙串口令条目。",
      clearText: "清除",
      clearingText: "清除中",
    });
    expect(buildKeychainVaultDisplay({ desktop: false }).defaultMessage).toBe("系统钥匙串仅在桌面端可用");
  });

  it("builds vault keychain row display metadata", () => {
    expect(buildKeychainSecretRowDisplay({
      label: " relay ",
      kindLabel: " 私钥口令 ",
      ownerName: " prod-web ",
      request: {
        host: "2001:db8::10",
        port: 2222,
        user: "ops",
        kind: "privateKeyPassphrase",
        privateKeyPath: " ~/.ssh/relay ",
      },
    }, { clearing: true })).toEqual({
      label: "relay",
      kindLabel: "私钥口令",
      ownerName: "prod-web",
      target: "ops@[2001:db8::10]:2222",
      privateKeyPath: "~/.ssh/relay",
      clearText: "清除中",
    });

    expect(buildKeychainSecretRowDisplay({ request: {} })).toEqual({
      label: "未命名条目",
      kindLabel: "钥匙串口令",
      ownerName: "当前配置",
      target: "",
      privateKeyPath: null,
      clearText: "清除",
    });
  });

  it("uses visible chain selection when deriving jump-host keychain secrets", () => {
    const hosts = [{
      name: "prod-api",
      host: "10.0.0.6",
      user: "deploy",
      identityFile: "~/.ssh/prod",
      chain: ["active-bastion"],
      jumpHosts: [{ name: "old-bastion", host: "old.example", user: "ops", identityFile: "~/.ssh/old" }],
    }];
    const knownHosts = [{
      name: "active-bastion",
      host: "active.example",
      user: "ops",
      identityFile: "~/.ssh/active",
    }];

    const secrets = buildManageableKeychainSecrets(hosts, knownHosts);
    expect(secrets.map(secret => ({
      scope: secret.scope,
      host: secret.request.host,
      privateKeyPath: secret.request.privateKeyPath,
    }))).toEqual([
      { scope: "target", host: "10.0.0.6", privateKeyPath: "~/.ssh/prod" },
      { scope: "jump", host: "active.example", privateKeyPath: "~/.ssh/active" },
    ]);
  });

  it("builds explicit delete confirmations for keychain secrets", () => {
    expect(buildKeychainSecretDeleteConfirmation({
      label: "web",
      kindLabel: "SSH 密码",
      ownerName: "web",
      request: { host: "2001:db8::10", port: 2222, user: "deploy", kind: "password" },
    })).toBe("清除 web 的 SSH 密码?\n\ndeploy@[2001:db8::10]:2222\n\n只会删除系统钥匙串中的口令内容,不会删除 RELAY 主机、跳板或代理配置。");

    expect(buildKeychainSecretDeleteConfirmation({
      label: "relay",
      kindLabel: "私钥口令",
      ownerName: "prod-web",
      request: { host: "relay.internal", port: 22, user: "ops", kind: "privateKeyPassphrase", privateKeyPath: " ~/.ssh/relay " },
    })).toBe("清除 relay 的私钥口令?\n\n所属主机: prod-web\n\nops@relay.internal:22\n\nIdentityFile: ~/.ssh/relay\n\n只会删除系统钥匙串中的口令内容,不会删除 RELAY 主机、跳板或代理配置。");
  });

  it("builds explicit save confirmations for keychain secrets", () => {
    expect(buildKeychainSecretSaveConfirmation({
      name: "prod-db",
      host: "2001:db8::22",
      port: 2222,
      user: "dba",
      identityFile: " ~/.ssh/prod db ",
    }, "privateKeyPassphrase")).toBe("将 prod-db 的私钥口令保存到系统钥匙串?\n\ndba@[2001:db8::22]:2222\n\nIdentityFile: ~/.ssh/prod db\n\n保存后 RELAY 会在终端、SFTP、端口转发和跳板认证中按需读取该口令。\n配置导出不会包含这个口令。");

    expect(buildKeychainSecretSaveConfirmation({
      name: "HTTP proxy.local:8080",
      host: "proxy.local",
      port: 8080,
      user: "edge",
    }, "proxyPassword")).toBe("将 HTTP proxy.local:8080 的代理密码保存到系统钥匙串?\n\nedge@proxy.local:8080\n\n保存后 RELAY 会在终端、SFTP、端口转发和跳板认证中按需读取该口令。\n配置导出不会包含这个口令。");
  });

  it("builds explicit prompt labels for entering connection secrets", () => {
    expect(buildKeychainSecretPromptLabel({
      name: "prod-web",
      host: "2001:db8::20",
      port: 2222,
      user: "deploy",
    }, "password")).toBe("输入 prod-web 的 SSH 密码\n\ndeploy@[2001:db8::20]:2222");

    expect(buildKeychainSecretPromptLabel({
      name: "prod-db",
      host: "db.internal",
      user: "dba",
      identityFile: " ~/.ssh/prod-db ",
    }, "privateKeyPassphrase")).toBe("输入 prod-db 的私钥口令(可留空)\n\ndba@db.internal:22\n\nIdentityFile: ~/.ssh/prod-db");

    expect(buildKeychainSecretPromptLabel({
      name: "HTTP proxy.local:8080",
      host: "proxy.local",
      port: 8080,
      user: "edge",
    }, "proxyPassword")).toBe("输入 HTTP proxy.local:8080 的代理密码\n\nedge@proxy.local:8080");
  });

  it("builds contextual keychain save error messages", () => {
    expect(buildKeychainSecretSaveErrorMessage({
      name: "prod-db",
      host: "db.internal",
      user: "dba",
      identityFile: " ~/.ssh/prod-db ",
    }, "privateKeyPassphrase", new Error("permission denied"))).toBe("prod-db 的私钥口令保存到系统钥匙串失败。\n\ndba@db.internal:22\n\nIdentityFile: ~/.ssh/prod-db\n\npermission denied");

    expect(buildKeychainSecretSaveErrorMessage({
      name: "HTTP proxy.local:8080",
      host: "proxy.local",
      port: 8080,
      user: "edge",
    }, "proxyPassword", "")).toBe("HTTP proxy.local:8080 的代理密码保存到系统钥匙串失败。\n\nedge@proxy.local:8080\n\n未知错误");
  });
});
