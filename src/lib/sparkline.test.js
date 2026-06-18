import { describe, expect, it } from "vitest";
import { buildSparklinePoints, getLatestSparklineValue, normalizeSparklineData } from "./sparkline.js";

describe("sparkline", () => {
  it("normalizes numeric sparkline samples and drops invalid values", () => {
    expect(normalizeSparklineData([12, "14", null, Number.NaN, "bad", 0])).toEqual([12, 14, 0]);
    expect(normalizeSparklineData(null)).toEqual([]);
  });

  it("returns the latest finite sample without hiding zero", () => {
    expect(getLatestSparklineValue([12, 0])).toBe(0);
    expect(getLatestSparklineValue([12, "bad", 5])).toBe(5);
    expect(getLatestSparklineValue([])).toBeNull();
  });

  it("builds stable points for empty, single-point and flat sparklines", () => {
    expect(buildSparklinePoints([], { width: 64, height: 18 })).toBe("");
    expect(buildSparklinePoints([42], { width: 64, height: 18 })).toBe("0,9 64,9");
    expect(buildSparklinePoints([7, 7, 7], { width: 60, height: 20 })).toBe("0,10 30,10 60,10");
  });

  it("builds scaled points without NaN coordinates", () => {
    const points = buildSparklinePoints([10, 20, 15], { width: 60, height: 20 });

    expect(points).toBe("0,18 30,2 60,10");
    expect(points).not.toContain("NaN");
  });
});
