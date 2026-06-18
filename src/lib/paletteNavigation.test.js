import { describe, expect, it } from "vitest";
import { clampPaletteIndex, getPaletteItemAt, movePaletteSelection } from "./paletteNavigation.js";

describe("paletteNavigation", () => {
  it("clamps selected indexes to the available result range", () => {
    expect(clampPaletteIndex(-3, 4)).toBe(0);
    expect(clampPaletteIndex(2, 4)).toBe(2);
    expect(clampPaletteIndex(9, 4)).toBe(3);
    expect(clampPaletteIndex(2, 0)).toBe(0);
  });

  it("wraps arrow navigation across result boundaries", () => {
    expect(movePaletteSelection(0, 3, 1)).toBe(1);
    expect(movePaletteSelection(2, 3, 1)).toBe(0);
    expect(movePaletteSelection(0, 3, -1)).toBe(2);
    expect(movePaletteSelection(4, 3, 1)).toBe(0);
  });

  it("returns the selected item after clamping the index", () => {
    const items = [{ id: "a" }, { id: "b" }];
    expect(getPaletteItemAt(items, 1)).toEqual({ id: "b" });
    expect(getPaletteItemAt(items, 5)).toEqual({ id: "b" });
    expect(getPaletteItemAt([], 0)).toBeNull();
  });
});
