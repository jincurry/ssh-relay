import { describe, expect, it } from "vitest";
import { formatMetaShortcut, getShortcutModifierLabel, isEditableShortcutTarget, isMetaShortcutEvent, matchesShortcutKey, matchesShortcutModifier } from "./shortcuts.js";

describe("shortcuts", () => {
  it("uses the Command symbol for Apple platforms", () => {
    expect(getShortcutModifierLabel("MacIntel")).toBe("⌘");
    expect(getShortcutModifierLabel("iPad")).toBe("⌘");
    expect(formatMetaShortcut("K", "MacIntel")).toBe("⌘K");
  });

  it("uses Ctrl labels for Linux and Windows platforms", () => {
    expect(getShortcutModifierLabel("Linux x86_64")).toBe("Ctrl");
    expect(getShortcutModifierLabel("Win32")).toBe("Ctrl");
    expect(formatMetaShortcut("F", "Linux x86_64")).toBe("Ctrl+F");
    expect(formatMetaShortcut(";", "Win32")).toBe("Ctrl+;");
  });

  it("detects editable shortcut targets", () => {
    const input = { nodeType: 1, tagName: "INPUT" };
    const textBox = { nodeType: 1, tagName: "DIV", isContentEditable: false, getAttribute: name => name === "role" ? "textbox" : "" };
    const button = { nodeType: 1, tagName: "BUTTON", isContentEditable: false, getAttribute: () => "" };

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(textBox)).toBe(true);
    expect(isEditableShortcutTarget(button)).toBe(false);
  });

  it("matches meta shortcuts while filtering repeats and modified chords", () => {
    expect(isMetaShortcutEvent({ ctrlKey: true, key: "k", target: null }, "K", { platform: "Linux x86_64" })).toBe(true);
    expect(isMetaShortcutEvent({ metaKey: true, key: "F", target: null }, "f", { platform: "MacIntel" })).toBe(true);
    expect(isMetaShortcutEvent({ ctrlKey: true, key: "k", repeat: true, target: null }, "k", { platform: "Linux x86_64" })).toBe(false);
    expect(isMetaShortcutEvent({ ctrlKey: true, key: "k", defaultPrevented: true, target: null }, "k", { platform: "Linux x86_64" })).toBe(false);
    expect(isMetaShortcutEvent({ ctrlKey: true, shiftKey: true, key: "k", target: null }, "k", { platform: "Linux x86_64" })).toBe(false);
    expect(isMetaShortcutEvent({ ctrlKey: true, altKey: true, key: "k", target: null }, "k", { platform: "Linux x86_64" })).toBe(false);
    expect(isMetaShortcutEvent({ ctrlKey: true, isComposing: true, key: "k", target: null }, "k", { platform: "Linux x86_64" })).toBe(false);
  });

  it("uses the platform-specific shortcut modifier only", () => {
    expect(matchesShortcutModifier({ metaKey: true }, "MacIntel")).toBe(true);
    expect(matchesShortcutModifier({ ctrlKey: true }, "MacIntel")).toBe(false);
    expect(matchesShortcutModifier({ metaKey: true, ctrlKey: true }, "MacIntel")).toBe(false);
    expect(matchesShortcutModifier({ ctrlKey: true }, "Linux x86_64")).toBe(true);
    expect(matchesShortcutModifier({ metaKey: true }, "Win32")).toBe(false);
    expect(matchesShortcutModifier({ metaKey: true, ctrlKey: true }, "Win32")).toBe(false);
  });

  it("falls back to keyboard codes for layout-sensitive shortcuts", () => {
    expect(matchesShortcutKey({ key: "κ", code: "KeyK" }, "k")).toBe(true);
    expect(matchesShortcutKey({ key: "；", code: "Semicolon" }, ";")).toBe(true);
    expect(matchesShortcutKey({ key: "7", code: "Digit7" }, "7")).toBe(true);
    expect(matchesShortcutKey({ key: "x", code: "KeyX" }, "k")).toBe(false);
    expect(isMetaShortcutEvent({ ctrlKey: true, key: "；", code: "Semicolon", target: null }, ";", { platform: "Linux x86_64" })).toBe(true);
  });

  it("blocks editable targets unless explicitly allowed", () => {
    const target = { nodeType: 1, tagName: "TEXTAREA", isContentEditable: false, getAttribute: () => "" };
    const event = { ctrlKey: true, key: "f", target };

    expect(isMetaShortcutEvent(event, "f", { platform: "Linux x86_64" })).toBe(false);
    expect(isMetaShortcutEvent(event, "f", { allowEditable: true, platform: "Linux x86_64" })).toBe(true);
  });
});
