import { describe, expect, it } from "vitest";
import {
  buildLocalPtyErrorLine,
  buildLocalPtyStartingLine,
  buildLocalTerminalDisplay,
  buildSshConnectingLine,
  buildSshErrorLine,
  buildSshHostKeyAcceptedLine,
} from "./terminalMessages.js";

describe("terminalMessages", () => {
  it("formats localized SSH connection lines with ports and pane labels", () => {
    expect(buildSshConnectingLine({ user: "deploy", host: "10.2.1.11" })).toBe("正在连接 deploy@10.2.1.11:22...");
    expect(buildSshConnectingLine({ user: "root", host: "2001:db8::8", port: 2200 }, "split")).toBe("正在连接 root@[2001:db8::8]:2200（拆分窗格）...");
  });

  it("formats localized SSH host-key and error lines", () => {
    expect(buildSshHostKeyAcceptedLine({ host: "example.com", port: 2222 })).toBe("\r\nRELAY: 已信任服务器密钥 example.com:2222，正在重新连接...\r\n");
    expect(buildSshErrorLine("认证失败")).toBe("\r\nRELAY SSH 错误: 认证失败");
  });

  it("formats localized local PTY status lines", () => {
    expect(buildLocalPtyStartingLine()).toBe("正在启动本地 PTY...");
    expect(buildLocalPtyErrorLine("shell 不可用")).toBe("\r\nRELAY PTY 错误: shell 不可用");
  });

  it("builds local terminal page display metadata", () => {
    expect(buildLocalTerminalDisplay({ searchShortcut: " Ctrl+F ", searchOpen: true })).toEqual({
      backLabel: "← 主机列表",
      shellLabel: "local shell",
      searchButtonLabel: "Ctrl+F 搜索",
      searchActive: true,
      previewLines: [
        { t: "$", c: "echo RELAY local terminal" },
        { t: ">", c: "本地 PTY 将在桌面端连接到当前系统 shell" },
        { t: ">", c: "支持二进制 Channel 输出、输入转发和窗口尺寸同步" },
      ],
    });

    expect(buildLocalTerminalDisplay()).toMatchObject({
      searchButtonLabel: "搜索",
      searchActive: false,
    });
  });
});
