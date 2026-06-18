import { describe, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY, buildAccentOptionDisplay, buildAppearancePageDisplay, buildThemeOptionDisplay, buildTypographyDisplay, loadAppearance, normalizeAppearance, resetAppearance, saveAppearance } from "./appearanceStore.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, value)),
  };
}

const defaults = {
  themeName: "琥珀夜航",
  themeNames: ["琥珀夜航", "极昼"],
  accent: "#E8A33D",
  termSize: 13,
  termLigatures: true,
  minTermSize: 11,
  maxTermSize: 18,
};

describe("appearanceStore", () => {
  it("loads defaults when storage is unavailable or corrupt", () => {
    expect(loadAppearance(null, defaults)).toEqual({
      themeName: "琥珀夜航",
      accent: "#E8A33D",
      termSize: 13,
      termLigatures: true,
    });

    const storage = memoryStorage();
    storage.setItem(APPEARANCE_STORAGE_KEY, "{bad");
    expect(loadAppearance(storage, defaults)).toEqual(expect.objectContaining({ themeName: "琥珀夜航" }));
  });

  it("normalizes invalid values", () => {
    expect(normalizeAppearance({
      themeName: "missing",
      accent: "red",
      termSize: 99,
      termLigatures: false,
    }, defaults)).toEqual({
      themeName: "琥珀夜航",
      accent: "#E8A33D",
      termSize: 18,
      termLigatures: false,
    });
  });

  it("fills term ligature defaults for older appearance records", () => {
    expect(normalizeAppearance({
      themeName: "极昼",
      accent: "#4CC38A",
      termSize: 16,
    }, defaults)).toEqual({
      themeName: "极昼",
      accent: "#4CC38A",
      termSize: 16,
      termLigatures: true,
    });
  });

  it("saves appearance settings", () => {
    const storage = memoryStorage();
    const appearance = { themeName: "极昼", accent: "#4CC38A", termSize: 16, termLigatures: false };
    expect(saveAppearance(storage, appearance)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  });

  it("normalizes appearance settings before saving when defaults are provided", () => {
    const storage = memoryStorage();
    expect(saveAppearance(storage, {
      themeName: "missing",
      accent: "red",
      termSize: 99,
      termLigatures: "yes",
    }, defaults)).toBe(true);

    expect(storage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, JSON.stringify({
      themeName: "琥珀夜航",
      accent: "#E8A33D",
      termSize: 18,
      termLigatures: true,
    }));
  });

  it("resets appearance to normalized defaults", () => {
    expect(resetAppearance(defaults)).toEqual({
      themeName: "琥珀夜航",
      accent: "#E8A33D",
      termSize: 13,
      termLigatures: true,
    });
  });

  it("builds appearance page chrome display metadata", () => {
    expect(buildAppearancePageDisplay()).toEqual({
      pageTitle: "主题与外观",
      syncHint: "⟳ 可导入/导出配置快照",
      resetText: "恢复默认",
      themeSectionTitle: "主题方案",
      themeSectionSubtitle: "点击即时生效,可通过配置快照同步到其他设备。终端配色与界面联动。",
      accentSectionTitle: "强调色",
      accentSectionSubtitle: "独立于主题方案,影响按钮、链路终点与光标。",
      typographySectionTitle: "终端排版",
      typographySectionSubtitle: "字号与字体即时预览,等宽字体支持连字。",
    });
  });

  it("builds theme option display metadata", () => {
    expect(buildThemeOptionDisplay({
      name: "琥珀夜航",
      theme: { desc: " 默认主题 " },
      currentThemeName: "琥珀夜航",
    })).toEqual({
      label: "琥珀夜航",
      description: "默认主题",
      selected: true,
      badgeText: "● 使用中",
      borderTone: "pending",
    });

    expect(buildThemeOptionDisplay({
      name: "",
      theme: {},
      currentThemeName: "极昼",
    })).toEqual({
      label: "未命名主题",
      description: "",
      selected: false,
      badgeText: "",
      borderTone: "neutral",
    });
  });

  it("builds accent option display metadata", () => {
    expect(buildAccentOptionDisplay({ color: " #4CC38A ", currentAccent: "#4cc38a" })).toEqual({
      value: "#4CC38A",
      selected: true,
      title: "#4CC38A",
      borderTone: "selected",
    });

    expect(buildAccentOptionDisplay({ color: "#E5534B", currentAccent: "#4CC38A" })).toMatchObject({
      value: "#E5534B",
      selected: false,
      borderTone: "transparent",
    });
  });

  it("builds typography display metadata", () => {
    expect(buildTypographyDisplay({ termSize: 15, termLigatures: true })).toEqual({
      sizeLabel: "终端字号 · 15px",
      ligatureLabel: "等宽连字",
      previewText: 'echo "字号实时预览 => != === 0x2A"',
      ligatureCss: "contextual common-ligatures",
    });

    expect(buildTypographyDisplay({ termSize: "bad", termLigatures: false })).toMatchObject({
      sizeLabel: "终端字号 · 0px",
      ligatureCss: "none",
    });
  });
});
