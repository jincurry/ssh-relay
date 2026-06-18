import { describe, expect, it } from "vitest";
import { getGlobalShortcutAction } from "./appShortcuts.js";

describe("appShortcuts", () => {
  it("opens the command palette from the global meta shortcut", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: "k",
      target: null,
    }, { page: "hosts" })).toBe("palette");
  });

  it("opens the snippets library outside SSH sessions", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      target: null,
    }, { page: "hosts" })).toBe("snippets");

    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      target: { tagName: "INPUT" },
    }, { page: "config" })).toBe("snippets");
  });

  it("leaves the session snippet shortcut for the session drawer", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      target: null,
    }, { page: "session" })).toBe("");
  });

  it("ignores repeats and unrelated shortcuts", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      repeat: true,
      target: null,
    }, { page: "hosts" })).toBe("");

    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: "x",
      target: null,
    }, { page: "hosts" })).toBe("");
  });
});
