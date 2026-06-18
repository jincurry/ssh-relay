import { detectDangerousCommand } from "./dangerCommands.js";

export const SNIPPET_STORAGE_KEY = "relay.snippets.v1";

export const DEFAULT_SNIPPETS = [
  { id: "disk-usage", name: "磁盘占用", cmd: "df -h", tag: "巡检", danger: false },
  { id: "memory-summary", name: "内存概况", cmd: "free -m", tag: "巡检", danger: false },
  { id: "listening-ports", name: "端口监听", cmd: "ss -tlnp", tag: "网络", danger: false },
  { id: "restart-nginx", name: "重启 Nginx", cmd: "sudo systemctl restart nginx", tag: "服务", danger: true },
  { id: "tail-syslog", name: "实时系统日志", cmd: "tail -f /var/log/syslog", tag: "日志", danger: false },
  { id: "docker-list", name: "容器列表", cmd: "docker ps -a", tag: "容器", danger: false },
];

export function normalizeSnippet(input) {
  const name = String(input?.name || "").trim();
  const cmd = String(input?.cmd || "").trim();
  const tag = String(input?.tag || "自定义").trim() || "自定义";

  if (!name) throw new Error("片段名称不能为空");
  if (!cmd) throw new Error("片段命令不能为空");

  const id = String(input?.id || "").trim() || makeSnippetId(name, cmd);

  return {
    id,
    name,
    cmd,
    tag,
    danger: Boolean(input?.danger) || detectDangerousCommand(cmd).danger,
  };
}

export function normalizeSnippetList(snippets) {
  if (!Array.isArray(snippets)) return [];
  const seenIds = new Set();
  const seenNames = new Set();
  return snippets.reduce((items, snippet) => {
    try {
      const normalized = normalizeSnippet(snippet);
      const idKey = normalized.id.toLowerCase();
      const nameKey = normalized.name.toLowerCase();
      if (seenIds.has(idKey) || seenNames.has(nameKey)) return items;
      seenIds.add(idKey);
      seenNames.add(nameKey);
      items.push(normalized);
    } catch {
      // Ignore one bad persisted/imported snippet without discarding the rest of the library.
    }
    return items;
  }, []);
}

export function addSnippet(snippets, input) {
  const next = normalizeSnippet(input);
  if (snippets.some(s => s.name.toLowerCase() === next.name.toLowerCase())) {
    throw new Error(`片段名称已存在: ${next.name}`);
  }
  return [...snippets, next];
}

export function updateSnippet(snippets, id, input) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("片段 ID 不能为空");
  if (!snippets.some(snippet => snippet.id === targetId)) {
    throw new Error(`未找到命令片段: ${targetId}`);
  }

  const next = normalizeSnippet({ ...input, id: targetId });
  if (snippets.some(snippet => snippet.id !== targetId && snippet.name.toLowerCase() === next.name.toLowerCase())) {
    throw new Error(`片段名称已存在: ${next.name}`);
  }

  return snippets.map(snippet => snippet.id === targetId ? next : snippet);
}

export function removeSnippet(snippets, id) {
  return snippets.filter(snippet => snippet.id !== id);
}

export function buildSnippetDeleteConfirmation(snippet) {
  const name = String(snippet?.name || "").trim() || "未命名片段";
  const cmd = String(snippet?.cmd || "").trim();
  if (!cmd) return `删除命令片段 ${name}?`;
  return `删除命令片段 ${name}?\n\n${cmd}`;
}

export function buildSnippetStatusMessage(text, tone = "success") {
  const message = String(text || "").trim();
  return {
    text: message,
    tone: tone === "error" ? "error" : "success",
  };
}

export function buildSnippetDisplay(snippet = {}) {
  const name = String(snippet?.name || "").trim() || "未命名片段";
  const command = getSnippetInsertCommand(snippet);
  const tag = String(snippet?.tag || "自定义").trim() || "自定义";
  const danger = Boolean(snippet?.danger) || detectDangerousCommand(command).danger;
  return {
    id: String(snippet?.id || "").trim(),
    name,
    command,
    tag,
    tagBadge: `${danger ? "⚠ " : ""}${tag}`,
    sessionButtonText: `${danger ? "⚠ " : ""}${name}`,
    danger,
    tone: danger ? "error" : "neutral",
    borderTone: danger ? "error" : "neutral",
    title: command,
  };
}

export function buildSnippetLibraryDisplay({ editing = false, snippetShortcut = "Ctrl+;" } = {}) {
  const shortcut = String(snippetShortcut || "").trim() || "Ctrl+;";
  return {
    pageTitle: "命令片段",
    createButtonText: "＋ 新建片段",
    sectionTitle: "片段库",
    sectionSubtitle: `一次保存,所有会话可用。会话内通过 ${shortcut} 或片段抽屉快速插入;危险命令执行前需确认。`,
    emptyText: "当前分类暂无片段。",
    rowActions: {
      editTitle: "编辑片段",
      editIcon: "✎",
      copyTitle: "复制命令",
      copyIcon: "⧉",
      deleteTitle: "删除片段",
      deleteIcon: "×",
    },
    form: {
      title: editing ? "编辑命令片段" : "新建命令片段",
      fields: [
        { key: "name", label: "名称", type: "input" },
        { key: "tag", label: "分类标签", type: "input" },
        { key: "cmd", label: "命令", type: "textarea" },
      ],
      dangerLabel: "执行前需要危险确认",
      autoDangerPrefix: "已自动识别:",
      cancelText: "取消",
      saveText: "保存",
    },
  };
}

export function buildSnippetSessionDrawerDisplay({ visibleCount = 0 } = {}) {
  const count = Math.max(0, Number(visibleCount) || 0);
  return {
    emptyVisible: count === 0,
    emptyText: "当前分类暂无片段",
  };
}

export function getSnippetTags(snippets) {
  const tags = new Set();
  snippets.forEach(snippet => {
    const tag = String(snippet?.tag || "自定义").trim() || "自定义";
    tags.add(tag);
  });
  return Array.from(tags).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export function getSnippetTagOptions(snippets) {
  return ["全部", ...getSnippetTags(snippets)];
}

export function filterSnippetsByTag(snippets, tag) {
  const selected = String(tag || "全部").trim();
  if (!selected || selected === "全部") return snippets;
  return snippets.filter(snippet => (String(snippet?.tag || "自定义").trim() || "自定义") === selected);
}

export function getSnippetInsertCommand(snippet) {
  return String(snippet?.cmd || "").trim();
}

export function loadSnippets(storage) {
  if (!storage) return DEFAULT_SNIPPETS;
  try {
    const raw = storage.getItem(SNIPPET_STORAGE_KEY);
    if (!raw) return DEFAULT_SNIPPETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SNIPPETS;
    const normalized = normalizeSnippetList(parsed);
    return normalized.length ? normalized : DEFAULT_SNIPPETS;
  } catch {
    return DEFAULT_SNIPPETS;
  }
}

export function saveSnippets(storage, snippets) {
  if (!storage) return;
  storage.setItem(SNIPPET_STORAGE_KEY, JSON.stringify(normalizeSnippetList(snippets)));
}

function makeSnippetId(name, cmd) {
  return `${slug(name)}-${hashString(cmd).toString(36)}`;
}

function slug(value) {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "snippet";
}

function hashString(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}
