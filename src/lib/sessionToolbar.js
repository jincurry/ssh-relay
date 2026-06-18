export function buildSessionToolbarDisplay({
  host = {},
  splitEnabled = false,
  showSearch = false,
  showSnippets = false,
  broadcast = false,
  showMonitor = true,
  searchShortcut = "",
  snippetShortcut = "",
  latencyLabel = "23ms",
} = {}) {
  const hostName = String(host?.name || host?.host || "未命名主机").trim() || "未命名主机";
  return {
    backLabel: "← 主机列表",
    hostName,
    hostStatus: "online",
    latencyLabel: String(latencyLabel || "").trim(),
    splitButton: {
      label: splitEnabled ? "× 关闭拆分" : "＋ 拆分",
      active: Boolean(splitEnabled),
      activeTone: "pending",
    },
    actions: [
      {
        id: "search",
        label: `${String(searchShortcut || "").trim()} 搜索`.trim(),
        active: Boolean(showSearch),
        activeTone: "pending",
      },
      {
        id: "snippets",
        label: `${String(snippetShortcut || "").trim()} 片段`.trim(),
        active: Boolean(showSnippets),
        activeTone: "pending",
      },
      {
        id: "broadcast",
        label: `⌁ 广播 ${broadcast ? "开" : "关"}`,
        active: Boolean(broadcast),
        activeTone: "pending",
      },
      {
        id: "monitor",
        label: "📈 监控",
        active: Boolean(showMonitor),
        activeTone: "success",
      },
      {
        id: "sftp",
        label: "⇅ SFTP",
        active: false,
        activeTone: "neutral",
      },
    ],
    transferHint: "拖文件到终端 = trz 上传 · 输入 tsz 文件名 = 下载",
  };
}
