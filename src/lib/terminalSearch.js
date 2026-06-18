export function buildTerminalSearchOptions(theme, { caseSensitive = false } = {}) {
  return {
    caseSensitive,
    decorations: {
      matchBackground: theme?.amberSoft || "rgba(232,163,61,0.18)",
      matchBorder: theme?.amber || "#E8A33D",
      matchOverviewRuler: theme?.amber || "#E8A33D",
      activeMatchBackground: theme?.blueSoft || "rgba(91,157,217,0.24)",
      activeMatchBorder: theme?.blue || "#5B9DD9",
      activeMatchColorOverviewRuler: theme?.blue || "#5B9DD9",
    },
  };
}

export function buildTerminalSearchBarDisplay({ splitEnabled = false, pane = "primary", status = "", statusTone = "neutral" } = {}) {
  const normalizedPane = pane === "split" ? "split" : "primary";
  const normalizedTone = statusTone === "success" || statusTone === "error" || statusTone === "pending"
    ? statusTone
    : "neutral";
  const paneOptions = splitEnabled ? [
    { id: "primary", label: "主", selected: normalizedPane === "primary", borderAfter: true },
    { id: "split", label: "拆分", selected: normalizedPane === "split", borderAfter: false },
  ] : [];

  return {
    label: "查找",
    inputPlaceholder: "搜索终端输出…",
    paneOptions,
    caseSensitiveLabel: "Aa",
    previousIcon: "↑",
    previousTitle: "上一个匹配",
    nextIcon: "↓",
    nextTitle: "下一个匹配",
    closeIcon: "×",
    closeTitle: "关闭搜索",
    statusText: String(status || ""),
    statusTone: normalizedTone,
  };
}

export function searchRelayTerminal(relayTerm, query, direction = "next", options = {}) {
  const term = String(query || "");
  if (!term) {
    clearRelayTerminalSearch(relayTerm);
    return { searched: false, found: false, message: "输入搜索词", tone: "neutral" };
  }

  const search = relayTerm?.search;
  if (!search) return { searched: false, found: false, message: "当前终端不支持搜索", tone: "error" };

  const found = direction === "previous"
    ? search.findPrevious(term, options)
    : search.findNext(term, options);
  relayTerm?.terminal?.focus?.();

  return {
    searched: true,
    found,
    message: found ? "已定位匹配" : "未找到匹配",
    tone: found ? "success" : "error",
  };
}

export function clearRelayTerminalSearch(relayTerm) {
  relayTerm?.search?.clearDecorations?.();
  relayTerm?.terminal?.clearSelection?.();
}

export function searchPreviewLines(lines = [], query, { caseSensitive = false } = {}) {
  const term = String(query || "");
  if (!term) return { searched: false, found: false, index: -1, message: "输入搜索词", tone: "neutral" };

  const needle = caseSensitive ? term : term.toLowerCase();
  const index = (Array.isArray(lines) ? lines : []).findIndex(line => {
    const text = String(line?.c ?? line ?? "");
    return (caseSensitive ? text : text.toLowerCase()).includes(needle);
  });

  return {
    searched: true,
    found: index >= 0,
    index,
    message: index >= 0 ? `预览匹配第 ${index + 1} 行` : "预览未找到匹配",
    tone: index >= 0 ? "success" : "error",
  };
}
