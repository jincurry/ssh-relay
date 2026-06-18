import { describe, expect, it } from "vitest";
import {
  ALL_HOSTS_GROUP,
  buildHostGroupNavItemDisplay,
  countHostsInGroup,
  filterHostsByGroup,
  getHostGroupOptions,
  normalizeHostGroupName,
  resolveSelectedHostGroup,
  sortHostsForDisplay,
} from "./hostGroups.js";

describe("hostGroups", () => {
  it("builds stable group options from defaults and trimmed host groups", () => {
    expect(getHostGroupOptions([
      { group: " 生产环境 " },
      { group: "SSH Config" },
      { group: "" },
      { group: "SSH Config" },
      {},
    ], [ALL_HOSTS_GROUP, "生产环境", "预发布"])).toEqual([
      ALL_HOSTS_GROUP,
      "生产环境",
      "预发布",
      "SSH Config",
    ]);
  });

  it("filters and counts hosts with normalized group names", () => {
    const hosts = [
      { id: 1, group: "生产环境" },
      { id: 2, group: " 生产环境 " },
      { id: 3, group: "预发布" },
    ];

    expect(filterHostsByGroup(hosts, " 生产环境 ")).toEqual([hosts[0], hosts[1]]);
    expect(countHostsInGroup(hosts, "生产环境")).toBe(2);
    expect(countHostsInGroup(hosts, ALL_HOSTS_GROUP)).toBe(3);
  });

  it("falls back to all hosts when the selected group is no longer available", () => {
    const groups = getHostGroupOptions([{ group: "生产环境" }], ["预发布"]);

    expect(resolveSelectedHostGroup("生产环境", groups)).toBe("生产环境");
    expect(resolveSelectedHostGroup("不存在", groups)).toBe(ALL_HOSTS_GROUP);
    expect(resolveSelectedHostGroup(" ", groups)).toBe(ALL_HOSTS_GROUP);
    expect(normalizeHostGroupName(null)).toBe("");
  });

  it("builds host group navigation item display state", () => {
    expect(buildHostGroupNavItemDisplay({
      group: " 生产环境 ",
      selectedGroup: "生产环境",
      count: "3.8",
    })).toEqual({
      label: "生产环境",
      count: 3,
      selected: true,
      tone: "pending",
      backgroundTone: "selected",
    });

    expect(buildHostGroupNavItemDisplay({
      group: "",
      selectedGroup: "预发布",
      count: -2,
    })).toEqual({
      label: ALL_HOSTS_GROUP,
      count: 0,
      selected: false,
      tone: "neutral",
      backgroundTone: "transparent",
    });
  });

  it("sorts visible hosts by favorite, status, and stable original order", () => {
    const hosts = [
      { id: "offline-fav", fav: true, status: "offline" },
      { id: "online-normal", fav: false, status: "online" },
      { id: "busy-fav", fav: true, status: "busy" },
      { id: "online-fav-a", fav: true, status: "online" },
      { id: "online-fav-b", fav: true, status: "online" },
      { id: "unknown-normal", fav: false, status: "unknown" },
    ];

    expect(sortHostsForDisplay(hosts).map(host => host.id)).toEqual([
      "online-fav-a",
      "online-fav-b",
      "busy-fav",
      "offline-fav",
      "online-normal",
      "unknown-normal",
    ]);
  });
});
