import { describe, expect, it } from "vitest";
import { appendMonitorHistory, buildMonitorPanelDisplay, DEFAULT_MONITOR_SAMPLE, normalizeMonitorSample } from "./monitorDisplay.js";

describe("monitorDisplay", () => {
  it("normalizes complete monitor samples for UI meters", () => {
    expect(normalizeMonitorSample({
      cpu: 42.4,
      memory: "67",
      disk: 12,
      networkDownMbps: "8.5",
      load: " 0.91 ",
      uptime: "2d 3h",
      os: "Ubuntu",
      processes: "218",
    })).toEqual({
      cpu: 42,
      memory: 67,
      disk: 12,
      networkDownMbps: 8.5,
      load: "0.91",
      uptime: "2d 3h",
      os: "Ubuntu",
      processes: 218,
    });
  });

  it("clamps invalid values and falls back to the previous sample", () => {
    const fallback = {
      ...DEFAULT_MONITOR_SAMPLE,
      cpu: 55,
      memory: 44,
      disk: 33,
      networkDownMbps: 2.5,
      processes: 99,
    };

    expect(normalizeMonitorSample({
      cpu: 150,
      memory: Number.NaN,
      disk: -10,
      networkDownMbps: -1,
      load: "",
      uptime: null,
      os: undefined,
      processes: Number.NaN,
    }, fallback)).toMatchObject({
      cpu: 100,
      memory: 44,
      disk: 0,
      networkDownMbps: 0,
      load: fallback.load,
      uptime: fallback.uptime,
      os: fallback.os,
      processes: 99,
    });
  });

  it("keeps monitor histories bounded and numeric", () => {
    const history = Array.from({ length: 25 }, (_, index) => index);
    const next = appendMonitorHistory(history, "12.5", 20);

    expect(next).toHaveLength(20);
    expect(next.at(0)).toBe(6);
    expect(next.at(-1)).toBe(12.5);
    expect(appendMonitorHistory(null, Number.NaN)).toEqual([0]);
  });

  it("builds monitor panel display metadata from samples and histories", () => {
    const display = buildMonitorPanelDisplay({
      sample: {
        cpu: 91,
        memory: 68,
        disk: 77,
        networkDownMbps: 4,
        load: " 1.20 ",
        uptime: "8d 4h",
        os: "Ubuntu 24.04",
        processes: 245,
      },
      cpuHistory: [55, 72, 91],
      networkHistory: [1, "2.25", 3],
    });

    expect(display.panelTitle).toBe("实时监控");
    expect(display.meters).toEqual([
      { key: "cpu", label: "CPU", value: 91, suffix: "%", colorKey: "red" },
      { key: "memory", label: "内存", value: 68, suffix: "%", colorKey: "blue" },
      { key: "disk", label: "磁盘 /", value: 77, suffix: "%", colorKey: "amber" },
    ]);
    expect(display.network).toMatchObject({
      label: "网络",
      rateLabel: "↓3.0 MB/s",
      data: [1, 2.25, 3],
      colorKey: "green",
    });
    expect(display.cpuTrend).toMatchObject({
      label: "CPU 趋势",
      data: [55, 72, 91],
      colorKey: "amber",
    });
    expect(display.footerLine).toBe("负载 1.20 · 进程 245");
    expect(display.footerDetail).toBe("运行 8d 4h · Ubuntu 24.04");
  });

  it("builds monitor panel display fallbacks for missing histories", () => {
    const display = buildMonitorPanelDisplay({
      sample: {
        ...DEFAULT_MONITOR_SAMPLE,
        cpu: 22,
        networkDownMbps: 6.5,
      },
      cpuHistory: [],
      networkHistory: ["bad"],
    });

    expect(display.meters[0]).toMatchObject({ value: 22, colorKey: "green" });
    expect(display.cpuTrend.data).toEqual([22]);
    expect(display.network.data).toEqual([6.5]);
    expect(display.network.rateLabel).toBe("↓6.5 MB/s");
  });
});
