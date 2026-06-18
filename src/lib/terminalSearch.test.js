import { describe, expect, it, vi } from "vitest";
import { buildTerminalSearchBarDisplay, buildTerminalSearchOptions, clearRelayTerminalSearch, searchPreviewLines, searchRelayTerminal } from "./terminalSearch.js";

describe("terminalSearch", () => {
  it("builds xterm search options from theme tokens", () => {
    expect(buildTerminalSearchOptions({
      amber: "#E8A33D",
      amberSoft: "rgba(232,163,61,0.12)",
      blue: "#5B9DD9",
      blueSoft: "rgba(91,157,217,0.12)",
    }, { caseSensitive: true })).toMatchObject({
      caseSensitive: true,
      decorations: {
        matchBackground: "rgba(232,163,61,0.12)",
        activeMatchBorder: "#5B9DD9",
      },
    });
  });

  it("builds terminal search bar display metadata for split panes", () => {
    expect(buildTerminalSearchBarDisplay({
      splitEnabled: true,
      pane: "split",
      status: "已定位匹配",
      statusTone: "success",
    })).toEqual({
      label: "查找",
      inputPlaceholder: "搜索终端输出…",
      paneOptions: [
        { id: "primary", label: "主", selected: false, borderAfter: true },
        { id: "split", label: "拆分", selected: true, borderAfter: false },
      ],
      caseSensitiveLabel: "Aa",
      previousIcon: "↑",
      previousTitle: "上一个匹配",
      nextIcon: "↓",
      nextTitle: "下一个匹配",
      closeIcon: "×",
      closeTitle: "关闭搜索",
      statusText: "已定位匹配",
      statusTone: "success",
    });
  });

  it("hides pane selectors and normalizes invalid search bar tones", () => {
    expect(buildTerminalSearchBarDisplay({
      splitEnabled: false,
      pane: "unknown",
      status: null,
      statusTone: "loud",
    })).toMatchObject({
      paneOptions: [],
      statusText: "",
      statusTone: "neutral",
    });
  });

  it("runs next and previous searches against a relay terminal", () => {
    const relayTerm = {
      search: {
        findNext: vi.fn().mockReturnValue(true),
        findPrevious: vi.fn().mockReturnValue(false),
      },
      terminal: {
        focus: vi.fn(),
      },
    };

    expect(searchRelayTerminal(relayTerm, "nginx", "next", { caseSensitive: false })).toMatchObject({
      searched: true,
      found: true,
      tone: "success",
    });
    expect(searchRelayTerminal(relayTerm, "nginx", "previous", { caseSensitive: false })).toMatchObject({
      searched: true,
      found: false,
      tone: "error",
    });
    expect(relayTerm.search.findNext).toHaveBeenCalledWith("nginx", { caseSensitive: false });
    expect(relayTerm.search.findPrevious).toHaveBeenCalledWith("nginx", { caseSensitive: false });
    expect(relayTerm.terminal.focus).toHaveBeenCalledTimes(2);
  });

  it("clears search when the query is empty", () => {
    const relayTerm = {
      search: { clearDecorations: vi.fn() },
      terminal: { clearSelection: vi.fn() },
    };

    expect(searchRelayTerminal(relayTerm, "")).toMatchObject({
      searched: false,
      message: "输入搜索词",
      tone: "neutral",
    });
    expect(relayTerm.search.clearDecorations).toHaveBeenCalledOnce();
    expect(relayTerm.terminal.clearSelection).toHaveBeenCalledOnce();
  });

  it("marks unsupported relay search as an error state", () => {
    expect(searchRelayTerminal({}, "nginx")).toMatchObject({
      searched: false,
      found: false,
      message: "当前终端不支持搜索",
      tone: "error",
    });
  });

  it("searches preview lines with optional case sensitivity", () => {
    const lines = [{ c: "Welcome to Ubuntu" }, { c: "tail -f /var/log/nginx/access.log" }];

    expect(searchPreviewLines(lines, "NGINX")).toMatchObject({
      found: true,
      index: 1,
      tone: "success",
    });
    expect(searchPreviewLines(lines, "NGINX", { caseSensitive: true })).toMatchObject({
      found: false,
      index: -1,
      tone: "error",
    });
  });

  it("clears relay terminal decorations directly", () => {
    const relayTerm = {
      search: { clearDecorations: vi.fn() },
      terminal: { clearSelection: vi.fn() },
    };

    clearRelayTerminalSearch(relayTerm);
    expect(relayTerm.search.clearDecorations).toHaveBeenCalledOnce();
    expect(relayTerm.terminal.clearSelection).toHaveBeenCalledOnce();
  });
});
