import { describe, expect, it } from "vitest";
import {
  buildUnknownHostKeyPrompt,
  formatHostKeyTarget,
  isUnknownHostKeyError,
  markAuthTrustedForUnknownHostKey,
  shouldTrustUnknownHostKeyByDefault,
  unknownHostKeyMessage,
  unknownHostKeyTarget,
} from "./hostKeyTrust.js";

describe("hostKeyTrust", () => {
  it("detects unknown host key errors case-insensitively", () => {
    expect(isUnknownHostKeyError(new Error("Unknown server key for example.com:22 (SHA256:abc)"))).toBe(true);
    expect(isUnknownHostKeyError("unknown server key for example.com:22")).toBe(true);
    expect(isUnknownHostKeyError("Server key changed for example.com:22")).toBe(false);
    expect(unknownHostKeyMessage(null)).toBeNull();
  });

  it("extracts the actual unknown-key target from backend errors", () => {
    expect(unknownHostKeyTarget(new Error("Unknown server key for bastion.local:2222 (SHA256:jump)")))
      .toBe("bastion.local:2222");
    expect(unknownHostKeyTarget("Unknown server key for 2001:db8::1:22 (SHA256:v6)"))
      .toBe("[2001:db8::1]:22");
    expect(unknownHostKeyTarget("Unknown server key for [2001:db8::1]:2222 (SHA256:v6)"))
      .toBe("[2001:db8::1]:2222");
    expect(unknownHostKeyTarget("Server key changed for bastion.local:22")).toBeNull();
  });

  it("formats host key targets with default ports and IPv6 brackets", () => {
    expect(formatHostKeyTarget({ host: "example.com" })).toBe("example.com:22");
    expect(formatHostKeyTarget({ host: "example.com", port: 2200 })).toBe("example.com:2200");
    expect(formatHostKeyTarget({ host: "2001:db8::1", port: 2222 })).toBe("[2001:db8::1]:2222");
  });

  it("builds one confirmation prompt for unknown key retries", () => {
    expect(buildUnknownHostKeyPrompt(
      { host: "final.example.com", port: 22 },
      new Error("Unknown server key for bastion.local:2222 (SHA256:abc)"),
    )).toBe([
      "首次连接 bastion.local:2222",
      "",
      "Unknown server key for bastion.local:2222 (SHA256:abc)",
      "",
      "确认信任此主机指纹并写入 known_hosts?",
    ].join("\n"));

    expect(buildUnknownHostKeyPrompt(
      { host: "final.example.com", port: 22 },
      new Error("Unknown server key for 2001:db8::1:2222 (SHA256:v6)"),
    )).toContain("首次连接 [2001:db8::1]:2222");
  });

  it("normalizes raw IPv6 backend targets in unknown-key prompts", () => {
    expect(buildUnknownHostKeyPrompt(
      { host: "fallback.example.com", port: 22 },
      "Unknown server key for 2001:db8::10:2200 (SHA256:v6)",
    )).toBe([
      "首次连接 [2001:db8::10]:2200",
      "",
      "Unknown server key for 2001:db8::10:2200 (SHA256:v6)",
      "",
      "确认信任此主机指纹并写入 known_hosts?",
    ].join("\n"));
  });

  it("marks resolved auth as trusted for subsequent unknown-key SFTP calls", () => {
    const auth = {
      host: "example.com",
      port: 22,
      user: "deploy",
      privateKeyPath: "~/.ssh/id_ed25519",
      strictHostKey: true,
      trustUnknownHostKey: false,
      connectTimeoutMs: 10000,
      serverAliveIntervalMs: 30000,
      serverAliveCountMax: 3,
      jumpHosts: [{ host: "bastion.local", user: "jump", trustUnknownHostKey: false }],
    };

    expect(markAuthTrustedForUnknownHostKey(auth)).toEqual({
      ...auth,
      trustUnknownHostKey: true,
    });
    expect(markAuthTrustedForUnknownHostKey(auth)).not.toBe(auth);
    expect(markAuthTrustedForUnknownHostKey(null)).toBeNull();
  });

  it("uses resolved auth policy for the first unknown-key attempt", () => {
    expect(shouldTrustUnknownHostKeyByDefault({ trustUnknownHostKey: true })).toBe(true);
    expect(shouldTrustUnknownHostKeyByDefault({ trustUnknownHostKey: false })).toBe(false);
    expect(shouldTrustUnknownHostKeyByDefault({})).toBe(false);
    expect(shouldTrustUnknownHostKeyByDefault(null)).toBe(false);
  });
});
