import { describe, expect, it, vi } from "vitest";
import { createTrzszBridge, getTransferItems, hasUploadableTransferItems } from "./trzszBridge.js";

class FakeFilter {
  constructor(options) {
    this.options = options;
    this.serverOutputs = [];
    this.terminalInputs = [];
    this.columns = options.terminalColumns;
    FakeFilter.instances.push(this);
  }

  processServerOutput(output) {
    this.serverOutputs.push(output);
    this.options.writeToTerminal(output);
  }

  processTerminalInput(input) {
    this.terminalInputs.push(input);
    this.options.sendToServer(input);
  }

  setTerminalColumns(cols) {
    this.columns = cols;
  }

  uploadFiles(items) {
    this.uploadedItems = items;
    return Promise.resolve("ok");
  }
}

FakeFilter.instances = [];

describe("trzszBridge", () => {
  it("routes terminal input and server output through the filter", () => {
    const writes = [];
    const sends = [];
    const bridge = createTrzszBridge({
      writeToTerminal: data => writes.push(data),
      sendToServer: data => sends.push(data),
      terminalColumns: 120,
      FilterClass: FakeFilter,
    });

    bridge.processTerminalInput("ls\r");
    bridge.processServerOutput(new Uint8Array([65, 66]));
    bridge.setTerminalColumns(90);

    const filter = FakeFilter.instances.at(-1);
    expect(sends).toEqual(["ls\r"]);
    expect(writes).toEqual([new Uint8Array([65, 66])]);
    expect(filter.columns).toBe(90);
  });

  it("uploads dropped items and reports status", async () => {
    const statuses = [];
    const items = { length: 1, 0: { kind: "file" } };
    const bridge = createTrzszBridge({
      writeToTerminal: vi.fn(),
      sendToServer: vi.fn(),
      onStatus: status => statuses.push(status),
      FilterClass: FakeFilter,
    });

    await expect(bridge.uploadDroppedItems(items)).resolves.toBe("ok");

    expect(FakeFilter.instances.at(-1).uploadedItems).toBe(items);
    expect(statuses).toEqual([
      { state: "starting", message: "trz 上传开始" },
      { state: "done", message: "trz 上传完成" },
    ]);
  });

  it("passes native chooser hooks to the filter", async () => {
    const chooseSendFiles = vi.fn(async directory => directory ? ["/tmp/project"] : ["/tmp/a.txt"]);
    const chooseSaveDirectory = vi.fn(async () => "/tmp/downloads");
    createTrzszBridge({
      writeToTerminal: vi.fn(),
      sendToServer: vi.fn(),
      chooseSendFiles,
      chooseSaveDirectory,
      FilterClass: FakeFilter,
    });

    const filter = FakeFilter.instances.at(-1);
    await expect(filter.options.chooseSendFiles(true)).resolves.toEqual(["/tmp/project"]);
    await expect(filter.options.chooseSaveDirectory()).resolves.toBe("/tmp/downloads");
    expect(chooseSendFiles).toHaveBeenCalledWith(true);
    expect(chooseSaveDirectory).toHaveBeenCalledTimes(1);
  });

  it("rejects empty dropped uploads before touching the filter", async () => {
    const bridge = createTrzszBridge({
      writeToTerminal: vi.fn(),
      sendToServer: vi.fn(),
      FilterClass: FakeFilter,
    });

    await expect(bridge.uploadDroppedItems({ length: 0 })).rejects.toThrow("没有选择可上传的 trz 文件");
  });

  it("extracts transfer items from a drag event payload", () => {
    const items = { length: 1, 0: { kind: "file" } };
    expect(getTransferItems({ items })).toBe(items);
    expect(getTransferItems({ items: { length: 0 } })).toBeNull();
    expect(getTransferItems(null)).toBeNull();
  });

  it("only treats file drag payloads as uploadable", () => {
    expect(hasUploadableTransferItems({ items: { length: 1, 0: { kind: "file" } } })).toBe(true);
    expect(hasUploadableTransferItems({ items: { length: 1, 0: { kind: "string" } } })).toBe(false);
    expect(hasUploadableTransferItems({ items: { length: 1, 0: { webkitGetAsEntry: vi.fn() } } })).toBe(true);
    expect(hasUploadableTransferItems({ files: { length: 1 } })).toBe(false);
  });
});
