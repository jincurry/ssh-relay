import { TrzszFilter } from "trzsz";
import { isTauriRuntime, pickTrzszSaveDirectory, pickTrzszUploadPaths } from "./tauriBridge.js";

export function createTrzszBridge({
  writeToTerminal,
  sendToServer,
  terminalColumns = 80,
  onStatus = () => {},
  chooseSendFiles,
  chooseSaveDirectory,
  FilterClass = TrzszFilter,
}) {
  if (typeof writeToTerminal !== "function") {
    throw new Error("writeToTerminal is required");
  }
  if (typeof sendToServer !== "function") {
    throw new Error("sendToServer is required");
  }

  const chooserOptions = resolveChooserOptions({ chooseSendFiles, chooseSaveDirectory });
  const filter = new FilterClass({
    writeToTerminal,
    sendToServer,
    terminalColumns,
    dragInitTimeout: 5000,
    ...chooserOptions,
  });

  return {
    processServerOutput(output) {
      filter.processServerOutput(output);
    },
    processTerminalInput(input) {
      filter.processTerminalInput(input);
    },
    setTerminalColumns(cols) {
      filter.setTerminalColumns(cols);
    },
    async uploadDroppedItems(items) {
      if (!hasItems(items)) {
        throw new Error("没有选择可上传的 trz 文件");
      }
      onStatus({ state: "starting", message: "trz 上传开始" });
      try {
        const result = await filter.uploadFiles(items);
        onStatus({ state: "done", message: "trz 上传完成" });
        return result;
      } catch (err) {
        onStatus({ state: "error", message: err?.message || String(err) });
        throw err;
      }
    },
  };
}

export function getTransferItems(dataTransfer) {
  if (hasUploadableTransferItems(dataTransfer)) {
    return dataTransfer.items;
  }
  return null;
}

export function hasUploadableTransferItems(dataTransfer) {
  const items = dataTransfer?.items;
  if (!hasItems(items)) return false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (isFileTransferItem(item)) return true;
  }
  return false;
}

function hasItems(items) {
  return typeof items?.length === "number" && items.length > 0;
}

function isFileTransferItem(item) {
  if (!item) return false;
  if (item.kind === "file") return true;
  if (item.kind) return false;
  return typeof item.webkitGetAsEntry === "function";
}

function resolveChooserOptions({ chooseSendFiles, chooseSaveDirectory }) {
  const sendChooser = chooseSendFiles || (isTauriRuntime() ? directory => pickTrzszUploadPaths({ directory: Boolean(directory) }) : null);
  const saveChooser = chooseSaveDirectory || (isTauriRuntime() ? () => pickTrzszSaveDirectory() : null);
  return {
    ...(sendChooser ? { chooseSendFiles: directory => sendChooser(Boolean(directory)) } : {}),
    ...(saveChooser ? { chooseSaveDirectory: () => saveChooser() } : {}),
  };
}
