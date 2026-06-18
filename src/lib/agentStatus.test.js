import { describe, expect, it } from "vitest";
import { buildSshAgentStatusDisplay } from "./agentStatus.js";

describe("agentStatus", () => {
  it("builds top-bar display metadata for ready and preview agents", () => {
    expect(buildSshAgentStatusDisplay({
      status: "ready",
      identityCount: 2.8,
      message: "  agent connected  ",
      socket: " /tmp/agent.sock ",
    })).toEqual({
      status: "ready",
      label: "密钥代理就绪(2)",
      tone: "success",
      title: "agent connected\nSSH_AUTH_SOCK=/tmp/agent.sock",
      identityCount: 2,
    });

    expect(buildSshAgentStatusDisplay({
      status: "preview",
      identityCount: 1,
      message: "浏览器预览 SSH Agent 状态",
    })).toMatchObject({
      label: "密钥代理预览",
      tone: "success",
      title: "浏览器预览 SSH Agent 状态",
      identityCount: 1,
    });
  });

  it("builds pending labels for empty, missing, and checking states", () => {
    expect(buildSshAgentStatusDisplay({ status: "empty" })).toMatchObject({
      label: "密钥代理空",
      tone: "pending",
    });
    expect(buildSshAgentStatusDisplay({ status: "missing" })).toMatchObject({
      label: "未发现密钥代理",
      tone: "pending",
    });
    expect(buildSshAgentStatusDisplay({ status: "checking" })).toMatchObject({
      label: "检测密钥代理",
      tone: "pending",
    });
  });

  it("marks errors and unknown states explicitly", () => {
    expect(buildSshAgentStatusDisplay({ status: "error", message: "agent failed" })).toMatchObject({
      status: "error",
      label: "密钥代理异常",
      tone: "error",
      title: "agent failed",
    });

    expect(buildSshAgentStatusDisplay({ status: " stale ", identityCount: -1, message: " " })).toEqual({
      status: "stale",
      label: "密钥代理异常",
      tone: "pending",
      title: "",
      identityCount: 0,
    });
  });
});
