import { describe, expect, it } from "vitest";
import { buildSessionToolbarDisplay } from "./sessionToolbar.js";

describe("sessionToolbar", () => {
  it("builds session toolbar labels for inactive controls", () => {
    expect(buildSessionToolbarDisplay({
      host: { name: "prod-web" },
      searchShortcut: "Ctrl+F",
      snippetShortcut: "Ctrl+;",
    })).toEqual({
      backLabel: "← 主机列表",
      hostName: "prod-web",
      hostStatus: "online",
      latencyLabel: "23ms",
      splitButton: {
        label: "＋ 拆分",
        active: false,
        activeTone: "pending",
      },
      actions: [
        { id: "search", label: "Ctrl+F 搜索", active: false, activeTone: "pending" },
        { id: "snippets", label: "Ctrl+; 片段", active: false, activeTone: "pending" },
        { id: "broadcast", label: "⌁ 广播 关", active: false, activeTone: "pending" },
        { id: "monitor", label: "📈 监控", active: true, activeTone: "success" },
        { id: "sftp", label: "⇅ SFTP", active: false, activeTone: "neutral" },
      ],
      transferHint: "拖文件到终端 = trz 上传 · 输入 tsz 文件名 = 下载",
    });
  });

  it("builds active session toolbar labels and falls back to host address", () => {
    const display = buildSessionToolbarDisplay({
      host: { host: "10.2.1.11" },
      splitEnabled: true,
      showSearch: true,
      showSnippets: true,
      broadcast: true,
      showMonitor: false,
      searchShortcut: " ⌘F ",
      snippetShortcut: " ⌘; ",
      latencyLabel: "",
    });

    expect(display.hostName).toBe("10.2.1.11");
    expect(display.latencyLabel).toBe("");
    expect(display.splitButton).toMatchObject({ label: "× 关闭拆分", active: true });
    expect(display.actions).toEqual([
      { id: "search", label: "⌘F 搜索", active: true, activeTone: "pending" },
      { id: "snippets", label: "⌘; 片段", active: true, activeTone: "pending" },
      { id: "broadcast", label: "⌁ 广播 开", active: true, activeTone: "pending" },
      { id: "monitor", label: "📈 监控", active: false, activeTone: "success" },
      { id: "sftp", label: "⇅ SFTP", active: false, activeTone: "neutral" },
    ]);
  });
});
