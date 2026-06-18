export function reorderChainByDrag(chain, fromIndex, toIndex) {
  const items = Array.isArray(chain) ? chain.slice() : [];
  const from = Number(fromIndex);
  const to = Number(toIndex);

  if (!Number.isInteger(from) || !Number.isInteger(to)) return items;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  if (from === to) return items;

  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  return items;
}

export function removeChainNode(chain, index) {
  const items = Array.isArray(chain) ? chain.slice() : [];
  const target = Number(index);
  if (!Number.isInteger(target) || target < 0 || target >= items.length) return items;
  items.splice(target, 1);
  return items;
}

export function appendUniqueChainNode(chain, nodeName) {
  const items = Array.isArray(chain) ? chain.slice() : [];
  const name = String(nodeName || "").trim();
  if (!name || items.includes(name)) return items;
  return [...items, name];
}

export function buildChainHopActionDisplay({ index = 0, total = 0 } = {}) {
  const normalizedIndex = normalizeIndex(index);
  const normalizedTotal = Math.max(0, Math.trunc(Number(total) || 0));
  const canMoveLeft = normalizedIndex > 0 && normalizedIndex < normalizedTotal;
  const canMoveRight = normalizedIndex >= 0 && normalizedIndex < normalizedTotal - 1;
  return {
    moveLeft: buildMoveAction({
      enabled: canMoveLeft,
      title: canMoveLeft ? "左移跳板" : "已是第一跳",
    }),
    moveRight: buildMoveAction({
      enabled: canMoveRight,
      title: canMoveRight ? "右移跳板" : "已是最后一跳",
    }),
    remove: {
      enabled: normalizedIndex >= 0 && normalizedIndex < normalizedTotal,
      title: "移除跳板",
      opacity: normalizedIndex >= 0 && normalizedIndex < normalizedTotal ? 1 : 0.45,
      cursor: normalizedIndex >= 0 && normalizedIndex < normalizedTotal ? "pointer" : "not-allowed",
    },
  };
}

function buildMoveAction({ enabled, title }) {
  return {
    enabled: Boolean(enabled),
    title,
    opacity: enabled ? 1 : 0.45,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}

function normalizeIndex(index) {
  const value = Number(index);
  return Number.isInteger(value) ? value : -1;
}
