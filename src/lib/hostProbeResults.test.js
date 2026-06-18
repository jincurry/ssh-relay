import { describe, expect, it } from "vitest";
import { buildHostProbeSummary, mergeHostProbeResults } from "./hostProbeResults.js";

describe("hostProbeResults", () => {
  it("merges normalized probe status and latency history", () => {
    const hosts = [
      { id: 1, name: "web", status: "busy", lat: [10, "12", "bad", -1, 14, 16, 18, 20, 22] },
      { id: 2, name: "db", status: "online", lat: [30] },
      { id: 3, name: "cache", status: "offline", lat: [5] },
    ];

    expect(mergeHostProbeResults(hosts, [
      { id: 1, status: "ONLINE", latencyMs: 0.2 },
      { id: 2, status: "stale", latencyMs: Number.NaN, error: " timeout " },
    ])).toEqual([
      { id: 1, name: "web", status: "online", lat: [10, 12, 14, 16, 18, 20, 22, 1], probeError: null },
      { id: 2, name: "db", status: "offline", lat: [30], probeError: "timeout" },
      hosts[2],
    ]);
  });

  it("handles unavailable host and result lists", () => {
    expect(mergeHostProbeResults(null, [{ id: 1, status: "online" }])).toEqual([]);
    const hosts = [{ id: 1, name: "web", status: "online", lat: [1] }];
    expect(mergeHostProbeResults(hosts, null)).toEqual(hosts);
  });

  it("summarizes host probe results with normalized status tones", () => {
    expect(buildHostProbeSummary([
      { id: 1, host: "web", status: "online" },
      { id: 2, host: "db", status: "ONLINE" },
    ])).toEqual({
      text: "2/2 在线",
      tone: "success",
      online: 2,
      offline: 0,
      total: 2,
      title: "web · 在线\ndb · 在线",
    });

    expect(buildHostProbeSummary([
      { id: 1, host: "web", status: "online" },
      { id: 2, host: "backup", status: "offline", error: " timeout " },
      { id: 3, status: "stale" },
    ])).toEqual({
      text: "1/3 在线",
      tone: "pending",
      online: 1,
      offline: 2,
      total: 3,
      title: "web · 在线\nbackup · 离线 · timeout\n3 · 离线",
    });

    expect(buildHostProbeSummary([
      { id: 1, host: "backup", status: "offline" },
    ])).toMatchObject({
      text: "0/1 在线",
      tone: "error",
      online: 0,
      offline: 1,
      total: 1,
    });

    expect(buildHostProbeSummary()).toEqual({
      text: "",
      tone: "neutral",
      online: 0,
      offline: 0,
      total: 0,
      title: "",
    });
  });
});
