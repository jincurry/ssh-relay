export function normalizeSparklineData(data) {
  return (Array.isArray(data) ? data : [])
    .filter(value => value !== null && value !== undefined && String(value).trim() !== "")
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));
}

export function getLatestSparklineValue(data) {
  const values = normalizeSparklineData(data);
  return values.length ? values.at(-1) : null;
}

export function buildSparklinePoints(data, { width = 64, height = 18 } = {}) {
  const values = normalizeSparklineData(data);
  if (!values.length) return "";

  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (values.length === 1 || range === 0) {
    const y = Math.round(h / 2);
    return values.length === 1
      ? `0,${y} ${w},${y}`
      : values.map((_, index) => `${(index / (values.length - 1)) * w},${y}`).join(" ");
  }

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * w;
      const y = h - ((value - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
}
