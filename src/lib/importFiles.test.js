import { describe, expect, it } from "vitest";
import { buildSshConfigImportDropzoneDisplay, getFirstSelectedFile, getReadableSelectedFile, resetFileInput } from "./importFiles.js";

describe("importFiles", () => {
  it("selects the first file from FileList-like values", () => {
    const first = { name: "config" };
    const second = { name: "other" };

    expect(getFirstSelectedFile([first, second])).toBe(first);
    expect(getFirstSelectedFile({ 0: first, 1: second, length: 2 })).toBe(first);
  });

  it("returns null for empty selections", () => {
    expect(getFirstSelectedFile()).toBeNull();
    expect(getFirstSelectedFile([])).toBeNull();
    expect(getFirstSelectedFile({ length: 0 })).toBeNull();
  });

  it("validates readable selected files before import", () => {
    const file = { name: "config", text: async () => "Host prod" };
    expect(getReadableSelectedFile([file])).toEqual({ ok: true, file, reason: "" });
    expect(getReadableSelectedFile()).toEqual({
      ok: false,
      file: null,
      reason: "请选择要导入的文件",
    });

    expect(getReadableSelectedFile([], { emptyMessage: "请选择 SSH config 文件" })).toEqual({
      ok: false,
      file: null,
      reason: "请选择 SSH config 文件",
    });

    expect(getReadableSelectedFile([{ name: "config-dir" }], { unreadableMessage: "无法读取所选 SSH config 文件" })).toEqual({
      ok: false,
      file: null,
      reason: "无法读取所选 SSH config 文件",
    });
  });

  it("clears file input values so the same file can be selected again", () => {
    const input = { value: "/tmp/config" };

    expect(resetFileInput(input)).toBe(true);
    expect(input.value).toBe("");
    expect(resetFileInput(null)).toBe(false);
  });

  it("builds SSH config import dropzone display metadata", () => {
    expect(buildSshConfigImportDropzoneDisplay()).toEqual({
      prefix: "拖入或点击选择",
      pathLabel: "~/.ssh/config",
      suffix: "一键导入主机",
      title: "导入 OpenSSH config",
      statusText: "",
      statusTone: "success",
      statusVisible: false,
    });

    expect(buildSshConfigImportDropzoneDisplay({ text: " 已导入 2 台主机 ", tone: "success" })).toMatchObject({
      statusText: "已导入 2 台主机",
      statusTone: "success",
      statusVisible: true,
    });
    expect(buildSshConfigImportDropzoneDisplay({ text: "未找到 ~/.ssh/config", tone: "neutral" }).statusTone).toBe("neutral");
    expect(buildSshConfigImportDropzoneDisplay({ text: "导入失败", tone: "error" }).statusTone).toBe("error");
    expect(buildSshConfigImportDropzoneDisplay({ text: "读取中", tone: "pending" }).statusTone).toBe("pending");
    expect(buildSshConfigImportDropzoneDisplay({ text: "已读取", tone: "warn" }).statusTone).toBe("success");
  });
});
