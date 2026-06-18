import { describe, expect, it } from "vitest";
import {
  areHostCardActionsVisible,
  buildHostCardDisplay,
  buildHostFormDisplay,
  buildHostListEmptyState,
  buildHostListSummary,
  buildHostListToolbarDisplay,
  buildHostListTopBarDisplay,
  buildHostSidebarDisplay,
  canOpenHostSession,
  canOpenHostSftp,
  countConnectableHosts,
  countOnlineHosts,
  getHostStatusPresentation,
  getHostCardActionPointerEvents,
  getHostCardActionTabIndex,
  isHostOffline,
  isHostOnline,
} from "./hostActions.js";

describe("hostActions", () => {
  it("treats only explicit offline hosts as unavailable", () => {
    expect(isHostOffline({ status: "offline" })).toBe(true);
    expect(isHostOffline({ status: "OFFLINE" })).toBe(true);
    expect(isHostOffline({ status: "busy" })).toBe(false);
    expect(isHostOffline({ status: "online" })).toBe(false);
    expect(isHostOffline({})).toBe(false);
  });

  it("treats only explicit online hosts as online for list summaries", () => {
    expect(isHostOnline({ status: "online" })).toBe(true);
    expect(isHostOnline({ status: "ONLINE" })).toBe(true);
    expect(isHostOnline({ status: "busy" })).toBe(false);
    expect(isHostOnline({ status: "offline" })).toBe(false);
    expect(isHostOnline({})).toBe(false);
  });

  it("guards session and SFTP actions for offline hosts", () => {
    const offline = { status: "offline" };
    const busy = { status: "busy" };

    expect(canOpenHostSession(offline)).toBe(false);
    expect(canOpenHostSftp(offline)).toBe(false);
    expect(canOpenHostSession(busy)).toBe(true);
    expect(canOpenHostSftp(busy)).toBe(true);
  });

  it("counts connectable hosts for online summaries", () => {
    expect(countConnectableHosts([
      { status: "online" },
      { status: "busy" },
      { status: "offline" },
    ])).toBe(2);
  });

  it("counts only online hosts for host list status summaries", () => {
    expect(countOnlineHosts([
      { status: "online" },
      { status: "busy" },
      { status: "offline" },
      { status: "ONLINE" },
    ])).toBe(2);
  });

  it("builds host list summary display text", () => {
    expect(buildHostListSummary([
      { status: "online" },
      { status: "busy" },
      { status: "offline" },
      { status: "ONLINE" },
    ])).toEqual({
      online: 2,
      total: 4,
      text: "2 在线 / 4 台",
      tone: "neutral",
    });

    expect(buildHostListSummary(null)).toEqual({
      online: 0,
      total: 0,
      text: "0 在线 / 0 台",
      tone: "neutral",
    });
  });

  it("builds host list empty-state display metadata", () => {
    expect(buildHostListEmptyState({
      visibleHosts: [{ name: "prod" }],
      allHosts: [{ name: "prod" }],
      selectedGroup: "生产环境",
    })).toEqual({
      visible: false,
      title: "",
      description: "",
      primaryActionLabel: "",
      secondaryActionLabel: "",
      secondaryAction: "",
    });

    expect(buildHostListEmptyState({
      visibleHosts: [],
      allHosts: [],
      selectedGroup: "全部主机",
    })).toEqual({
      visible: true,
      title: "还没有主机",
      description: "新增主机,或从 ~/.ssh/config 导入现有配置。",
      primaryActionLabel: "＋ 新增主机",
      secondaryActionLabel: "导入 SSH config",
      secondaryAction: "import",
    });

    expect(buildHostListEmptyState({
      visibleHosts: [],
      allHosts: [{ name: "prod" }],
      selectedGroup: " 生产环境 ",
    })).toEqual({
      visible: true,
      title: "生产环境 没有主机",
      description: "切换到全部主机,或新增主机后选择这个分组。",
      primaryActionLabel: "＋ 新增主机",
      secondaryActionLabel: "查看全部主机",
      secondaryAction: "all",
    });
  });

  it("builds manual host form display metadata", () => {
    expect(buildHostFormDisplay()).toMatchObject({
      title: "新增主机",
      errorText: "",
      errorVisible: false,
      cancelLabel: "取消",
      submitLabel: "保存",
    });
    expect(buildHostFormDisplay().fields).toEqual([
      { key: "name", label: "名称", placeholder: "prod-web-03", gridColumn: "" },
      { key: "host", label: "地址", placeholder: "10.2.1.13", gridColumn: "" },
      { key: "user", label: "用户", placeholder: "deploy", gridColumn: "" },
      { key: "port", label: "端口", placeholder: "22", gridColumn: "" },
      { key: "group", label: "分组", placeholder: "", gridColumn: "" },
      { key: "tags", label: "标签(逗号分隔)", placeholder: "nginx, 华东", gridColumn: "" },
      { key: "identityFile", label: "IdentityFile", placeholder: "~/.ssh/id_ed25519", gridColumn: "1 / -1" },
    ]);

    expect(buildHostFormDisplay({ editing: true, message: " 主机名称不能为空 " })).toMatchObject({
      title: "编辑主机",
      errorText: "主机名称不能为空",
      errorVisible: true,
    });
  });

  it("builds host-list top-bar display metadata", () => {
    expect(buildHostListTopBarDisplay({
      paletteShortcut: " Ctrl+K ",
      syncStatus: { text: " 本地配置已加载 ", tone: "success" },
      agentDisplay: { label: "密钥代理就绪(2)", title: "SSH_AUTH_SOCK=/tmp/agent.sock", tone: "success" },
    })).toEqual({
      brandText: "RELAY",
      brandSuffix: "SSH 控制台",
      searchPlaceholder: "搜索或快速连接…",
      paletteShortcut: "Ctrl+K",
      syncPrefix: "⟳",
      syncText: "本地配置已加载",
      syncTone: "success",
      syncVisible: true,
      exportLabel: "导出配置",
      importLabel: "导入配置",
      agentPrefix: "●",
      agentLabel: "密钥代理就绪(2)",
      agentTitle: "SSH_AUTH_SOCK=/tmp/agent.sock",
      agentTone: "success",
      agentVisible: true,
    });

    expect(buildHostListTopBarDisplay()).toMatchObject({
      paletteShortcut: "",
      syncVisible: false,
      agentVisible: false,
      syncTone: "success",
      agentTone: "pending",
    });
  });

  it("builds host-list toolbar and card action display metadata", () => {
    expect(buildHostListToolbarDisplay()).toEqual({
      addHostLabel: "＋ 新增主机",
      refreshStatusLabel: "刷新状态",
      refreshStatusDisabled: false,
      refreshStatusOpacity: 1,
      editHostTitle: "编辑主机",
      configHostTitle: "链路 / 代理 / 转发配置",
      deleteHostTitle: "删除主机",
      connectLabel: "连接",
    });

    expect(buildHostListToolbarDisplay({ probing: true })).toMatchObject({
      refreshStatusLabel: "探测中",
      refreshStatusDisabled: true,
      refreshStatusOpacity: 0.6,
    });
  });

  it("builds host-list sidebar display metadata", () => {
    expect(buildHostSidebarDisplay({ snippetShortcut: " Ctrl+; " })).toEqual({
      groupSectionLabel: "分组",
      toolSectionLabel: "工具",
      tools: [
        { id: "local", label: "›_ 本地终端" },
        { id: "snippets", label: "Ctrl+; 命令片段" },
        { id: "vault", label: "🔑 凭据保险库" },
        { id: "theme", label: "🎨 主题与外观" },
      ],
    });

    expect(buildHostSidebarDisplay().tools[1]).toEqual({
      id: "snippets",
      label: "命令片段",
    });
  });

  it("builds host card display state for favorite online hosts", () => {
    expect(buildHostCardDisplay(
      { status: "online", fav: true },
      { hovered: true, actionsVisible: true, latestLatency: 45 },
    )).toMatchObject({
      opacity: 1,
      transform: "translateY(-2px)",
      borderTone: "pending",
      favoriteIcon: "★",
      favoriteTitle: "取消收藏",
      favoriteTone: "pending",
      latency: 45,
      latencyLabel: "45ms",
      latencyTone: "pending",
      canConnect: true,
      canSftp: true,
      sftpTitle: "SFTP 文件",
      connectTitle: "连接主机",
      connectOpacity: 1,
      connectCursor: "pointer",
    });
  });

  it("builds host card display state for offline and missing-latency hosts", () => {
    expect(buildHostCardDisplay(
      { status: "offline", fav: false },
      { latestLatency: null },
    )).toMatchObject({
      opacity: 0.55,
      transform: "none",
      borderTone: "neutral",
      favoriteIcon: "☆",
      favoriteTitle: "收藏",
      favoriteTone: "neutral",
      latency: null,
      latencyLabel: "",
      latencyTone: "success",
      canConnect: false,
      canSftp: false,
      sftpTitle: "离线主机不可打开 SFTP",
      connectTitle: "离线主机不可连接",
      actionDisabledOpacity: 0.45,
      connectOpacity: 0.55,
      connectCursor: "not-allowed",
    });

    expect(buildHostCardDisplay({ status: "busy" }, { latestLatency: "12" })).toMatchObject({
      latency: 12,
      latencyLabel: "12ms",
      latencyTone: "success",
      canConnect: true,
    });
  });

  it("animates only online host status pulses", () => {
    expect(getHostStatusPresentation({ status: "online" })).toEqual({ tone: "online", animated: true });
    expect(getHostStatusPresentation({ status: "busy" })).toEqual({ tone: "busy", animated: false });
    expect(getHostStatusPresentation({ status: "offline" })).toEqual({ tone: "offline", animated: false });
    expect(getHostStatusPresentation({})).toEqual({ tone: "offline", animated: false });
  });

  it("reveals host card actions on hover or keyboard focus", () => {
    expect(areHostCardActionsVisible()).toBe(false);
    expect(areHostCardActionsVisible({ hovered: true })).toBe(true);
    expect(areHostCardActionsVisible({ focusWithin: true })).toBe(true);
    expect(areHostCardActionsVisible({ hovered: false, focusWithin: false })).toBe(false);
  });

  it("removes hidden host card actions from keyboard tab order", () => {
    expect(getHostCardActionTabIndex({ visible: false })).toBe(-1);
    expect(getHostCardActionTabIndex({ visible: true })).toBe(0);
  });

  it("keeps disabled host card actions out of keyboard tab order", () => {
    expect(getHostCardActionTabIndex({ visible: true, disabled: true })).toBe(-1);
    expect(getHostCardActionTabIndex({ visible: false, disabled: true })).toBe(-1);
  });

  it("blocks pointer events while host card actions are hidden", () => {
    expect(getHostCardActionPointerEvents(false)).toBe("none");
    expect(getHostCardActionPointerEvents(true)).toBe("auto");
  });
});
