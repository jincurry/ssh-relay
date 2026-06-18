import { describe, expect, it } from "vitest";
import { addSnippet, buildSnippetDeleteConfirmation, buildSnippetDisplay, buildSnippetLibraryDisplay, buildSnippetSessionDrawerDisplay, buildSnippetStatusMessage, DEFAULT_SNIPPETS, filterSnippetsByTag, getSnippetInsertCommand, getSnippetTagOptions, getSnippetTags, loadSnippets, normalizeSnippetList, removeSnippet, saveSnippets, SNIPPET_STORAGE_KEY, updateSnippet } from "./snippets.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe("snippets", () => {
  it("adds normalized snippets and rejects duplicate names", () => {
    const snippets = addSnippet([], {
      name: "  Restart API ",
      cmd: " sudo systemctl restart api ",
      tag: "",
      danger: true,
    });

    expect(snippets[0]).toMatchObject({
      name: "Restart API",
      cmd: "sudo systemctl restart api",
      tag: "自定义",
      danger: true,
    });
    expect(snippets[0].id).toContain("restart-api");
    expect(() => addSnippet(snippets, { name: "restart api", cmd: "echo duplicate" })).toThrow("片段名称已存在: restart api");
    expect(() => addSnippet(snippets, { name: "", cmd: "uptime" })).toThrow("片段名称不能为空");
    expect(() => addSnippet(snippets, { name: "Empty", cmd: "" })).toThrow("片段命令不能为空");
  });

  it("auto-flags dangerous commands during normalization", () => {
    expect(addSnippet([], {
      name: "wipe logs",
      cmd: "sudo rm -rf /var/log/app",
      tag: "运维",
    })[0]).toMatchObject({
      danger: true,
    });

    expect(addSnippet([], {
      name: "safe disk",
      cmd: "df -h",
      tag: "巡检",
    })[0]).toMatchObject({
      danger: false,
    });
  });

  it("auto-flags dangerous commands wrapped by shell snippets", () => {
    expect(addSnippet([], {
      name: "wrapped restart",
      cmd: "bash -lc 'systemctl restart nginx'",
      tag: "服务",
    })[0]).toMatchObject({
      danger: true,
    });
  });

  it("preserves explicit danger flags for commands that are not auto-detected", () => {
    expect(addSnippet([], {
      name: "manual review",
      cmd: "deploy-prod",
      tag: "发布",
      danger: true,
    })[0]).toMatchObject({
      danger: true,
    });
  });

  it("removes snippets by id", () => {
    expect(removeSnippet(DEFAULT_SNIPPETS, "restart-nginx").some(s => s.id === "restart-nginx")).toBe(false);
  });

  it("updates snippets while preserving ids and normalization rules", () => {
    const snippets = addSnippet([], { name: "Disk", cmd: "df -h", tag: "巡检" });
    const updated = updateSnippet(snippets, snippets[0].id, {
      name: "  Restart API ",
      cmd: " bash -lc 'systemctl restart api' ",
      tag: "",
    });

    expect(updated).toEqual([
      expect.objectContaining({
        id: snippets[0].id,
        name: "Restart API",
        cmd: "bash -lc 'systemctl restart api'",
        tag: "自定义",
        danger: true,
      }),
    ]);
  });

  it("rejects snippet updates with duplicate names or missing ids", () => {
    const snippets = [
      { id: "one", name: "Disk", cmd: "df -h", tag: "巡检", danger: false },
      { id: "two", name: "Ports", cmd: "ss -tlnp", tag: "网络", danger: false },
    ];

    expect(() => updateSnippet(snippets, "two", { name: "disk", cmd: "uptime" })).toThrow("片段名称已存在: disk");
    expect(() => updateSnippet(snippets, "missing", { name: "New", cmd: "uptime" })).toThrow("未找到命令片段: missing");
    expect(() => updateSnippet(snippets, "", { name: "New", cmd: "uptime" })).toThrow("片段 ID 不能为空");
  });

  it("builds a delete confirmation without exposing empty command noise", () => {
    expect(buildSnippetDeleteConfirmation({ name: "Restart API", cmd: " sudo systemctl restart api " })).toBe("删除命令片段 Restart API?\n\nsudo systemctl restart api");
    expect(buildSnippetDeleteConfirmation({ name: "  ", cmd: "" })).toBe("删除命令片段 未命名片段?");
  });

  it("builds explicit snippet status messages without keyword guessing", () => {
    expect(buildSnippetStatusMessage("片段已保存")).toEqual({ text: "片段已保存", tone: "success" });
    expect(buildSnippetStatusMessage("  片段名称已存在: Disk  ", "error")).toEqual({ text: "片段名称已存在: Disk", tone: "error" });
    expect(buildSnippetStatusMessage("状态已记录", "warn")).toEqual({ text: "状态已记录", tone: "success" });
  });

  it("builds shared snippet display metadata for library rows and session drawer buttons", () => {
    expect(buildSnippetDisplay({
      id: "restart",
      name: " Restart API ",
      cmd: " sudo systemctl restart api ",
      tag: " 服务 ",
    })).toEqual({
      id: "restart",
      name: "Restart API",
      command: "sudo systemctl restart api",
      tag: "服务",
      tagBadge: "⚠ 服务",
      sessionButtonText: "⚠ Restart API",
      danger: true,
      tone: "error",
      borderTone: "error",
      title: "sudo systemctl restart api",
    });

    expect(buildSnippetDisplay({
      name: " ",
      cmd: " df -h ",
      tag: "",
      danger: false,
    })).toMatchObject({
      id: "",
      name: "未命名片段",
      command: "df -h",
      tag: "自定义",
      tagBadge: "自定义",
      sessionButtonText: "未命名片段",
      danger: false,
      tone: "neutral",
      borderTone: "neutral",
    });
  });

  it("builds snippet library chrome and form display metadata", () => {
    expect(buildSnippetLibraryDisplay({ snippetShortcut: "⌘;" })).toEqual({
      pageTitle: "命令片段",
      createButtonText: "＋ 新建片段",
      sectionTitle: "片段库",
      sectionSubtitle: "一次保存,所有会话可用。会话内通过 ⌘; 或片段抽屉快速插入;危险命令执行前需确认。",
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
        title: "新建命令片段",
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
    });

    expect(buildSnippetLibraryDisplay({ editing: true, snippetShortcut: "" }).form.title).toBe("编辑命令片段");
    expect(buildSnippetLibraryDisplay({ snippetShortcut: "" }).sectionSubtitle).toContain("Ctrl+;");
  });

  it("builds session snippet drawer empty-state display metadata", () => {
    expect(buildSnippetSessionDrawerDisplay({ visibleCount: 0 })).toEqual({
      emptyVisible: true,
      emptyText: "当前分类暂无片段",
    });

    expect(buildSnippetSessionDrawerDisplay({ visibleCount: 3 })).toMatchObject({
      emptyVisible: false,
      emptyText: "当前分类暂无片段",
    });
  });

  it("loads defaults when storage is empty or invalid", () => {
    expect(loadSnippets(memoryStorage())).toEqual(DEFAULT_SNIPPETS);
    expect(loadSnippets(memoryStorage({ [SNIPPET_STORAGE_KEY]: "not json" }))).toEqual(DEFAULT_SNIPPETS);
  });

  it("saves and loads normalized snippets", () => {
    const storage = memoryStorage();
    const snippets = addSnippet([], { name: "df", cmd: "df -h", tag: "巡检" });
    saveSnippets(storage, snippets);
    expect(loadSnippets(storage)).toEqual(snippets);
  });

  it("keeps valid persisted snippets when nearby records are invalid", () => {
    const storage = memoryStorage({
      [SNIPPET_STORAGE_KEY]: JSON.stringify([
        { name: "Disk", cmd: " df -h ", tag: "巡检" },
        { name: "Missing command", cmd: "" },
        null,
      ]),
    });

    expect(loadSnippets(storage)).toEqual([
      expect.objectContaining({ name: "Disk", cmd: "df -h", tag: "巡检" }),
    ]);
    expect(normalizeSnippetList([{ name: "", cmd: "uptime" }, { name: "Up", cmd: "uptime" }]))
      .toEqual([expect.objectContaining({ name: "Up", cmd: "uptime" })]);
  });

  it("deduplicates normalized snippets by id and case-insensitive name", () => {
    expect(normalizeSnippetList([
      { id: "disk", name: "Disk", cmd: "df -h", tag: "巡检" },
      { id: "other", name: "disk", cmd: "du -sh", tag: "巡检" },
      { id: "DISK", name: "Disk usage", cmd: "df -i", tag: "巡检" },
      { id: "ports", name: "Ports", cmd: "ss -tlnp", tag: "网络" },
    ])).toEqual([
      expect.objectContaining({ id: "disk", name: "Disk", cmd: "df -h" }),
      expect.objectContaining({ id: "ports", name: "Ports", cmd: "ss -tlnp" }),
    ]);
  });

  it("generates stable ids for persisted snippets with blank ids", () => {
    expect(normalizeSnippetList([
      { id: "   ", name: "Disk Usage", cmd: "df -h", tag: "巡检" },
    ])).toEqual([
      expect.objectContaining({ id: "disk-usage-2poyzm", name: "Disk Usage", cmd: "df -h" }),
    ]);
  });

  it("derives sorted snippet tags with normalized fallback", () => {
    const tags = getSnippetTags([
      { name: "a", cmd: "a", tag: "网络" },
      { name: "b", cmd: "b", tag: "" },
      { name: "c", cmd: "c", tag: "巡检" },
      { name: "d", cmd: "d", tag: "网络" },
    ]);

    expect(tags).toEqual(["网络", "巡检", "自定义"]);
  });

  it("builds snippet tag options with the all bucket first", () => {
    expect(getSnippetTagOptions([
      { name: "a", cmd: "a", tag: "网络" },
      { name: "b", cmd: "b", tag: "巡检" },
    ])).toEqual(["全部", "网络", "巡检"]);
  });

  it("filters snippets by tag and keeps all snippets for the all tag", () => {
    const snippets = [
      { id: "1", name: "df", cmd: "df -h", tag: "巡检" },
      { id: "2", name: "ss", cmd: "ss -tlnp", tag: "网络" },
      { id: "3", name: "custom", cmd: "uptime", tag: "自定义" },
    ];

    expect(filterSnippetsByTag(snippets, "网络").map(s => s.id)).toEqual(["2"]);
    expect(filterSnippetsByTag(snippets, "全部")).toEqual(snippets);
    expect(filterSnippetsByTag(snippets, "")).toEqual(snippets);
  });

  it("normalizes commands before inserting snippets into the session input", () => {
    expect(getSnippetInsertCommand({ cmd: "  df -h  " })).toBe("df -h");
    expect(getSnippetInsertCommand({ cmd: "" })).toBe("");
    expect(getSnippetInsertCommand(null)).toBe("");
  });
});
