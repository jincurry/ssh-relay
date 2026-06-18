import { describe, expect, it } from "vitest";
import { buildSshCommand, buildSshCommandPreviewDisplay, buildSshCommandStatusMessage, quoteSshArg } from "./sshCommand.js";

const host = { user: "deploy", host: "10.2.1.11" };

describe("buildSshCommand", () => {
  it("builds direct ssh command", () => {
    expect(buildSshCommand({ host })).toBe("ssh \\\n    deploy@10.2.1.11");
  });

  it("includes non-default ssh ports", () => {
    expect(buildSshCommand({ host: { ...host, port: 2222 } })).toBe("ssh \\\n    -p 2222 \\\n    deploy@10.2.1.11");
  });

  it("brackets IPv6 final targets while keeping ports in -p", () => {
    expect(buildSshCommand({ host: { user: "ops", host: "2001:db8::1", port: 2200 } }))
      .toBe("ssh \\\n    -p 2200 \\\n    'ops@[2001:db8::1]'");
  });

  it("includes host identity files", () => {
    expect(buildSshCommand({ host: { ...host, identityFile: "~/.ssh/prod_ed25519" } }))
      .toContain("-i ~/.ssh/prod_ed25519");
  });

  it("includes imported host-key policy options", () => {
    expect(buildSshCommand({ host: { ...host, strictHostKey: false } }))
      .toContain("-o StrictHostKeyChecking=no");
    expect(buildSshCommand({ host: { ...host, strictHostKey: true, trustUnknownHostKey: true } }))
      .toContain("-o StrictHostKeyChecking=accept-new");
  });

  it("includes imported connection timeouts", () => {
    expect(buildSshCommand({ host: { ...host, connectTimeoutMs: 5000 } }))
      .toContain("-o ConnectTimeout=5");
  });

  it("includes imported server-alive options", () => {
    const command = buildSshCommand({ host: { ...host, serverAliveIntervalMs: 15000, serverAliveCountMax: 4 } });
    expect(command).toContain("-o ServerAliveInterval=15");
    expect(command).toContain("-o ServerAliveCountMax=4");
  });

  it("uses privateKeyPath as an IdentityFile-compatible fallback", () => {
    expect(buildSshCommand({ host: { ...host, privateKeyPath: " ~/.ssh/runtime_ed25519 " } }))
      .toContain("-i ~/.ssh/runtime_ed25519");
  });

  it("includes jump chain, proxy and active forwards", () => {
    const command = buildSshCommand({
      host,
      chain: ["bastion-sh", "relay-db"],
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080" },
      forwards: [
        { type: "L", lport: "5432", rhost: "10.2.2.5", rport: "5432", on: true },
        { type: "D", lport: "1086", rhost: "", rport: "", on: false }
      ]
    });

    expect(command).toContain("-o 'ProxyCommand=nc -X 5 -x 127.0.0.1:1080 %h %p'");
    expect(command).toContain("-J bastion-sh,relay-db");
    expect(command).toContain("-L 5432:10.2.2.5:5432");
    expect(command).not.toContain("-D 1086");
    expect(command.endsWith("deploy@10.2.1.11")).toBe(true);
  });

  it("preserves remote-forward target hosts in equivalent commands", () => {
    const command = buildSshCommand({
      host,
      forwards: [
        { type: "R", lport: "8080", rhost: "app.internal", rport: "18080", on: true },
        { type: "L", lport: "15432", rhost: "2001:db8::20", rport: "5432", on: true },
      ],
    });

    expect(command).toContain("-R 18080:app.internal:8080");
    expect(command).toContain("-L '15432:[2001:db8::20]:5432'");
  });

  it("normalizes forwarding rules before rendering equivalent commands", () => {
    const command = buildSshCommand({
      host,
      forwards: [
        { type: " l ", lport: " 15432 ", rhost: " db.internal ", rport: " 5432 ", on: true },
        { type: " d ", lport: " 1086 ", rhost: "ignored", rport: "ignored", on: true },
        { type: "X", lport: "9999", rhost: "bad", rport: "80", on: true },
        { type: "R", lport: "bad", rhost: "app", rport: "18080", on: true },
      ],
    });

    expect(command).toContain("-L 15432:db.internal:5432");
    expect(command).toContain("-D 1086");
    expect(command).not.toContain("ignored");
    expect(command).not.toContain("bad");
    expect(command).not.toContain("-R 18080");
  });

  it("defaults remote-forward target hosts to loopback when absent", () => {
    const command = buildSshCommand({
      host,
      forwards: [{ type: "R", lport: "8080", rport: "18080", on: true }],
    });

    expect(command).toContain("-R 18080:127.0.0.1:8080");
  });

  it("uses structured jump hosts when they match the visible chain", () => {
    const command = buildSshCommand({
      host,
      chain: ["bastion-sh", "relay-v6"],
      jumpHosts: [
        { name: "bastion-sh", host: "203.0.113.10", user: "ops", port: 2222 },
        { name: "relay-v6", host: "2001:db8::7", user: "relay", port: 22 },
      ],
    });

    expect(command).toContain("-J 'ops@203.0.113.10:2222,relay@[2001:db8::7]'");
  });

  it("normalizes structured jump hosts before rendering ProxyJump", () => {
    const command = buildSshCommand({
      host,
      chain: ["bastion-sh", "relay-db"],
      jumpHosts: [
        { name: " bastion-sh ", host: " 203.0.113.10 ", user: " ops ", port: "bad" },
        { name: "relay-db", host: "relay.internal", port: "2222" },
      ],
    });

    expect(command).toContain("-J ops@203.0.113.10,deploy@relay.internal:2222");
  });

  it("expands structured jump hosts when per-hop options cannot be represented by ProxyJump", () => {
    const command = buildSshCommand({
      host,
      chain: ["bastion-sh"],
      jumpHosts: [
        {
          name: "bastion-sh",
          host: "bastion.internal",
          user: "ops",
          port: 2222,
          identityFile: "~/.ssh/bastion key",
          trustUnknownHostKey: true,
          connectTimeoutMs: 7000,
          serverAliveIntervalMs: 20000,
          serverAliveCountMax: 2,
        },
      ],
    });

    expect(command).not.toContain("-J");
    expect(command).toContain("-o 'ProxyCommand=ssh -i '\\''~/.ssh/bastion key'\\'' -o StrictHostKeyChecking=accept-new -o ConnectTimeout=7 -o ServerAliveInterval=20 -o ServerAliveCountMax=2 -p 2222 -W %h:%p ops@bastion.internal'");
  });

  it("nests expanded ProxyCommand routes for multi-hop jump metadata", () => {
    const command = buildSshCommand({
      host,
      chain: ["bastion-sh", "relay-db"],
      jumpHosts: [
        { name: "bastion-sh", host: "bastion.internal", user: "ops", port: 2222, identityFile: "~/.ssh/bastion" },
        { name: "relay-db", host: "relay.internal", user: "relay", port: 2200 },
      ],
    });

    expect(command).not.toContain("-J");
    expect(command).toContain("ProxyCommand=ssh -o '\\''ProxyCommand=ssh -i ~/.ssh/bastion -p 2222 -W %%h:%%p ops@bastion.internal'\\'' -p 2200 -W %h:%p relay@relay.internal");
  });

  it("routes local proxies into the first expanded structured jump host", () => {
    const command = buildSshCommand({
      host,
      chain: ["bastion-sh"],
      jumpHosts: [
        { name: "bastion-sh", host: "bastion.internal", user: "ops", port: 2222 },
      ],
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080" },
    });

    expect(command).not.toContain("-J");
    expect(command).toContain("-o 'ProxyCommand=ssh -o '\\''ProxyCommand=nc -X 5 -x 127.0.0.1:1080 %%h %%p'\\'' -p 2222 -W %h:%p ops@bastion.internal'");
  });

  it("falls back to visible chain labels when structured jump hosts are stale", () => {
    const command = buildSshCommand({
      host,
      chain: ["new-bastion"],
      jumpHosts: [{ name: "old-bastion", host: "203.0.113.10", user: "ops", port: 2222 }],
    });

    expect(command).toContain("-J new-bastion");
    expect(command).not.toContain("old-bastion");
    expect(command).not.toContain("203.0.113.10");
  });

  it("supports HTTP CONNECT and custom ProxyCommand", () => {
    expect(buildSshCommand({ host, proxy: { type: " HTTP ", host: " proxy.local ", port: "bad" } }))
      .toContain("-o 'ProxyCommand=nc -X connect -x proxy.local:8080 %h %p'");

    expect(buildSshCommand({ host, proxy: { type: "cmd", cmd: " connect -S %h:%p " } }))
      .toContain("-o 'ProxyCommand=connect -S %h:%p'");
  });

  it("brackets IPv6 proxy hosts in copied OpenSSH ProxyCommand output", () => {
    expect(buildSshCommand({
      host,
      proxy: { type: "socks5", host: " [2001:db8::40] ", port: "1080" },
    })).toContain("-o 'ProxyCommand=nc -X 5 -x [2001:db8::40]:1080 %h %p'");

    expect(buildSshCommand({
      host,
      proxy: { type: "http", host: "2001:db8::41", port: "8080" },
    })).toContain("-o 'ProxyCommand=nc -X connect -x [2001:db8::41]:8080 %h %p'");
  });

  it("warns when copied commands omit RELAY-managed proxy passwords", () => {
    const command = buildSshCommand({
      host,
      proxy: { type: "http", host: "proxy.local", port: "8080", auth: true, username: "edge", password: "secret" },
    });

    expect(command).toContain("# RELAY 代理认证使用系统钥匙串;复制的 OpenSSH 命令不会包含代理密码。");
    expect(command).toContain("ssh \\\n    -o 'ProxyCommand=nc -X connect -x proxy.local:8080 %h %p'");
    expect(command).not.toContain("secret");
  });

  it("warns when expanded jump-host proxy passwords are omitted from copied commands", () => {
    const command = buildSshCommand({
      host,
      chain: ["bastion-sh"],
      jumpHosts: [{
        name: "bastion-sh",
        host: "bastion.internal",
        user: "ops",
        proxy: { type: "socks5", host: "proxy.local", port: "1080", auth: true, username: "edge", password: "secret" },
      }],
    });

    expect(command).toContain("# RELAY 代理认证使用系统钥匙串;复制的 OpenSSH 命令不会包含代理密码。");
    expect(command).toContain("ProxyCommand=ssh -o");
    expect(command).toContain("ProxyCommand=nc -X 5 -x proxy.local:1080 %%h %%p");
    expect(command).not.toContain("secret");
  });

  it("omits sensitive-looking custom ProxyCommand text from copied commands", () => {
    const direct = buildSshCommand({
      host,
      proxy: { type: "cmd", cmd: "sshpass -p secret ssh -W %h:%p bastion" },
    });

    expect(direct).not.toContain("ProxyCommand=");
    expect(direct).not.toContain("sshpass");
    expect(direct).not.toContain("secret");

    const jumped = buildSshCommand({
      host,
      chain: ["bastion-sh"],
      jumpHosts: [{
        name: "bastion-sh",
        host: "bastion.internal",
        user: "ops",
        proxy: { type: "cmd", cmd: "curl -H 'Authorization: Bearer token' https://proxy.example/connect %h %p" },
      }],
    });

    expect(jumped).toContain("-J ops@bastion.internal");
    expect(jumped).not.toContain("Authorization");
    expect(jumped).not.toContain("Bearer token");
  });

  it("quotes command arguments that contain spaces or shell metacharacters", () => {
    const command = buildSshCommand({
      host: { ...host, identityFile: "~/Keys/prod key'ed25519" },
      proxy: { type: "cmd", cmd: "sh -lc 'connect %h %p'" },
      forwards: [
        { type: "L", lport: "15432", rhost: "db internal", rport: "5432", on: true },
      ],
    });

    expect(command).toContain("-i '~/Keys/prod key'\\''ed25519'");
    expect(command).toContain("-o 'ProxyCommand=sh -lc '\\''connect %h %p'\\'''");
    expect(command).toContain("-L '15432:db internal:5432'");
  });

  it("leaves safe ssh arguments unquoted", () => {
    expect(quoteSshArg("deploy@10.2.1.11")).toBe("deploy@10.2.1.11");
    expect(quoteSshArg("bastion-sh,relay-db")).toBe("bastion-sh,relay-db");
    expect(quoteSshArg("")).toBe("''");
  });

  it("builds explicit equivalent-command status messages", () => {
    expect(buildSshCommandStatusMessage(" 已复制 ")).toEqual({ text: "已复制", tone: "success" });
    expect(buildSshCommandStatusMessage("复制失败", "error")).toEqual({ text: "复制失败", tone: "error" });
    expect(buildSshCommandStatusMessage("状态已记录", "warn")).toEqual({ text: "状态已记录", tone: "success" });
  });

  it("builds equivalent-command preview display metadata", () => {
    expect(buildSshCommandPreviewDisplay(" ssh deploy@10.2.1.11 ", { text: " 已复制 " })).toEqual({
      commandText: "ssh deploy@10.2.1.11",
      copyText: "ssh deploy@10.2.1.11",
      copyButtonLabel: "⧉ 复制命令",
      copyButtonTitle: "复制等效 OpenSSH 命令",
      copyDisabled: false,
      statusText: "已复制",
      statusTone: "success",
      statusVisible: true,
      hasWarnings: false,
      warningCount: 0,
    });

    expect(buildSshCommandPreviewDisplay("# RELAY 代理认证使用系统钥匙串\nssh deploy@host", { text: "复制失败", tone: "error" }))
      .toMatchObject({
        hasWarnings: true,
        warningCount: 1,
        statusText: "复制失败",
        statusTone: "error",
        statusVisible: true,
      });

    expect(buildSshCommandPreviewDisplay("")).toMatchObject({
      commandText: "# 无法生成 SSH 命令",
      copyText: "",
      copyButtonTitle: "没有可复制的 SSH 命令",
      copyDisabled: true,
      statusVisible: false,
    });
  });
});
