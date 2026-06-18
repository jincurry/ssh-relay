export const ALL_HOSTS_GROUP = "全部主机";

export function normalizeHostGroupName(value) {
  return String(value ?? "").trim();
}

export function getHostGroupOptions(hosts, defaultGroups = []) {
  const groups = [ALL_HOSTS_GROUP];
  const seen = new Set(groups);

  const append = (group) => {
    const name = normalizeHostGroupName(group);
    if (!name || seen.has(name)) return;
    seen.add(name);
    groups.push(name);
  };

  for (const group of defaultGroups || []) append(group);
  for (const host of hosts || []) append(host?.group);

  return groups;
}

export function filterHostsByGroup(hosts, selectedGroup = ALL_HOSTS_GROUP) {
  const items = hosts || [];
  const group = normalizeHostGroupName(selectedGroup) || ALL_HOSTS_GROUP;
  if (group === ALL_HOSTS_GROUP) return items;
  return items.filter(host => normalizeHostGroupName(host?.group) === group);
}

export function sortHostsForDisplay(hosts) {
  const statusRank = { online: 0, busy: 1, offline: 2 };
  return (hosts || [])
    .map((host, index) => ({ host, index }))
    .sort((left, right) => {
      const favoriteDiff = Number(Boolean(right.host?.fav)) - Number(Boolean(left.host?.fav));
      if (favoriteDiff) return favoriteDiff;
      const leftStatus = statusRank[left.host?.status] ?? 3;
      const rightStatus = statusRank[right.host?.status] ?? 3;
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      return left.index - right.index;
    })
    .map(item => item.host);
}

export function countHostsInGroup(hosts, selectedGroup = ALL_HOSTS_GROUP) {
  return filterHostsByGroup(hosts, selectedGroup).length;
}

export function buildHostGroupNavItemDisplay({ group = ALL_HOSTS_GROUP, selectedGroup = ALL_HOSTS_GROUP, count = 0 } = {}) {
  const label = normalizeHostGroupName(group) || ALL_HOSTS_GROUP;
  const selected = label === (normalizeHostGroupName(selectedGroup) || ALL_HOSTS_GROUP);
  return {
    label,
    count: normalizeGroupCount(count),
    selected,
    tone: selected ? "pending" : "neutral",
    backgroundTone: selected ? "selected" : "transparent",
  };
}

export function resolveSelectedHostGroup(selectedGroup, groupOptions) {
  const group = normalizeHostGroupName(selectedGroup) || ALL_HOSTS_GROUP;
  return (groupOptions || []).includes(group) ? group : ALL_HOSTS_GROUP;
}

function normalizeGroupCount(count) {
  const next = Number(count);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.trunc(next));
}
