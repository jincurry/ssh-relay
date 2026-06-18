import { describe, expect, it } from "vitest";
import { buildStatusMessage } from "./statusMessage.js";

describe("statusMessage", () => {
  it("builds explicit UI status messages", () => {
    expect(buildStatusMessage(" 本地配置已加载 ")).toEqual({ text: "本地配置已加载", tone: "success" });
    expect(buildStatusMessage("导入失败: bad json", "error")).toEqual({ text: "导入失败: bad json", tone: "error" });
    expect(buildStatusMessage("探测中", "pending")).toEqual({ text: "探测中", tone: "pending" });
    expect(buildStatusMessage("等待用户选择", "neutral")).toEqual({ text: "等待用户选择", tone: "neutral" });
    expect(buildStatusMessage("状态已记录", "warn")).toEqual({ text: "状态已记录", tone: "success" });
  });
});
