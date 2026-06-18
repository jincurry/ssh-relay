import { describe, expect, it } from "vitest";
import { toXtermTheme } from "./xtermTheme.js";

describe("xtermTheme", () => {
  it("maps RELAY theme tokens to xterm colors", () => {
    const theme = toXtermTheme({
      bg: "#101820",
      text: "#f4f7fb",
      amber: "#ffb454",
      amberSoft: "rgba(255,180,84,0.18)",
      onAccent: "#201100",
      faint: "#708090",
      red: "#ff5c5c",
      green: "#35d07f",
      blue: "#5aa9ff",
    });

    expect(theme).toMatchObject({
      background: "#101820",
      foreground: "#f4f7fb",
      cursor: "#ffb454",
      cursorAccent: "#201100",
      selectionBackground: "rgba(255,180,84,0.18)",
      black: "#101820",
      brightBlack: "#708090",
      yellow: "#ffb454",
      brightYellow: "#ffb454",
      white: "#f4f7fb",
    });
  });

  it("fills sparse or blank theme tokens before terminal creation", () => {
    const theme = toXtermTheme({
      bg: "  #111111  ",
      text: "",
      amber: "#4CC38A",
      amberSoft: "   ",
      green: null,
    });

    expect(theme.background).toBe("#111111");
    expect(theme.foreground).toBe("#E6EAF0");
    expect(theme.selectionBackground).toBe("#4CC38A22");
    expect(theme.green).toBe("#4CC38A");
    expect(theme.brightWhite).toBe("#FFFFFF");
    expect(Object.values(theme).every(value => typeof value === "string" && value.length > 0)).toBe(true);
  });
});
