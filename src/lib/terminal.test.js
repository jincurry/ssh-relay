import { describe, expect, it } from "vitest";
import { toXtermTheme } from "./xtermTheme.js";

class FakeTerminal {
  constructor(options) {
    this.options = options;
    this.addons = [];
    this.cols = 120;
    this.rows = 32;
    this.writes = [];
  }

  loadAddon(addon) {
    this.addons.push(addon);
  }

  onData(callback) {
    this.onDataCallback = callback;
    return { dispose: () => { this.disposedSubscription = true; } };
  }

  open(element) {
    this.element = element;
  }

  write(bytes) {
    this.writes.push(bytes);
  }

  dispose() {
    this.disposed = true;
  }
}

class FakeFitAddon {
  constructor() {
    this.fitCalls = 0;
  }

  fit() {
    this.fitCalls += 1;
  }
}

class FakeSearchAddon {}
class FakeLinksAddon {}
class FakeWebglAddon {}

class FailingWebglAddon {
  constructor() {
    throw new Error("webgl disabled");
  }
}

describe("toXtermTheme", () => {
  it("maps RELAY theme tokens to xterm colors", () => {
    const mapped = toXtermTheme({
      bg: "#0C0F14",
      text: "#E6EAF0",
      amber: "#E8A33D",
      amberSoft: "rgba(232,163,61,0.12)",
      onAccent: "#1A1206",
      faint: "#5A6374",
      red: "#E5534B",
      green: "#4CC38A",
      blue: "#5B9DD9"
    });

    expect(mapped.background).toBe("#0C0F14");
    expect(mapped.cursor).toBe("#E8A33D");
    expect(mapped.green).toBe("#4CC38A");
    expect(mapped.selectionBackground).toBe("rgba(232,163,61,0.12)");
  });

  it("fills missing theme tokens before passing colors to xterm", () => {
    const mapped = toXtermTheme({
      bg: "#111111",
      text: "#eeeeee",
      amber: "#ff0000",
    });

    expect(mapped.background).toBe("#111111");
    expect(mapped.foreground).toBe("#eeeeee");
    expect(mapped.cursor).toBe("#ff0000");
    expect(mapped.selectionBackground).toBe("#ff000022");
    expect(mapped.green).toBe("#4CC38A");
    expect(Object.values(mapped).every(Boolean)).toBe(true);
  });
});

describe("createRelayTerminal", () => {
  async function loadCreateRelayTerminal() {
    globalThis.self = globalThis.self || globalThis;
    return (await import("./terminal.js")).createRelayTerminal;
  }

  const baseOptions = {
    theme: {
      bg: "#0C0F14",
      text: "#E6EAF0",
      amber: "#E8A33D",
      amberSoft: "rgba(232,163,61,0.12)",
      onAccent: "#1A1206",
      faint: "#5A6374",
      red: "#E5534B",
      green: "#4CC38A",
      blue: "#5B9DD9",
    },
    fontFamily: "monospace",
    fontSize: 13,
    TerminalClass: FakeTerminal,
    FitAddonClass: FakeFitAddon,
    SearchAddonClass: FakeSearchAddon,
    WebLinksAddonClass: FakeLinksAddon,
  };

  it("reports WebGL renderer when the addon loads", async () => {
    const createRelayTerminal = await loadCreateRelayTerminal();
    const relayTerm = createRelayTerminal({
      ...baseOptions,
      WebglAddonClass: FakeWebglAddon,
    });

    expect(relayTerm.webglEnabled).toBe(true);
    expect(relayTerm.renderer).toBe("webgl");
    expect(relayTerm.rendererMessage).toBe("WebGL 渲染器已启用");
  });

  it("falls back to Canvas renderer when WebGL cannot load", async () => {
    const createRelayTerminal = await loadCreateRelayTerminal();
    const relayTerm = createRelayTerminal({
      ...baseOptions,
      WebglAddonClass: FailingWebglAddon,
    });

    expect(relayTerm.webglEnabled).toBe(false);
    expect(relayTerm.renderer).toBe("canvas");
    expect(relayTerm.rendererMessage).toContain("已降级为 Canvas");
    expect(relayTerm.rendererMessage).toContain("WebGL 已禁用");
  });

  it("wires fit, data and byte writing through the terminal wrapper", async () => {
    const createRelayTerminal = await loadCreateRelayTerminal();
    const dataEvents = [];
    const relayTerm = createRelayTerminal({
      ...baseOptions,
      onData: data => dataEvents.push(data),
      WebglAddonClass: FakeWebglAddon,
    });

    relayTerm.open({ nodeType: 1 });
    relayTerm.writeBytes([65, 66]);
    relayTerm.resize();
    relayTerm.terminal.onDataCallback("ls\r");
    relayTerm.dispose();

    expect(relayTerm.fit.fitCalls).toBe(2);
    expect(relayTerm.terminal.writes).toEqual([new Uint8Array([65, 66])]);
    expect(dataEvents).toEqual(["ls\r"]);
    expect(relayTerm.terminal.disposedSubscription).toBe(true);
    expect(relayTerm.terminal.disposed).toBe(true);
  });

  it("buffers byte writes while rendering is paused and flushes them in order", async () => {
    const createRelayTerminal = await loadCreateRelayTerminal();
    const relayTerm = createRelayTerminal({
      ...baseOptions,
      WebglAddonClass: FakeWebglAddon,
    });

    expect(relayTerm.setRenderingPaused(true)).toBe(0);
    relayTerm.writeBytes([65]);
    relayTerm.writeBytes("BC");
    relayTerm.writeBytes(new Uint8Array([68]));

    expect(relayTerm.terminal.writes).toEqual([]);
    expect(relayTerm.getBufferedWriteCount()).toBe(3);

    expect(relayTerm.setRenderingPaused(false)).toBe(3);

    expect(relayTerm.terminal.writes).toEqual([
      new Uint8Array([65]),
      "BC",
      new Uint8Array([68]),
    ]);
    expect(relayTerm.getBufferedWriteCount()).toBe(0);
  });

  it("coalesces adjacent paused writes before replaying them to xterm", async () => {
    const createRelayTerminal = await loadCreateRelayTerminal();
    const relayTerm = createRelayTerminal({
      ...baseOptions,
      WebglAddonClass: FakeWebglAddon,
    });

    relayTerm.setRenderingPaused(true);
    relayTerm.writeBytes([65]);
    relayTerm.writeBytes(new Uint8Array([66, 67]));
    relayTerm.writeBytes("DE");
    relayTerm.writeBytes("FG");
    relayTerm.writeBytes([72]);

    expect(relayTerm.setRenderingPaused(false)).toBe(5);
    expect(relayTerm.terminal.writes).toEqual([
      new Uint8Array([65, 66, 67]),
      "DEFG",
      new Uint8Array([72]),
    ]);
  });

  it("keeps paused rendering buffers bounded by dropping the oldest output", async () => {
    const createRelayTerminal = await loadCreateRelayTerminal();
    const relayTerm = createRelayTerminal({
      ...baseOptions,
      WebglAddonClass: FakeWebglAddon,
      pausedBufferByteLimit: 5,
    });

    relayTerm.setRenderingPaused(true);
    relayTerm.writeBytes("abc");
    relayTerm.writeBytes("def");
    relayTerm.writeBytes(new Uint8Array([103, 104]));

    expect(relayTerm.getBufferedByteLength()).toBe(5);
    expect(relayTerm.getDroppedBufferedByteLength()).toBe(3);
    expect(relayTerm.setRenderingPaused(false)).toBe(2);
    expect(relayTerm.terminal.writes).toEqual([
      "\r\n[RELAY] 窗口隐藏期间输出过多,已丢弃约 3 B 旧输出。\r\n",
      "def",
      new Uint8Array([103, 104]),
    ]);
    expect(relayTerm.getBufferedByteLength()).toBe(0);
    expect(relayTerm.getDroppedBufferedByteLength()).toBe(0);
  });

  it("trims an oversized paused byte chunk to the latest bytes", async () => {
    const createRelayTerminal = await loadCreateRelayTerminal();
    const relayTerm = createRelayTerminal({
      ...baseOptions,
      WebglAddonClass: FakeWebglAddon,
      pausedBufferByteLimit: 4,
    });

    relayTerm.setRenderingPaused(true);
    relayTerm.writeBytes(new Uint8Array([65, 66, 67, 68, 69, 70]));

    expect(relayTerm.getBufferedByteLength()).toBe(4);
    expect(relayTerm.getDroppedBufferedByteLength()).toBe(2);
    relayTerm.setRenderingPaused(false);
    expect(relayTerm.terminal.writes).toEqual([
      "\r\n[RELAY] 窗口隐藏期间输出过多,已丢弃约 2 B 旧输出。\r\n",
      new Uint8Array([67, 68, 69, 70]),
    ]);
  });
});
