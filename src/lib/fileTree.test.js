import { describe, expect, it } from "vitest";
import { copyTreeEntry, copyTreeFile, createTreeDir, getTreeEntry, isEditableTextFileName, listTreeEntries, normalizeTreeEntryName, readTreeText, treeEntrySize, writeTreeText } from "./fileTree.js";

const tree = {
  "z.log": { type: "file", size: 10, mtime: "old" },
  "conf": { type: "dir", children: {
    "app.conf": { type: "file", size: 4, mtime: "old", content: "test" }
  }, mtime: "old" },
};

describe("fileTree", () => {
  it("lists directories before files", () => {
    expect(listTreeEntries(tree).map(([name]) => name)).toEqual(["conf", "z.log"]);
  });

  it("creates directories immutably", () => {
    const next = createTreeDir(tree, [], "logs", "now");
    expect(getTreeEntry(next, [], "logs")).toMatchObject({ type: "dir", mtime: "now" });
    expect(getTreeEntry(tree, [], "logs")).toBeNull();
  });

  it("normalizes prompted entry names before creation", () => {
    expect(normalizeTreeEntryName("  releases  ")).toBe("releases");
    const next = createTreeDir(tree, [], "  logs  ", "now");
    expect(getTreeEntry(next, [], "logs")).toMatchObject({ type: "dir", mtime: "now" });
    expect(getTreeEntry(next, [], "  logs  ")).toBeNull();
  });

  it("creates directories inside the selected tree path", () => {
    const next = createTreeDir(tree, ["conf"], "sites-enabled", "now");
    expect(getTreeEntry(next, ["conf"], "sites-enabled")).toMatchObject({ type: "dir", mtime: "now" });
    expect(getTreeEntry(tree, ["conf"], "sites-enabled")).toBeNull();
  });

  it("reads and writes text files", () => {
    const next = writeTreeText(tree, ["conf"], "app.conf", "server {}", "now");
    expect(readTreeText(next, ["conf"], "app.conf")).toBe("server {}");
    expect(getTreeEntry(next, ["conf"], "app.conf")).toMatchObject({ size: 9, mtime: "now" });
  });

  it("copies file metadata into a directory", () => {
    const next = copyTreeFile(tree, ["conf"], "bundle.tar.gz", 1024, "now");
    expect(getTreeEntry(next, ["conf"], "bundle.tar.gz")).toMatchObject({ type: "file", size: 1024 });
  });

  it("copies directories recursively without mutating the source tree", () => {
    const next = copyTreeEntry(tree, [], "conf-copy", getTreeEntry(tree, [], "conf"), "now");
    expect(getTreeEntry(next, ["conf-copy"], "app.conf")).toMatchObject({ type: "file", content: "test" });
    expect(getTreeEntry(next, [], "conf-copy")).toMatchObject({ type: "dir", mtime: "now" });
    expect(getTreeEntry(tree, [], "conf-copy")).toBeNull();
  });

  it("computes recursive directory size", () => {
    expect(treeEntrySize(getTreeEntry(tree, [], "conf"))).toBe(4);
    expect(treeEntrySize(getTreeEntry(tree, [], "z.log"))).toBe(10);
  });

  it("detects editable text file names for SFTP editor actions", () => {
    expect(isEditableTextFileName("app.conf")).toBe(true);
    expect(isEditableTextFileName("README.MD")).toBe(true);
    expect(isEditableTextFileName(".env.local")).toBe(true);
    expect(isEditableTextFileName(".bashrc")).toBe(true);
    expect(isEditableTextFileName("archive.tar.gz")).toBe(false);
    expect(isEditableTextFileName("")).toBe(false);
  });

  it("rejects copying over existing entries", () => {
    expect(() => copyTreeEntry(tree, [], "conf", getTreeEntry(tree, [], "conf"))).toThrow("conf 已存在");
    expect(() => copyTreeEntry(tree, [], "broken", { type: "symlink" })).toThrow("条目必须是文件或目录");
  });

  it("rejects nested names", () => {
    expect(() => createTreeDir(tree, [], "../bad")).toThrow("名称必须是单个路径段");
    expect(() => normalizeTreeEntryName("   ")).toThrow("名称必须是单个路径段");
    expect(() => normalizeTreeEntryName(".")).toThrow("名称必须是单个路径段");
    expect(() => normalizeTreeEntryName("..")).toThrow("名称必须是单个路径段");
    expect(() => normalizeTreeEntryName("bad\\name")).toThrow("名称必须是单个路径段");
  });

  it("reports localized errors for wrong entry kinds", () => {
    expect(() => createTreeDir(tree, ["z.log"], "child")).toThrow("z.log 不是目录");
    expect(() => readTreeText(tree, [], "conf")).toThrow("conf 不是文件");
    expect(() => writeTreeText(tree, [], "conf", "bad")).toThrow("conf 不是文件");
  });
});
