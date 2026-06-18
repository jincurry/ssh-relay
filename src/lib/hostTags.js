export const HOST_CARD_TAG_LIMIT = 6;

export function normalizeHostTags(tags) {
  const values = Array.isArray(tags)
    ? tags
    : String(tags || "").split(",");
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const tag = String(value || "").trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }

  return out;
}

export function getVisibleHostTags(tags, limit = HOST_CARD_TAG_LIMIT) {
  const normalized = normalizeHostTags(tags);
  const count = Math.max(0, Number(limit) || 0);
  return {
    visible: normalized.slice(0, count),
    hiddenCount: Math.max(0, normalized.length - count),
  };
}
