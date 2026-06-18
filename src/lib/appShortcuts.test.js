import { describe, expect, it } from "vitest";
import { getGlobalShortcutAction } from "./appShortcuts.js";

describe("appShortcuts", () => {
  it("opens the command palette from the global meta shortcut", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: "k",
      target: null,
    }, { page: "hosts", platform: "Linux x86_64" })).toBe("palette");

    expect(getGlobalShortcutAction({
      metaKey: true,
      key: "k",
      target: null,
    }, { page: "hosts", platform: "MacIntel" })).toBe("palette");
  });

  it("opens the snippets library outside SSH sessions", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      target: null,
    }, { page: "hosts", platform: "Linux x86_64" })).toBe("snippets");

    expect(getGlobalShortcutAction({
      metaKey: true,
      key: ";",
      code: "Semicolon",
      target: null,
    }, { page: "hosts", platform: "MacIntel" })).toBe("snippets");

    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      target: { tagName: "INPUT" },
    }, { page: "config", platform: "Linux x86_64" })).toBe("snippets");
  });

  it("leaves the session snippet shortcut for the session drawer", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      target: null,
    }, { page: "session", platform: "Linux x86_64" })).toBe("");
  });

  it("ignores repeats and unrelated shortcuts", () => {
    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: ";",
      code: "Semicolon",
      repeat: true,
      target: null,
    }, { page: "hosts", platform: "Linux x86_64" })).toBe("");

    expect(getGlobalShortcutAction({
      ctrlKey: true,
      key: "x",
      target: null,
    }, { page: "hosts", platform: "Linux x86_64" })).toBe("");
  });
});
