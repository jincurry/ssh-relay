export function clampPaletteIndex(index, itemCount) {
  const count = Number(itemCount) || 0;
  if (count <= 0) return 0;
  const next = Number(index) || 0;
  return Math.max(0, Math.min(next, count - 1));
}

export function movePaletteSelection(index, itemCount, delta) {
  const count = Number(itemCount) || 0;
  if (count <= 0) return 0;
  const next = clampPaletteIndex(index, count) + delta;
  if (next < 0) return count - 1;
  if (next >= count) return 0;
  return next;
}

export function getPaletteItemAt(items, index) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[clampPaletteIndex(index, items.length)] || null;
}
