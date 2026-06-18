export function buildSessionTrzszPreviewPlan(command, {
  uploadName = "dist.tar.gz",
  uploadSize = 12 * 1024 * 1024,
  downloadSize = 240 * 1024 * 1024,
} = {}) {
  const text = String(command || "").trim();
  if (!text) return null;

  const [program, ...args] = tokenizeShellLike(text);
  const name = String(program || "").toLowerCase();
  if (name === "trz") {
    return {
      direction: "up",
      commandText: text,
      fileName: String(uploadName || "").trim() || "dist.tar.gz",
      size: normalizeSize(uploadSize, 12 * 1024 * 1024),
      splitMessage: "拆分会话 trz 上传等待中",
    };
  }

  if (name !== "tsz") return null;
  const fileName = chooseTszPreviewFileName(args);
  if (!fileName) return null;
  return {
    direction: "down",
    commandText: text,
    fileName,
    size: normalizeSize(downloadSize, 240 * 1024 * 1024),
    splitMessage: "拆分会话 tsz 下载等待中",
  };
}

function chooseTszPreviewFileName(args) {
  const candidates = args
    .map(arg => String(arg || "").trim())
    .filter(Boolean)
    .filter(arg => arg !== "--")
    .filter(arg => !arg.startsWith("-"));
  return candidates[candidates.length - 1] || "";
}

function tokenizeShellLike(text) {
  const tokens = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const ch of String(text || "")) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      else current += ch;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function normalizeSize(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}
