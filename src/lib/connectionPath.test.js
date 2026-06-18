import { describe, expect, it } from "vitest";
import { buildConnectionConfigPageDisplay, buildConnectionConfigProxyNodeDisplay, buildConnectionPathDisplayNodes, buildConnectionPathNodes, buildConnectionProbeSegmentDisplay, buildConnectionProbeSummary, describeConnectionPath, formatConnectionProbeStatus, summarizeConnectionPath } from "./connectionPath.js";

describe("connectionPath", () => {
  it("builds a direct path", () => {
    expect(buildConnectionPathNodes({ name: "prod-web" })).toEqual([
      { kind: "local", label: "本机" },
      { kind: "target", label: "prod-web" },
    ]);
    expect(describeConnectionPath({ name: "prod-web" })).toBe("本机 -> prod-web");
    expect(summarizeConnectionPath({ name: "prod-web" })).toBe("直连");
  });

  it("includes jump hosts", () => {
    expect(buildConnectionPathNodes({ chain: ["bastion-sh", "relay-db"], name: "prod-db" })).toEqual([
      { kind: "local", label: "本机" },
      { kind: "hop", label: "bastion-sh" },
      { kind: "hop", label: "relay-db" },
      { kind: "target", label: "prod-db" },
    ]);
    expect(summarizeConnectionPath({ chain: ["bastion-sh", "relay-db"], name: "prod-db" })).toBe("2 跳");
  });

  it("uses structured jump host labels when they match the visible chain", () => {
    const input = {
      chain: ["bastion-sh", "relay-v6"],
      jumpHosts: [
        { name: "bastion-sh", host: "203.0.113.10", user: "ops", port: 2222 },
        { name: "relay-v6", host: "2001:db8::7", user: "relay", port: 22 },
      ],
      name: "prod-web",
    };

    expect(buildConnectionPathNodes(input)).toEqual([
      { kind: "local", label: "本机" },
      { kind: "hop", label: "ops@203.0.113.10:2222" },
      { kind: "hop", label: "relay@[2001:db8::7]" },
      { kind: "target", label: "prod-web" },
    ]);
    expect(describeConnectionPath(input)).toBe("本机 -> ops@203.0.113.10:2222 -> relay@[2001:db8::7] -> prod-web");
    expect(summarizeConnectionPath(input)).toBe("2 跳");
  });

  it("normalizes structured jump host labels before display", () => {
    expect(describeConnectionPath({
      chain: ["bastion-sh"],
      jumpHosts: [{ name: " bastion-sh ", host: " 203.0.113.10 ", user: " ops ", port: "bad" }],
      name: "target",
    })).toBe("本机 -> ops@203.0.113.10 -> target");
  });

  it("formats structured jump host IPv6 labels through the shared host address formatter", () => {
    expect(describeConnectionPath({
      chain: ["relay-v6"],
      jumpHosts: [{ name: " relay-v6 ", host: " [2001:db8::7] ", user: " relay ", port: "22" }],
      name: "target",
    })).toBe("本机 -> relay@[2001:db8::7] -> target");

    expect(describeConnectionPath({
      chain: ["relay-v6"],
      jumpHosts: [{ name: "relay-v6", host: " 2001:db8::8 ", user: "relay", port: "2200" }],
      name: "target",
    })).toBe("本机 -> relay@[2001:db8::8]:2200 -> target");
  });

  it("falls back to chain labels when structured jump host metadata is unusable", () => {
    expect(describeConnectionPath({
      chain: ["bastion-sh"],
      jumpHosts: [{ name: "bastion-sh", host: "203.0.113.10", user: " " }],
      name: "target",
    })).toBe("本机 -> bastion-sh -> target");
  });

  it("falls back to chain labels when structured jump hosts are stale", () => {
    expect(describeConnectionPath({
      chain: ["new-bastion"],
      jumpHosts: [{ name: "old-bastion", host: "203.0.113.10", user: "ops", port: 2222 }],
      name: "target",
    })).toBe("本机 -> new-bastion -> target");
  });

  it("includes socks and http proxy nodes", () => {
    expect(describeConnectionPath({
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080" },
      chain: ["bastion"],
      name: "target",
    })).toBe("本机 -> SOCKS5 127.0.0.1:1080 -> bastion -> target");

    expect(describeConnectionPath({
      proxy: { type: " HTTP ", host: " proxy.local ", port: "bad" },
      name: "target",
    })).toBe("本机 -> HTTP proxy.local:8080 -> target");
  });

  it("formats proxy IPv6 endpoints through the shared host address formatter", () => {
    expect(describeConnectionPath({
      proxy: { type: "socks5", host: " 2001:db8::5 ", port: "1080" },
      name: "target",
    })).toBe("本机 -> SOCKS5 [2001:db8::5]:1080 -> target");

    expect(describeConnectionPath({
      proxy: { type: "http", host: " [2001:db8::6] ", port: "8080", auth: true, username: " edge " },
      name: "target",
    })).toBe("本机 -> HTTP edge@[2001:db8::6]:8080 -> target");
  });

  it("labels authenticated proxies without exposing passwords", () => {
    const path = describeConnectionPath({
      proxy: { type: "socks5", host: "proxy.local", port: "1080", auth: true, username: "edge", password: "secret" },
      name: "target",
    });

    expect(path).toBe("本机 -> SOCKS5 edge@proxy.local:1080 -> target");
    expect(path).not.toContain("secret");
  });

  it("includes ProxyCommand nodes without exposing the full command inline", () => {
    expect(buildConnectionPathNodes({
      proxy: { type: "cmd", cmd: "connect -S %h:%p" },
      name: "target",
    })).toEqual([
      { kind: "local", label: "本机" },
      { kind: "proxy", label: "ProxyCommand" },
      { kind: "target", label: "target" },
    ]);
  });

  it("builds config-page proxy node display from normalized proxy profiles", () => {
    expect(buildConnectionConfigProxyNodeDisplay({
      kind: " HTTP ",
      host: " [2001:db8::6] ",
      port: "bad",
      auth: true,
      username: " edge ",
    })).toEqual({
      visible: true,
      label: "HTTP 代理",
      sub: "edge@[2001:db8::6]:8080",
      type: "http",
    });

    expect(buildConnectionConfigProxyNodeDisplay({
      type: "cmd",
      cmd: "connect -S %h:%p",
    })).toEqual({
      visible: true,
      label: "ProxyCommand",
      sub: "connect -S %h:%p",
      type: "cmd",
    });

    expect(buildConnectionConfigProxyNodeDisplay({
      type: "cmd",
      cmd: "sshpass -p secret ssh -W %h:%p bastion",
    })).toEqual({
      visible: false,
      label: "",
      sub: "",
      type: "none",
    });
  });

  it("builds config-page chrome display metadata", () => {
    expect(buildConnectionConfigPageDisplay({
      hostName: " prod-web ",
      testing: true,
      hasJumpHosts: true,
    })).toMatchObject({
      pageTitle: "连接配置",
      accentWord: "prod-web",
      saveButtonLabel: "保存",
      chainSectionTitle: "连接链路编排",
      insertNodeLabel: "＋ 插入跳板 / 中继",
      testButtonLabel: "探测中",
      testButtonDisabled: true,
      hopDragTitle: "拖拽调整跳板顺序",
      moveLeftTitle: "左移",
      moveRightTitle: "右移",
      removeHopTitle: "移除",
      jumpAuthVisible: true,
      jumpAuthTitle: "跳板认证详情",
      jumpTotpUnboundLabel: "不绑定",
      proxySectionTitle: "出口代理",
      forwardsSectionTitle: "端口转发与隧道",
      sshCommandSectionTitle: "等效 SSH 命令",
    });

    expect(buildConnectionConfigPageDisplay()).toMatchObject({
      accentWord: "未命名主机",
      testButtonLabel: "⚡ 测试链路",
      testButtonDisabled: false,
      jumpAuthVisible: false,
      defaultJumpPortPlaceholder: "22",
      defaultIdentityFilePlaceholder: "~/.ssh/bastion_ed25519",
    });
  });

  it("summarizes proxy and jump count together", () => {
    expect(summarizeConnectionPath({
      proxy: { type: "socks5", host: "127.0.0.1", port: "1080" },
      chain: ["bastion"],
      name: "target",
    })).toBe("经出口代理 · 1 跳");
  });

  it("bounds displayed path nodes while preserving the full path description", () => {
    const input = {
      proxy: { type: "http", host: "proxy.local", port: "8080" },
      chain: ["hop-1", "hop-2", "hop-3", "hop-4", "hop-5"],
      name: "target",
    };

    expect(buildConnectionPathDisplayNodes(input, { limit: 5 })).toEqual([
      { kind: "local", label: "本机" },
      { kind: "proxy", label: "HTTP proxy.local:8080" },
      { kind: "hop", label: "hop-1" },
      { kind: "overflow", label: "+4 跳", hiddenCount: 4 },
      { kind: "target", label: "target" },
    ]);
    expect(describeConnectionPath(input)).toBe("本机 -> HTTP proxy.local:8080 -> hop-1 -> hop-2 -> hop-3 -> hop-4 -> hop-5 -> target");
    expect(summarizeConnectionPath(input)).toBe("经出口代理 · 5 跳");
  });

  it("localizes probe status labels for connection-path nodes", () => {
    expect(formatConnectionProbeStatus("ok")).toBe("已通过");
    expect(formatConnectionProbeStatus("failed")).toBe("失败");
    expect(formatConnectionProbeStatus("unchecked")).toBe("待验证");
    expect(formatConnectionProbeStatus("")).toBe("未知");
  });

  it("builds display metadata for connection probe segments", () => {
    expect(buildConnectionProbeSegmentDisplay({ status: "ok", latencyMs: 12.4, message: "tcp reachable" })).toEqual({
      hasResult: true,
      status: "ok",
      label: "已通过",
      tone: "success",
      title: "tcp reachable",
      latencyLabel: "12ms",
      showEdgeStatus: false,
    });
    expect(buildConnectionProbeSegmentDisplay({ status: "failed", latencyMs: null, message: " tcp timed out " })).toEqual({
      hasResult: true,
      status: "failed",
      label: "失败",
      tone: "error",
      title: "tcp timed out",
      latencyLabel: "",
      showEdgeStatus: true,
    });
    expect(buildConnectionProbeSegmentDisplay({ status: "unchecked", latencyMs: -1 })).toMatchObject({
      status: "unchecked",
      label: "待验证",
      tone: "pending",
      latencyLabel: "",
      showEdgeStatus: true,
    });
    expect(buildConnectionProbeSegmentDisplay({ status: "stale", latencyMs: "bad" })).toMatchObject({
      status: "unchecked",
      label: "待验证",
      tone: "pending",
      latencyLabel: "",
    });
    expect(buildConnectionProbeSegmentDisplay(null)).toEqual({
      hasResult: false,
      status: "",
      label: "",
      tone: "neutral",
      title: "",
      latencyLabel: "",
      showEdgeStatus: false,
    });
  });

  it("summarizes a fully verified connection probe with total latency", () => {
    expect(buildConnectionProbeSummary([
      { from: "本机", to: "bastion", status: "ok", latencyMs: 18, message: "tcp reachable" },
      { from: "bastion", to: "prod", status: "ok", latencyMs: 42.4, message: "ssh channel reachable" },
    ])).toEqual({
      text: "✓ 已探测 · 共 60ms",
      tone: "success",
      title: "本机 -> bastion · 已通过 · 18ms · tcp reachable\nbastion -> prod · 已通过 · 42ms · ssh channel reachable",
    });
  });

  it("summarizes failed connection probes with the failed endpoint and verified count", () => {
    expect(buildConnectionProbeSummary([
      { from: "本机", to: "proxy", status: "ok", latencyMs: 5 },
      { from: "proxy", to: "bastion", status: "failed", latencyMs: null, message: "tcp timed out" },
      { from: "bastion", to: "prod", status: "unchecked", latencyMs: null },
    ])).toEqual({
      text: "× bastion 不可达 · 已通过 1/3 段 · 已测 5ms",
      tone: "error",
      title: "本机 -> proxy · 已通过 · 5ms\nproxy -> bastion · 失败 · tcp timed out\nbastion -> prod · 待验证",
    });
  });

  it("summarizes partially verified connection probes", () => {
    expect(buildConnectionProbeSummary([
      { from: "本机", to: "bastion", status: "ok", latencyMs: 18 },
      { from: "bastion", to: "prod", status: "unchecked", latencyMs: null, message: "requires authenticated SSH channel" },
    ])).toEqual({
      text: "已探测 1/2 段 · 1 段需 SSH 通道验证 · 已测 18ms",
      tone: "pending",
      title: "本机 -> bastion · 已通过 · 18ms\nbastion -> prod · 待验证 · requires authenticated SSH channel",
    });
  });

  it("returns an empty neutral summary without probe results", () => {
    expect(buildConnectionProbeSummary()).toEqual({ text: "", tone: "neutral", title: "" });
    expect(buildConnectionProbeSummary(null)).toEqual({ text: "", tone: "neutral", title: "" });
  });
});
