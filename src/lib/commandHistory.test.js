import { describe, expect, it, vi } from "vitest";
import { buildCommandHistoryClearButtonDisplay, buildCommandHistoryClearConfirmation, clearCommandHistory, COMMAND_HISTORY_STORAGE_KEY, getCommandCompletion, loadCommandHistory, normalizeCommandHistory, recordCommand, saveCommandHistory } from "./commandHistory.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
  };
}

describe("commandHistory", () => {
  it("records commands with most-recent-first dedupe", () => {
    const history = recordCommand(["df -h", "free -m"], "df -h");
    expect(history).toEqual(["df -h", "free -m"]);

    expect(recordCommand([" df -h ", "free -m", "df -h"], "df -h")).toEqual(["df -h", "free -m"]);

    expect(recordCommand(history, "systemctl status nginx")).toEqual([
      "systemctl status nginx",
      "df -h",
      "free -m",
    ]);
  });

  it("limits history length and ignores blank commands", () => {
    const initial = Array.from({ length: 3 }, (_, i) => `cmd ${i}`);
    expect(recordCommand(initial, "cmd new", 3)).toEqual(["cmd new", "cmd 0", "cmd 1"]);
    expect(recordCommand(initial, "   ", 3)).toBe(initial);
  });

  it("prefers history completions before defaults", () => {
    expect(getCommandCompletion("do", ["docker compose ps"], ["docker ps -a"])).toBe("cker compose ps");
    expect(getCommandCompletion("df", [], ["df -h"])).toBe(" -h");
    expect(getCommandCompletion("df", [" df -i ", "df -h"], [])).toBe(" -i");
    expect(getCommandCompletion("unknown", [], ["df -h"])).toBe("");
  });

  it("completes commands with leading whitespace without corrupting the suffix", () => {
    expect(getCommandCompletion("  df", [], ["df -h"])).toBe(" -h");
    expect(`  df${getCommandCompletion("  df", [], ["df -h"])}`).toBe("  df -h");
  });

  it("loads and saves history", () => {
    const storage = memoryStorage();
    expect(loadCommandHistory(storage)).toEqual([]);

    expect(saveCommandHistory(storage, [" df -h ", "df -h", "", "x".repeat(501), { cmd: "uptime" }])).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(COMMAND_HISTORY_STORAGE_KEY, JSON.stringify(["df -h"]));
    expect(loadCommandHistory(storage)).toEqual(["df -h"]);
  });

  it("clears command history through the normal persistence path", () => {
    const storage = memoryStorage();
    const cleared = clearCommandHistory(["df -h", "uptime"]);

    expect(cleared).toEqual([]);
    expect(saveCommandHistory(storage, cleared)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(COMMAND_HISTORY_STORAGE_KEY, "[]");
    expect(loadCommandHistory(storage)).toEqual([]);
  });

  it("builds an explicit clear-history confirmation", () => {
    expect(buildCommandHistoryClearConfirmation([" df -h ", "", "df -h", "uptime", "x".repeat(501)]))
      .toBe("清除 2 条本地命令历史?\n\n只会删除 RELAY 保存在本机的历史记录和 Tab 补全来源。\n不会修改远端 shell history、命令片段或主机配置。");
  });

  it("builds clear-history button display metadata", () => {
    expect(buildCommandHistoryClearButtonDisplay([" df -h ", "", "df -h", "uptime", "x".repeat(501)])).toEqual({
      visible: true,
      title: "清除本地命令历史",
      text: "清除历史",
      count: 2,
    });

    expect(buildCommandHistoryClearButtonDisplay([])).toMatchObject({
      visible: false,
      count: 0,
    });
  });

  it("normalizes command history lists before persistence or sync", () => {
    expect(normalizeCommandHistory([" uptime ", "uptime", 42, "free -m", "x".repeat(501)], 2))
      .toEqual(["uptime", "free -m"]);
    expect(normalizeCommandHistory(null)).toEqual([]);
  });
});
