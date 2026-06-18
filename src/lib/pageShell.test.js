import { describe, expect, it } from "vitest";
import { buildPageShellDisplay } from "./pageShell.js";

describe("pageShell", () => {
  it("builds shared page shell display metadata", () => {
    expect(buildPageShellDisplay()).toEqual({
      backLabel: "← 返回",
    });

    expect(buildPageShellDisplay({ backLabel: " Back " })).toEqual({
      backLabel: "Back",
    });

    expect(buildPageShellDisplay({ backLabel: "" })).toEqual({
      backLabel: "← 返回",
    });
  });
});
