import { describe, expect, it } from "vitest";
import { buildSessionInputPlaceholder, buildSessionInputPrefix, countActiveCommandTargets, getCommandTargetPaneIds } from "./sessionBroadcast.js";

describe("sessionBroadcast", () => {
  it("targets only the active pane when broadcast is disabled", () => {
    expect(getCommandTargetPaneIds({ broadcast: false, splitEnabled: true, activePaneId: "split" })).toEqual(["split"]);
    expect(getCommandTargetPaneIds({ broadcast: false, splitEnabled: true, activePaneId: "primary" })).toEqual(["primary"]);
    expect(countActiveCommandTargets({ broadcast: false, splitEnabled: true })).toBe(1);
  });

  it("targets both panes when broadcast and split are both enabled", () => {
    expect(getCommandTargetPaneIds({ broadcast: true, splitEnabled: true })).toEqual(["primary", "split"]);
    expect(countActiveCommandTargets({ broadcast: true, splitEnabled: true })).toBe(2);
  });

  it("keeps broadcast copy honest before split is opened", () => {
    expect(buildSessionInputPlaceholder({ broadcast: true, splitEnabled: false })).toContain("打开拆分");
    expect(buildSessionInputPrefix({ broadcast: true, splitEnabled: false })).toBe("⌁ 广播");
  });

  it("shows the two-session broadcast state", () => {
    expect(buildSessionInputPlaceholder({ broadcast: true, splitEnabled: true })).toContain("2 个会话");
    expect(buildSessionInputPrefix({ broadcast: true, splitEnabled: true })).toBe("⌁ 2 个");
  });

  it("labels the active split target when broadcast is disabled", () => {
    expect(buildSessionInputPlaceholder({ broadcast: false, splitEnabled: true, activePaneId: "primary" })).toContain("主会话");
    expect(buildSessionInputPlaceholder({ broadcast: false, splitEnabled: true, activePaneId: "split" })).toContain("拆分会话");
    expect(buildSessionInputPrefix({ broadcast: false, splitEnabled: true, activePaneId: "primary" })).toBe("❯ 主");
    expect(buildSessionInputPrefix({ broadcast: false, splitEnabled: true, activePaneId: "split" })).toBe("❯ 拆分");
  });
});
