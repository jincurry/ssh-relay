export function getShortcutModifierLabel(platform = currentPlatform()) {
  return isApplePlatform(platform) ? "⌘" : "Ctrl";
}

export function formatMetaShortcut(key, platform = currentPlatform()) {
  const modifier = getShortcutModifierLabel(platform);
  return modifier === "⌘" ? `${modifier}${key}` : `${modifier}+${key}`;
}

export function isMetaShortcutEvent(event, key, { allowEditable = false, platform = currentPlatform() } = {}) {
  if (!event || event.defaultPrevented || event.repeat || event.isComposing) return false;
  if (!matchesShortcutModifier(event, platform) || event.altKey || event.shiftKey) return false;
  if (!matchesShortcutKey(event, key)) return false;
  if (!allowEditable && isEditableShortcutTarget(event.target)) return false;
  return true;
}

export function matchesShortcutModifier(event, platform = currentPlatform()) {
  const expectsCommand = isApplePlatform(platform);
  return expectsCommand
    ? Boolean(event?.metaKey) && !event?.ctrlKey
    : Boolean(event?.ctrlKey) && !event?.metaKey;
}

export function matchesShortcutKey(event, key) {
  const expected = String(key || "").toLowerCase();
  const actual = String(event?.key || "").toLowerCase();
  if (actual && actual === expected) return true;

  const code = String(event?.code || "").toLowerCase();
  if (!code) return false;
  if (/^[a-z]$/.test(expected)) return code === `key${expected}`;
  if (/^[0-9]$/.test(expected)) return code === `digit${expected}`;

  const namedCodes = {
    ";": "semicolon",
    ",": "comma",
    ".": "period",
    "/": "slash",
    "\\": "backslash",
    "'": "quote",
    "`": "backquote",
    "-": "minus",
    "=": "equal",
    "[": "bracketleft",
    "]": "bracketright",
  };
  return code === namedCodes[expected];
}

export function isEditableShortcutTarget(target) {
  const element = target?.nodeType === 1 ? target : target?.parentElement;
  if (!element) return false;
  const tag = String(element.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return true;
  if (element.isContentEditable) return true;
  return String(element.getAttribute?.("role") || "").toLowerCase() === "textbox";
}

function currentPlatform() {
  return globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || "";
}

function isApplePlatform(platform) {
  return /mac|iphone|ipad|ipod/i.test(String(platform || ""));
}
