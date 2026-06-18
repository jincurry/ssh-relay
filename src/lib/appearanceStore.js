export const APPEARANCE_STORAGE_KEY = "relay.appearance.v1";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function loadAppearance(storage, defaults) {
  if (!storage) return normalizeAppearance(defaults, defaults);

  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return normalizeAppearance(defaults, defaults);
    return normalizeAppearance({ ...defaults, ...JSON.parse(raw) }, defaults);
  } catch {
    return normalizeAppearance(defaults, defaults);
  }
}

export function saveAppearance(storage, appearance, defaults = null) {
  if (!storage) return false;
  const next = defaults ? normalizeAppearance({ ...defaults, ...appearance }, defaults) : appearance;
  storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
  return true;
}

export function resetAppearance(defaults) {
  return normalizeAppearance(defaults, defaults);
}

export function buildAppearancePageDisplay() {
  return {
    pageTitle: "主题与外观",
    syncHint: "⟳ 可导入/导出配置快照",
    resetText: "恢复默认",
    themeSectionTitle: "主题方案",
    themeSectionSubtitle: "点击即时生效,可通过配置快照同步到其他设备。终端配色与界面联动。",
    accentSectionTitle: "强调色",
    accentSectionSubtitle: "独立于主题方案,影响按钮、链路终点与光标。",
    typographySectionTitle: "终端排版",
    typographySectionSubtitle: "字号与字体即时预览,等宽字体支持连字。",
  };
}

export function buildThemeOptionDisplay({ name = "", theme = {}, currentThemeName = "" } = {}) {
  const label = String(name || "").trim() || "未命名主题";
  const selected = label === currentThemeName;
  return {
    label,
    description: String(theme?.desc || "").trim(),
    selected,
    badgeText: selected ? "● 使用中" : "",
    borderTone: selected ? "pending" : "neutral",
  };
}

export function buildAccentOptionDisplay({ color = "", currentAccent = "" } = {}) {
  const value = String(color || "").trim();
  const selected = value.toLowerCase() === String(currentAccent || "").trim().toLowerCase();
  return {
    value,
    selected,
    title: value,
    borderTone: selected ? "selected" : "transparent",
  };
}

export function buildTypographyDisplay(appearance = {}) {
  const termSize = Number.isFinite(Number(appearance?.termSize)) ? Number(appearance.termSize) : 0;
  const ligatures = Boolean(appearance?.termLigatures);
  return {
    sizeLabel: `终端字号 · ${termSize}px`,
    ligatureLabel: "等宽连字",
    previewText: 'echo "字号实时预览 => != === 0x2A"',
    ligatureCss: ligatures ? "contextual common-ligatures" : "none",
  };
}

export function normalizeAppearance(input, defaults) {
  const themeName = defaults.themeNames.includes(input?.themeName) ? input.themeName : defaults.themeName;
  const accent = HEX_COLOR.test(input?.accent || "") ? input.accent : defaults.accent;
  const termSize = clampInt(input?.termSize, defaults.minTermSize, defaults.maxTermSize, defaults.termSize);
  const termLigatures = typeof input?.termLigatures === "boolean" ? input.termLigatures : Boolean(defaults.termLigatures);

  return {
    themeName,
    accent,
    termSize,
    termLigatures,
  };
}

function clampInt(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isInteger(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}
