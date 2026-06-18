const FALLBACK_THEME = {
  bg: "#0C0F14",
  text: "#E6EAF0",
  amber: "#E8A33D",
  amberSoft: "#E8A33D22",
  onAccent: "#1A1206",
  faint: "#5A6374",
  red: "#E5534B",
  green: "#4CC38A",
  blue: "#5B9DD9",
};

export function toXtermTheme(theme) {
  const bg = colorToken(theme, "bg");
  const text = colorToken(theme, "text");
  const accent = colorToken(theme, "amber");
  const selection = colorToken(theme, "amberSoft", `${accent}22`);
  const onAccent = colorToken(theme, "onAccent");
  const faint = colorToken(theme, "faint");
  const red = colorToken(theme, "red");
  const green = colorToken(theme, "green");
  const blue = colorToken(theme, "blue");

  return {
    background: bg,
    foreground: text,
    cursor: accent,
    cursorAccent: onAccent,
    selectionBackground: selection,
    black: bg,
    brightBlack: faint,
    red,
    brightRed: red,
    green,
    brightGreen: green,
    yellow: accent,
    brightYellow: accent,
    blue,
    brightBlue: blue,
    magenta: "#C586D9",
    brightMagenta: "#C586D9",
    cyan: "#7FD8E8",
    brightCyan: "#7FD8E8",
    white: text,
    brightWhite: "#FFFFFF"
  };
}

function colorToken(theme, key, fallback = FALLBACK_THEME[key]) {
  const value = String(theme?.[key] ?? "").trim();
  if (value) return value;
  return String(fallback || FALLBACK_THEME[key] || "").trim() || FALLBACK_THEME[key];
}
