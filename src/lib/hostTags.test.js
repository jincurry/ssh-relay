import { describe, expect, it } from "vitest";
import { getVisibleHostTags, normalizeHostTags } from "./hostTags.js";

describe("hostTags", () => {
  it("normalizes host tags by trimming blanks and preserving first unique values", () => {
    expect(normalizeHostTags([" prod ", "nginx", "prod", "", null, "华东"]))
      .toEqual(["prod", "nginx", "华东"]);
    expect(normalizeHostTags("prod, nginx, prod, , 华东"))
      .toEqual(["prod", "nginx", "华东"]);
  });

  it("returns bounded visible tags with a hidden count for host cards", () => {
    expect(getVisibleHostTags(["a", "b", "c", "d"], 2)).toEqual({
      visible: ["a", "b"],
      hiddenCount: 2,
    });
    expect(getVisibleHostTags(["a", "a", "b"], 6)).toEqual({
      visible: ["a", "b"],
      hiddenCount: 0,
    });
  });
});
