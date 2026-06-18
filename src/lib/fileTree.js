export function listTreeEntries(tree, path = []) {
  const node = getDirNode(tree, path);
  return Object.entries(node).sort(([nameA, metaA], [nameB, metaB]) => {
    const rankA = metaA.type === "dir" ? 0 : 1;
    const rankB = metaB.type === "dir" ? 0 : 1;
    return rankA - rankB || nameA.localeCompare(nameB);
  });
}

export function getTreeEntry(tree, path = [], name) {
  return getDirNode(tree, path)[name] || null;
}

export function createTreeDir(tree, path = [], name, mtime = "现在") {
  const entryName = normalizeTreeEntryName(name);
  return updateTree(tree, path, dir => {
    if (dir[entryName]) throw new Error(`${entryName} 已存在`);
    dir[entryName] = { type: "dir", children: {}, mtime };
  });
}

export function writeTreeText(tree, path = [], name, content, mtime = "现在") {
  const entryName = normalizeTreeEntryName(name);
  return updateTree(tree, path, dir => {
    const existing = dir[entryName];
    if (existing && existing.type !== "file") throw new Error(`${entryName} 不是文件`);
    dir[entryName] = {
      type: "file",
      size: new TextEncoder().encode(content).length,
      mtime,
      content,
    };
  });
}

export function readTreeText(tree, path = [], name, fallback = "") {
  const entry = getTreeEntry(tree, path, name);
  if (!entry || entry.type !== "file") throw new Error(`${name} 不是文件`);
  return entry.content ?? fallback;
}

export function copyTreeFile(tree, path = [], name, size, mtime = "现在") {
  const entryName = normalizeTreeEntryName(name);
  return updateTree(tree, path, dir => {
    dir[entryName] = {
      type: "file",
      size,
      mtime,
    };
  });
}

export function copyTreeEntry(tree, path = [], name, entry, mtime = "现在") {
  const entryName = normalizeTreeEntryName(name);
  if (!entry || !["file", "dir"].includes(entry.type)) {
    throw new Error("条目必须是文件或目录");
  }

  return updateTree(tree, path, dir => {
    if (dir[entryName]) throw new Error(`${entryName} 已存在`);
    dir[entryName] = cloneEntry(entry, mtime);
  });
}

export function treeEntrySize(entry) {
  if (!entry) return 0;
  if (entry.type === "file") return Number(entry.size) || 0;
  if (entry.type === "dir") {
    return Object.values(entry.children || {}).reduce((sum, child) => sum + treeEntrySize(child), 0);
  }
  return 0;
}

export function isEditableTextFileName(name) {
  const value = String(name || "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (/^\.(?:env(?:\..*)?|bashrc|zshrc|profile|bash_profile|gitconfig|npmrc|yarnrc)$/.test(lower)) {
    return true;
  }
  return /\.(conf|md|html|env|sh|css|js|log|txt|ya?ml|json)$/.test(lower);
}

function updateTree(tree, path, mutate) {
  const next = cloneTree(tree);
  mutate(getDirNode(next, path));
  return next;
}

function getDirNode(tree, path) {
  let node = tree;
  for (const segment of path) {
    const next = node[segment];
    if (!next || next.type !== "dir") throw new Error(`${segment} 不是目录`);
    node = next.children;
  }
  return node;
}

export function normalizeTreeEntryName(name) {
  const value = String(name || "").trim();
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new Error("名称必须是单个路径段");
  }
  return value;
}

function cloneTree(tree) {
  return JSON.parse(JSON.stringify(tree));
}

function cloneEntry(entry, mtime) {
  if (entry.type === "file") {
    return {
      ...JSON.parse(JSON.stringify(entry)),
      mtime,
    };
  }
  return {
    type: "dir",
    children: Object.fromEntries(
      Object.entries(entry.children || {}).map(([name, child]) => [name, cloneEntry(child, child.mtime || mtime)])
    ),
    mtime,
  };
}
