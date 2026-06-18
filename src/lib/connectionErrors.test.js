import { describe, expect, it } from "vitest";
import {
  buildConnectionErrorGuidance,
  buildConnectionErrorState,
  connectionErrorMessage,
  extractPrivateKeyPermissionFix,
  formatConnectionError,
  isPrivateKeyPermissionError,
  shouldResetCachedSshAuth,
} from "./connectionErrors.js";

describe("connectionErrors", () => {
  it("extracts actionable chmod fixes from RELAY private-key permission errors", () => {
    const error = new Error("private key permissions 644 for /home/deploy/.ssh/id_ed25519 are too open; run chmod 600 /home/deploy/.ssh/id_ed25519");

    expect(isPrivateKeyPermissionError(error)).toBe(true);
    expect(extractPrivateKeyPermissionFix(error)).toEqual({
      path: "/home/deploy/.ssh/id_ed25519",
      mode: "644",
      command: "chmod 600 /home/deploy/.ssh/id_ed25519",
    });
    expect(formatConnectionError(error)).toContain("请在本机执行: chmod 600 /home/deploy/.ssh/id_ed25519");
  });

  it("extracts chmod fixes from OpenSSH unprotected-key diagnostics", () => {
    const message = [
      "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
      "@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @",
      "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
      "Permissions 0644 for '/home/jincurry/.ssh/colocrossing' are too open.",
      "This private key will be ignored.",
      "Load key \"/home/jincurry/.ssh/colocrossing\": bad permissions",
      "root@192.3.139.134: Permission denied (publickey).",
    ].join("\n");

    expect(isPrivateKeyPermissionError(message)).toBe(true);
    expect(extractPrivateKeyPermissionFix(message)).toMatchObject({
      path: "/home/jincurry/.ssh/colocrossing",
      mode: "644",
      command: "chmod 600 /home/jincurry/.ssh/colocrossing",
    });
    expect(formatConnectionError(message)).toContain("SSH 已拒绝使用该密钥");
    expect(buildConnectionErrorGuidance(message)).toContain("请在本机执行: chmod 600 /home/jincurry/.ssh/colocrossing");
  });

  it("quotes private-key paths with shell-sensitive characters", () => {
    expect(extractPrivateKeyPermissionFix("Load key \"/home/me/.ssh/work key\": bad permissions")).toMatchObject({
      path: "/home/me/.ssh/work key",
      command: "chmod 600 '/home/me/.ssh/work key'",
    });
  });

  it("keeps ordinary connection failures unchanged", () => {
    const message = "tcp 10.0.0.1:22 timed out after 1500ms";

    expect(connectionErrorMessage({ message })).toBe(message);
    expect(isPrivateKeyPermissionError(message)).toBe(false);
    expect(buildConnectionErrorGuidance(message)).toBe("");
    expect(formatConnectionError(message)).toBe(message);
    expect(shouldResetCachedSshAuth(message)).toBe(false);
  });

  it("adds Chinese guidance for common SSH authentication failures", () => {
    const publicKeyDenied = "root@192.0.2.10: Permission denied (publickey).";
    const missingCredentials = "password or privateKeyPath is required";
    const unreadableKey = "failed to load private key at /home/me/.ssh/id_ed25519";

    expect(formatConnectionError(publicKeyDenied)).toBe([
      "SSH 认证失败，服务器拒绝了当前凭据。",
      "请检查用户名、IdentityFile、SSH Agent 和服务器 authorized_keys 设置。",
      publicKeyDenied,
    ].join("\n"));
    expect(formatConnectionError(missingCredentials)).toContain("缺少 SSH 认证凭据");
    expect(formatConnectionError(unreadableKey)).toContain("私钥读取失败");
  });

  it("adds focused guidance for password and keyboard-interactive failures", () => {
    expect(buildConnectionErrorGuidance("password authentication failed for deploy"))
      .toContain("SSH 密码认证失败");
    expect(buildConnectionErrorGuidance("keyboard-interactive authentication failed"))
      .toContain("SSH 交互式认证失败");
  });

  it("marks authentication and private-key failures as cached-auth reset triggers", () => {
    expect(shouldResetCachedSshAuth("SFTP authentication rejected by server")).toBe(true);
    expect(shouldResetCachedSshAuth("failed to load private key at /home/me/.ssh/id_ed25519")).toBe(true);
    expect(shouldResetCachedSshAuth("private key permissions 644 for /home/me/.ssh/id are too open")).toBe(true);
  });

  it("builds a combined connection error state for UI handlers", () => {
    expect(buildConnectionErrorState("SFTP authentication rejected by server")).toEqual({
      message: [
        "SSH 认证失败，服务器拒绝了当前凭据。",
        "请检查用户名、IdentityFile、SSH Agent 和服务器 authorized_keys 设置。",
        "SFTP authentication rejected by server",
      ].join("\n"),
      resetCachedAuth: true,
    });
    expect(buildConnectionErrorState("tcp 10.0.0.1:22 timed out after 1500ms")).toEqual({
      message: "tcp 10.0.0.1:22 timed out after 1500ms",
      resetCachedAuth: false,
    });
  });
});
