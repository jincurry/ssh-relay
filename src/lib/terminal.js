import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { toXtermTheme } from "./xtermTheme.js";

export const DEFAULT_PAUSED_RENDER_BUFFER_LIMIT = 4 * 1024 * 1024;

export function createRelayTerminal({
  theme,
  fontFamily,
  fontSize,
  fontLigatures = true,
  onData,
  TerminalClass = Terminal,
  FitAddonClass = FitAddon,
  SearchAddonClass = SearchAddon,
  WebLinksAddonClass = WebLinksAddon,
  WebglAddonClass = WebglAddon,
  pausedBufferByteLimit = DEFAULT_PAUSED_RENDER_BUFFER_LIMIT,
}) {
  const terminal = new TerminalClass({
    allowProposedApi: true,
    cursorBlink: true,
    fontFamily,
    fontSize,
    fontLigatures,
    lineHeight: 1.35,
    scrollback: 10000,
    convertEol: true,
    theme: toXtermTheme(theme)
  });

  const fit = new FitAddonClass();
  const search = new SearchAddonClass();
  const links = new WebLinksAddonClass();
  terminal.loadAddon(fit);
  terminal.loadAddon(search);
  terminal.loadAddon(links);

  let webgl = null;
  let renderer = "canvas";
  let rendererMessage = "Canvas 渲染器降级已启用";
  try {
    webgl = new WebglAddonClass();
    terminal.loadAddon(webgl);
    renderer = "webgl";
    rendererMessage = "WebGL 渲染器已启用";
  } catch (err) {
    webgl = null;
    rendererMessage = `WebGL 渲染器不可用,已降级为 Canvas${err?.message ? `: ${localizeRendererError(err.message)}` : ""}`;
  }

  const dataSubscription = onData ? terminal.onData(onData) : null;
  let renderingPaused = false;
  let bufferedWrites = [];
  let bufferedByteLength = 0;
  let droppedBufferedByteLength = 0;
  const bufferByteLimit = normalizePausedBufferLimit(pausedBufferByteLimit);

  const normalizeBytes = bytes => {
    if (typeof bytes === "string") return bytes;
    return new Uint8Array(bytes);
  };

  const flushBufferedBytes = () => {
    const writes = coalesceBufferedWrites(bufferedWrites);
    const count = bufferedWrites.length;
    if (droppedBufferedByteLength > 0) {
      terminal.write(buildDroppedOutputNotice(droppedBufferedByteLength));
    }
    for (const bytes of writes) terminal.write(bytes);
    bufferedWrites = [];
    bufferedByteLength = 0;
    droppedBufferedByteLength = 0;
    return count;
  };

  return {
    terminal,
    fit,
    search,
    renderer,
    rendererMessage,
    webglEnabled: Boolean(webgl),
    open(element) {
      terminal.open(element);
      fit.fit();
    },
    writeBytes(bytes) {
      const normalized = normalizeBytes(bytes);
      if (renderingPaused) {
        bufferedWrites.push(normalized);
        bufferedByteLength += getWriteByteLength(normalized);
        trimBufferedWritesToLimit();
        return;
      }
      terminal.write(normalized);
    },
    setRenderingPaused(paused) {
      renderingPaused = Boolean(paused);
      return renderingPaused ? 0 : flushBufferedBytes();
    },
    flushBufferedBytes,
    getBufferedWriteCount() {
      return bufferedWrites.length;
    },
    getBufferedByteLength() {
      return bufferedByteLength;
    },
    getDroppedBufferedByteLength() {
      return droppedBufferedByteLength;
    },
    resize() {
      fit.fit();
      return { cols: terminal.cols, rows: terminal.rows };
    },
    dispose() {
      dataSubscription?.dispose();
      terminal.dispose();
    }
  };

  function trimBufferedWritesToLimit() {
    if (bufferedByteLength <= bufferByteLimit) return;
    let bytesToDrop = bufferedByteLength - bufferByteLimit;

    while (bytesToDrop > 0 && bufferedWrites.length) {
      const first = bufferedWrites[0];
      const firstSize = getWriteByteLength(first);
      if (firstSize <= bytesToDrop) {
        bufferedWrites.shift();
        bufferedByteLength -= firstSize;
        droppedBufferedByteLength += firstSize;
        bytesToDrop -= firstSize;
        continue;
      }

      bufferedWrites[0] = dropWritePrefix(first, bytesToDrop);
      bufferedByteLength -= bytesToDrop;
      droppedBufferedByteLength += bytesToDrop;
      bytesToDrop = 0;
    }
  }
}

function localizeRendererError(message) {
  const text = String(message || "").trim();
  if (/webgl disabled/i.test(text)) return "WebGL 已禁用";
  return text;
}

function coalesceBufferedWrites(writes) {
  const coalesced = [];
  for (const write of writes) {
    const previous = coalesced[coalesced.length - 1];
    if (typeof write === "string" && typeof previous === "string") {
      coalesced[coalesced.length - 1] = `${previous}${write}`;
      continue;
    }
    if (write instanceof Uint8Array && previous instanceof Uint8Array) {
      coalesced[coalesced.length - 1] = concatBytes(previous, write);
      continue;
    }
    coalesced.push(write);
  }
  return coalesced;
}

function concatBytes(left, right) {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left, 0);
  joined.set(right, left.length);
  return joined;
}

function normalizePausedBufferLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PAUSED_RENDER_BUFFER_LIMIT;
  return Math.floor(value);
}

function getWriteByteLength(write) {
  if (typeof write === "string") return write.length;
  if (write instanceof Uint8Array) return write.byteLength;
  return 0;
}

function dropWritePrefix(write, byteCount) {
  if (typeof write === "string") return write.slice(byteCount);
  if (write instanceof Uint8Array) return write.slice(byteCount);
  return write;
}

function buildDroppedOutputNotice(byteCount) {
  const label = formatByteCount(byteCount);
  return `\r\n[RELAY] 窗口隐藏期间输出过多,已丢弃约 ${label} 旧输出。\r\n`;
}

function formatByteCount(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KiB`;
  return `${Math.max(0, Math.round(bytes))} B`;
}
