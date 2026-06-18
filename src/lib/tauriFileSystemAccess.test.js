import { describe, expect, it } from "vitest";
import { installTauriFileSystemAccess } from "./tauriFileSystemAccess.js";

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

describe("tauriFileSystemAccess", () => {
  it("installs upload and download picker polyfills", async () => {
    const writes = [];
    const target = {};
    const backend = {
      pickUploadPaths: async ({ directory }) => directory ? ["/tmp/project"] : ["/tmp/a.txt"],
      pickSaveDirectory: async () => "/tmp/downloads",
      getInfo: async path => ({
        name: path.split("/").pop(),
        path,
        kind: path.endsWith("project") ? "dir" : "file",
        size: path.endsWith("a.txt") ? 5 : 0,
      }),
      listDir: async path => ({
        path,
        entries: [{ name: "a.txt", path: `${path}/a.txt`, kind: "file", size: 5 }],
      }),
      createDir: async () => null,
      readChunk: async () => ({ contentBase64: b64([1, 2, 3, 4, 5]), bytesRead: 5, done: true }),
      truncateFile: async (...args) => writes.push(["truncate", ...args]),
      writeChunk: async (...args) => writes.push(args),
    };

    expect(installTauriFileSystemAccess(target, backend)).toBe(true);
    expect(installTauriFileSystemAccess(target, backend)).toBe(false);

    const [fileHandle] = await target.showOpenFilePicker({ multiple: true });
    const file = await fileHandle.getFile();
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    expect(file.name).toBe("a.txt");
    expect([...bytes]).toEqual([1, 2, 3, 4, 5]);

    const uploadDir = await target.showDirectoryPicker({ id: "trzsz_upload" });
    const entries = [];
    for await (const entry of uploadDir.values()) entries.push(entry.name);
    expect(entries).toEqual(["a.txt"]);

    const saveDir = await target.showDirectoryPicker({ id: "trzsz_download", mode: "readwrite" });
    const saveFile = await saveDir.getFileHandle("out.bin", { create: true });
    const writer = await saveFile.createWritable();
    await writer.write(new Uint8Array([6, 7]));
    await writer.seek(1);
    await writer.write({ type: "write", data: new Uint8Array([8, 9]) });
    await writer.write({ type: "seek", position: 2 });
    await writer.write({ type: "truncate", size: 2 });
    await writer.close();
    expect(writes).toEqual([
      ["/tmp/downloads/out.bin", 0, b64([6, 7]), true],
      ["/tmp/downloads/out.bin", 1, b64([8, 9]), false],
      ["truncate", "/tmp/downloads/out.bin", 2],
    ]);
  });

  it("throws AbortError when save directory selection is cancelled", async () => {
    const target = {};
    installTauriFileSystemAccess(target, {
      pickUploadPaths: async () => [],
      pickSaveDirectory: async () => null,
    });

    await expect(target.showDirectoryPicker({ id: "trzsz_download" })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("reports localized file-handle and writer errors", async () => {
    const target = {};
    const backend = {
      pickUploadPaths: async () => ["/tmp/project"],
      pickSaveDirectory: async () => "/tmp/downloads",
      getInfo: async path => ({
        name: path.split("/").pop(),
        path,
        kind: path.endsWith("project") ? "dir" : "file",
        size: 0,
      }),
      listDir: async () => ({ entries: [] }),
      createDir: async () => null,
      readChunk: async () => ({ contentBase64: "", done: true }),
      writeChunk: async () => null,
    };
    installTauriFileSystemAccess(target, backend);

    const [fileHandle] = await target.showOpenFilePicker();
    await expect(fileHandle.getFile()).rejects.toMatchObject({
      name: "TypeMismatchError",
      message: "/tmp/project 不是文件",
    });

    const saveDir = await target.showDirectoryPicker({ id: "trzsz_download", mode: "readwrite" });
    await expect(saveDir.getDirectoryHandle("out.bin")).rejects.toMatchObject({
      name: "TypeMismatchError",
      message: "/tmp/downloads/out.bin 不是目录",
    });

    const writer = await (await saveDir.getFileHandle("out.bin", { create: true })).createWritable();
    await expect(writer.write({ type: "seek", position: -1 })).rejects.toThrow("写入位置必须是非负整数: -1");
    await expect(writer.write({ type: "truncate", size: 2 })).rejects.toThrow("当前文件写入后端不支持截断");
    await expect(writer.write({ type: "sync" })).rejects.toThrow("不支持的文件写入操作: sync");
    await writer.close();
    await expect(writer.write(new Uint8Array([1]))).rejects.toThrow("文件写入器已关闭");
  });
});
