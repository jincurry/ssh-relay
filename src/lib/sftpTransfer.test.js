import { describe, expect, it } from "vitest";
import {
  buildFileSystemPathBreadcrumbs,
  buildRecursiveSftpWorkFile,
  buildSftpDirectionButtonDisplay,
  buildStreamingTransferQueueItem,
  buildSftpEditorCloseConfirmation,
  buildSftpEditorDisplay,
  buildSftpEditorState,
  buildSftpFilePaneDisplay,
  buildSftpLocalFolderCreateErrorState,
  buildSftpNewFolderPromptLabel,
  buildSftpPageDisplay,
  buildSftpPaneStatusMessage,
  buildSftpRemoteConnectionControl,
  buildSftpRemoteOverwriteConfirmation,
  buildSftpToastMessage,
  buildTransferQueueDisplay,
  buildTransferQueueSummary,
  buildTreePathBreadcrumbs,
  calculateTransferProgress,
  clearCompletedTransferQueue,
  describeUnsupportedTransferEntry,
  formatTransferRate,
  getSftpTransferAvailability,
  isActiveTransferQueueItem,
  isCompletedTransferQueueItem,
  joinLocalPath,
  joinRemotePath,
  normalizeTransferQueueItem,
  hasSftpEditorUnsavedChanges,
  planRealSftpFileTransfer,
  planRecursiveSftpFileTransfer,
  shouldPublishTransferProgress,
  summarizeRecursiveSftpWorkFiles,
} from "./sftpTransfer.js";

describe("sftpTransfer", () => {
  it("joins remote paths without corrupting relative and root paths", () => {
    expect(joinRemotePath(".", "app.conf")).toBe("app.conf");
    expect(joinRemotePath("/etc", "app.conf")).toBe("/etc/app.conf");
    expect(joinRemotePath("/etc/", "app.conf")).toBe("/etc/app.conf");
  });

  it("joins local paths across root and normal directories", () => {
    expect(joinLocalPath("/tmp", "app.conf")).toBe("/tmp/app.conf");
    expect(joinLocalPath("/tmp/", "app.conf")).toBe("/tmp/app.conf");
    expect(joinLocalPath("/", "app.conf")).toBe("/app.conf");
    expect(joinLocalPath("C:\\Users\\me", "app.conf")).toBe("C:\\Users\\me\\app.conf");
    expect(joinLocalPath("C:\\", "app.conf")).toBe("C:\\app.conf");
    expect(joinLocalPath("C:/Users/me", "app.conf")).toBe("C:/Users/me/app.conf");
    expect(joinLocalPath("workspace\\release", "app.conf")).toBe("workspace\\release\\app.conf");
  });

  it("builds clickable breadcrumbs for mock tree paths", () => {
    expect(buildTreePathBreadcrumbs("~/work", ["dist", "assets"])).toEqual([
      { label: "~/work", path: [] },
      { label: "dist", path: ["dist"] },
      { label: "assets", path: ["dist", "assets"] },
    ]);
  });

  it("builds clickable breadcrumbs for Unix and relative paths", () => {
    expect(buildFileSystemPathBreadcrumbs("/var/www/app")).toEqual([
      { label: "/", path: "/" },
      { label: "var", path: "/var" },
      { label: "www", path: "/var/www" },
      { label: "app", path: "/var/www/app" },
    ]);
    expect(buildFileSystemPathBreadcrumbs("releases/current")).toEqual([
      { label: "releases", path: "releases" },
      { label: "current", path: "releases/current" },
    ]);
  });

  it("builds clickable breadcrumbs for Windows drive paths", () => {
    expect(buildFileSystemPathBreadcrumbs("C:\\Users\\deploy\\logs")).toEqual([
      { label: "C:\\", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "deploy", path: "C:\\Users\\deploy" },
      { label: "logs", path: "C:\\Users\\deploy\\logs" },
    ]);
  });

  it("builds contextual new-folder prompt labels", () => {
    expect(buildSftpNewFolderPromptLabel({ side: "local", mode: "real", path: "/home/deploy" }))
      .toBe("新建真实本地文件夹名称\n\n父目录: /home/deploy");
    expect(buildSftpNewFolderPromptLabel({ side: "local", mode: "preview", pathSegments: ["work", "dist"] }))
      .toBe("新建预览本地文件夹名称\n\n父目录: 本地根目录/work/dist");
    expect(buildSftpNewFolderPromptLabel({ side: "remote", mode: "preview", pathSegments: ["var", "log"] }))
      .toBe("新建预览远端文件夹名称\n\n父目录: 远端根目录/var/log");
    expect(buildSftpNewFolderPromptLabel())
      .toBe("新建预览远端文件夹名称\n\n父目录: 远端根目录");
  });

  it("keeps real-local folder creation failures scoped to local filesystem state", () => {
    expect(buildSftpLocalFolderCreateErrorState(new Error("EACCES: permission denied"))).toEqual({
      message: "EACCES: permission denied",
      tone: "error",
      resetCachedAuth: false,
      timeoutMs: 2200,
    });

    expect(buildSftpLocalFolderCreateErrorState("SFTP authentication rejected by server")).toMatchObject({
      message: "SFTP authentication rejected by server",
      resetCachedAuth: false,
    });

    expect(buildSftpLocalFolderCreateErrorState(" ")).toMatchObject({
      message: "本地目录创建失败",
      resetCachedAuth: false,
    });
  });

  it("builds SFTP file pane chrome display metadata", () => {
    expect(buildSftpFilePaneDisplay({
      title: " 💻 本地 ",
      entries: [{ name: "app.conf" }],
      editable: true,
      refreshable: true,
      creatable: true,
      mockable: true,
      canGoUp: true,
    })).toEqual({
      title: "💻 本地",
      upText: "↑ 上级",
      refreshTitle: "刷新",
      refreshIcon: "⟳",
      createDirTitle: "新建文件夹",
      createDirIcon: "＋",
      editText: "✎ 编辑",
      mockTitle: "回到演示远端",
      mockText: "演示",
      emptyText: "空目录 — 从另一侧传输文件,或拖入本窗口",
      hasEntries: true,
      editable: true,
      refreshable: true,
      creatable: true,
      mockable: true,
      canGoUp: true,
    });

    expect(buildSftpFilePaneDisplay({ title: "", entries: null })).toMatchObject({
      title: "文件",
      hasEntries: false,
      editable: false,
      refreshable: false,
      creatable: false,
      mockable: false,
      canGoUp: false,
    });
  });

  it("calculates transfer progress and rate labels", () => {
    expect(calculateTransferProgress({
      transferred: 1536,
      totalSize: 4096,
      startedAt: 1000,
      now: 2000,
    })).toMatchObject({
      progress: 38,
      transferred: 1536,
      totalSize: 4096,
      rateBytesPerSecond: 1536,
      rateLabel: "2 KB/s",
    });

    expect(calculateTransferProgress({
      transferred: 8192,
      totalSize: 4096,
      startedAt: 1000,
      now: 1000,
    })).toMatchObject({
      progress: 100,
      transferred: 4096,
      rateLabel: "—",
    });
  });

  it("formats transfer rates across byte units", () => {
    expect(formatTransferRate(0)).toBe("—");
    expect(formatTransferRate(900)).toBe("900 B/s");
    expect(formatTransferRate(1536)).toBe("2 KB/s");
    expect(formatTransferRate(2.5 * 1024 * 1024)).toBe("2.5 MB/s");
  });

  it("publishes initial, forced and completed transfer progress", () => {
    expect(shouldPublishTransferProgress({
      transferred: 1,
      totalSize: 100,
      lastPublishedAt: 0,
      now: 1000,
    })).toBe(true);
    expect(shouldPublishTransferProgress({
      transferred: 10,
      totalSize: 100,
      lastTransferred: 10,
      lastProgress: 10,
      lastPublishedAt: 1000,
      now: 1001,
      force: true,
    })).toBe(true);
    expect(shouldPublishTransferProgress({
      transferred: 100,
      totalSize: 100,
      lastTransferred: 99,
      lastProgress: 99,
      lastPublishedAt: 1000,
      now: 1001,
    })).toBe(true);
  });

  it("throttles transfer progress until percent or time thresholds are crossed", () => {
    expect(shouldPublishTransferProgress({
      transferred: 105,
      totalSize: 10_000,
      lastTransferred: 100,
      lastProgress: 1,
      lastPublishedAt: 1000,
      now: 1050,
    })).toBe(false);
    expect(shouldPublishTransferProgress({
      transferred: 200,
      totalSize: 10_000,
      lastTransferred: 100,
      lastProgress: 1,
      lastPublishedAt: 1000,
      now: 1050,
    })).toBe(true);
    expect(shouldPublishTransferProgress({
      transferred: 105,
      totalSize: 10_000,
      lastTransferred: 100,
      lastProgress: 1,
      lastPublishedAt: 1000,
      now: 1130,
    })).toBe(true);
  });

  it("does not publish transfer progress without forward movement", () => {
    expect(shouldPublishTransferProgress({
      transferred: 100,
      totalSize: 10_000,
      lastTransferred: 100,
      lastProgress: 1,
      lastPublishedAt: 1000,
      now: 2000,
    })).toBe(false);
  });

  it("plans real remote file downloads into the selected local directory", () => {
    const plan = planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [] },
      remoteEntry: { name: "app.conf", path: "/etc/app.conf", kind: "file", size: 12, editable: true },
    });

    expect(plan).toMatchObject({
      ok: true,
      name: "app.conf",
      size: 12,
      localTargetPath: "/tmp",
      remoteSourcePath: "/etc/app.conf",
    });
  });

  it("plans real remote binary downloads and blocks duplicate local targets", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [] },
      remoteEntry: { name: "archive.tar.gz", path: "/tmp/archive.tar.gz", kind: "file", editable: false },
    })).toMatchObject({
      ok: true,
      name: "archive.tar.gz",
      remoteSourcePath: "/tmp/archive.tar.gz",
    });

    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "app.conf" }] },
      remoteEntry: { name: "app.conf", path: "/etc/app.conf", kind: "file", editable: true },
    })).toMatchObject({ ok: false, reason: "app.conf 已存在于本地目录" });
  });

  it("plans real remote file download resume for smaller local targets", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "archive.tar.gz", kind: "file", size: 1024 }] },
      remoteEntry: { name: "archive.tar.gz", path: "/tmp/archive.tar.gz", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: true,
      resumeOffset: 1024,
      localTargetPath: "/tmp",
      remoteSourcePath: "/tmp/archive.tar.gz",
    });

    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "archive.tar.gz", kind: "file", size: 4096 }] },
      remoteEntry: { name: "archive.tar.gz", path: "/tmp/archive.tar.gz", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: true,
      skip: true,
      resumeOffset: 4096,
      existsLocal: true,
    });
  });

  it("rejects real remote file download resume when the local target is larger", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "archive.tar.gz", kind: "file", size: 8192 }] },
      remoteEntry: { name: "archive.tar.gz", path: "/tmp/archive.tar.gz", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: false,
      reason: "archive.tar.gz 本地文件大于远端文件, 无法断点续传",
    });
  });

  it("rejects real remote file downloads over unsupported local targets", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "current", kind: "symlink" }] },
      remoteEntry: { name: "current", path: "/var/www/current", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: false,
      reason: "current 是符号链接, 当前不跟随链接传输",
    });
  });

  it("plans real local file uploads and reports remote overwrite risk", () => {
    const plan = planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/etc", entries: [{ name: "app.conf" }] },
      localEntry: { name: "app.conf", path: "/tmp/app.conf", kind: "file", size: 8, editable: true },
    });

    expect(plan).toMatchObject({
      ok: true,
      existsRemote: true,
      name: "app.conf",
      localSourcePath: "/tmp/app.conf",
      remoteTargetPath: "/etc",
    });
  });

  it("builds explicit real remote overwrite confirmations", () => {
    expect(buildSftpRemoteOverwriteConfirmation({
      name: "app.conf",
      sourceKind: "file",
      localSourcePath: "/tmp/app.conf",
      remoteTargetPath: "/etc/nginx",
    })).toBe("app.conf 已存在于真实远端目录。\n\n确认覆盖真实远端文件?\n\n本地来源: /tmp/app.conf\n\n远端目标: /etc/nginx/app.conf\n\n远端同名文件会被本地文件内容替换。");

    expect(buildSftpRemoteOverwriteConfirmation({
      name: "build",
      sourceKind: "dir",
      localSourcePath: "/tmp/build",
      remoteTargetPath: "/var/www/",
    })).toBe("build 已存在于真实远端目录。\n\n确认合并上传到真实远端目录?\n\n本地来源: /tmp/build\n\n远端目标: /var/www/build\n\n同名目录会被合并,冲突文件可能被后续上传覆盖。");
  });

  it("plans real local file upload resume for smaller remote targets", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/etc", entries: [{ name: "payload.bin", kind: "file", size: 1024 }] },
      localEntry: { name: "payload.bin", path: "/tmp/payload.bin", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: true,
      existsRemote: true,
      resumeOffset: 1024,
      remoteTargetPath: "/etc",
    });
  });

  it("rejects real local file upload resume when the remote target is larger", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/etc", entries: [{ name: "payload.bin", kind: "file", size: 8192 }] },
      localEntry: { name: "payload.bin", path: "/tmp/payload.bin", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: false,
      reason: "payload.bin 真实远端文件大于本地文件, 无法断点续传",
    });
  });

  it("rejects real local file uploads over unsupported remote targets", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var/www", entries: [{ name: "current", kind: "symlink" }] },
      localEntry: { name: "current", path: "/tmp/current", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: false,
      reason: "current 是符号链接, 当前不跟随链接传输",
    });
  });

  it("plans recursive directory child uploads with file-level resume rules", () => {
    expect(planRecursiveSftpFileTransfer({
      direction: "up",
      sourceEntry: { name: "payload.bin", kind: "file", size: 4096 },
      existingTarget: { name: "payload.bin", kind: "file", size: 1024 },
    })).toMatchObject({
      ok: true,
      skip: false,
      resumeOffset: 1024,
    });

    expect(planRecursiveSftpFileTransfer({
      direction: "up",
      sourceEntry: { name: "payload.bin", kind: "file", size: 4096 },
      existingTarget: { name: "payload.bin", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: true,
      skip: true,
      resumeOffset: 4096,
    });

    expect(planRecursiveSftpFileTransfer({
      direction: "up",
      sourceEntry: { name: "payload.bin", kind: "file", size: 4096 },
      existingTarget: { name: "payload.bin", kind: "file", size: 8192 },
    })).toMatchObject({
      ok: false,
      reason: "payload.bin 真实远端文件大于本地文件, 无法断点续传",
    });

    expect(planRecursiveSftpFileTransfer({
      direction: "up",
      sourceEntry: { name: "payload.bin", kind: "file", size: 4096 },
      existingTarget: { name: "payload.bin", kind: "dir" },
    })).toMatchObject({
      ok: false,
      reason: "payload.bin 已作为目录存在于真实远端目录",
    });
  });

  it("plans recursive directory child downloads with file-level resume rules", () => {
    expect(planRecursiveSftpFileTransfer({
      direction: "down",
      sourceEntry: { name: "archive.tar.gz", kind: "file", size: 4096 },
      existingTarget: { name: "archive.tar.gz", kind: "file", size: 1024 },
    })).toMatchObject({
      ok: true,
      skip: false,
      resumeOffset: 1024,
    });

    expect(planRecursiveSftpFileTransfer({
      direction: "down",
      sourceEntry: { name: "archive.tar.gz", kind: "file", size: 4096 },
      existingTarget: { name: "archive.tar.gz", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: true,
      skip: true,
      resumeOffset: 4096,
    });

    expect(planRecursiveSftpFileTransfer({
      direction: "down",
      sourceEntry: { name: "archive.tar.gz", kind: "file", size: 4096 },
      existingTarget: { name: "archive.tar.gz", kind: "file", size: 8192 },
    })).toMatchObject({
      ok: false,
      reason: "archive.tar.gz 本地文件大于远端文件, 无法断点续传",
    });

    expect(planRecursiveSftpFileTransfer({
      direction: "down",
      sourceEntry: { name: "archive.tar.gz", kind: "file", size: 4096 },
      existingTarget: { name: "archive.tar.gz", kind: "dir" },
    })).toMatchObject({
      ok: false,
      reason: "archive.tar.gz 已作为目录存在于本地目录",
    });
  });

  it("builds recursive SFTP work files and includes skipped bytes in aggregate progress", () => {
    const files = [
      buildRecursiveSftpWorkFile({
        plan: { resumeOffset: 1024 },
        localPath: "/tmp/a.bin",
        remotePath: "/var/a.bin",
        size: 4096,
      }),
      buildRecursiveSftpWorkFile({
        plan: { skip: true, resumeOffset: 4096 },
        localPath: "/tmp/b.bin",
        remotePath: "/var/b.bin",
        size: 4096,
      }),
      buildRecursiveSftpWorkFile({
        plan: { resumeOffset: 9999 },
        localPath: "/tmp/c.bin",
        remotePath: "/var/c.bin",
        size: 2048,
      }),
    ];

    expect(files).toEqual([
      { localPath: "/tmp/a.bin", remotePath: "/var/a.bin", size: 4096, resumeOffset: 1024, skip: false },
      { localPath: "/tmp/b.bin", remotePath: "/var/b.bin", size: 4096, resumeOffset: 4096, skip: true },
      { localPath: "/tmp/c.bin", remotePath: "/var/c.bin", size: 2048, resumeOffset: 2048, skip: false },
    ]);
    expect(summarizeRecursiveSftpWorkFiles(files)).toEqual({
      totalSize: 10240,
      transferred: 7168,
      skippedCount: 1,
    });
  });

  it("rejects unsupported recursive directory child sources and targets", () => {
    expect(planRecursiveSftpFileTransfer({
      direction: "up",
      sourceEntry: { name: "current", kind: "symlink" },
      existingTarget: null,
    })).toMatchObject({
      ok: false,
      reason: "current 是符号链接, 当前不跟随链接传输",
    });

    expect(planRecursiveSftpFileTransfer({
      direction: "down",
      sourceEntry: { name: "payload.bin", kind: "file", size: 4096 },
      existingTarget: { name: "payload.bin", kind: "symlink" },
    })).toMatchObject({
      ok: false,
      reason: "payload.bin 是符号链接, 当前不跟随链接传输",
    });
  });

  it("plans real remote directory downloads recursively", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [] },
      remoteEntry: { name: "logs", path: "/var/log", kind: "dir" },
    })).toMatchObject({
      ok: true,
      sourceKind: "dir",
      name: "logs",
      remoteSourcePath: "/var/log",
    });
  });

  it("plans real remote directory downloads into existing local directories", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "logs", kind: "dir" }] },
      remoteEntry: { name: "logs", path: "/var/log", kind: "dir" },
    })).toMatchObject({
      ok: true,
      existsLocal: true,
      existingLocalKind: "dir",
      sourceKind: "dir",
      localTargetPath: "/tmp",
      remoteSourcePath: "/var/log",
    });
  });

  it("blocks real remote directory downloads over existing local files", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "logs", kind: "file", size: 12 }] },
      remoteEntry: { name: "logs", path: "/var/log", kind: "dir" },
    })).toMatchObject({ ok: false, reason: "logs 已作为文件存在于本地目录" });
  });

  it("blocks real remote file downloads over existing local directories", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [{ name: "app.conf", kind: "dir" }] },
      remoteEntry: { name: "app.conf", path: "/etc/app.conf", kind: "file", size: 12 },
    })).toMatchObject({ ok: false, reason: "app.conf 已作为目录存在于本地目录" });
  });

  it("rejects real remote symlink downloads with an actionable reason", () => {
    expect(planRealSftpFileTransfer({
      direction: "down",
      localListing: { path: "/tmp", entries: [] },
      remoteEntry: { name: "current", path: "/var/www/current", kind: "symlink" },
    })).toMatchObject({
      ok: false,
      reason: "current 是符号链接, 当前不跟随链接传输",
    });
  });

  it("describes unsupported transfer entries for queue-visible errors", () => {
    expect(describeUnsupportedTransferEntry(
      { name: "current", path: "/var/current", kind: "symlink" },
      "远端条目",
    )).toBe("current 是符号链接, 当前不跟随链接传输");

    expect(describeUnsupportedTransferEntry(
      { name: "socket", path: "/var/run/socket", kind: "socket" },
      "远端条目",
    )).toBe("socket 不是可传输的文件或目录");

    expect(describeUnsupportedTransferEntry(null, "远端条目"))
      .toBe("远端条目 不是可传输的文件或目录");
  });

  it("plans real local directory uploads and merge targets", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var", entries: [{ name: "build", kind: "dir" }] },
      localEntry: { name: "build", path: "/tmp/build", kind: "dir" },
    })).toMatchObject({
      ok: true,
      existsRemote: true,
      existingRemoteKind: "dir",
      sourceKind: "dir",
    });
  });

  it("rejects real local symlink uploads with an actionable reason", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var", entries: [] },
      localEntry: { name: "current", path: "/tmp/current", kind: "symlink" },
    })).toMatchObject({
      ok: false,
      reason: "current 是符号链接, 当前不跟随链接传输",
    });
  });

  it("reports transfer button availability across preview and real panes", () => {
    expect(getSftpTransferAvailability({
      direction: "up",
      mockLocalEntry: { name: "dist", type: "dir" },
    })).toEqual({ ready: true, reason: "" });

    expect(getSftpTransferAvailability({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      localEntry: { name: "dist", kind: "dir" },
      remoteListing: null,
    })).toEqual({
      ready: false,
      reason: "真实本地目录上传需要先连接真实远端 SFTP",
    });

    expect(getSftpTransferAvailability({
      direction: "down",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var", entries: [] },
      remoteEntry: { name: "current", path: "/var/current", kind: "symlink" },
    })).toEqual({
      ready: false,
      reason: "current 是符号链接, 当前不跟随链接传输",
    });

    expect(getSftpTransferAvailability({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var", entries: [] },
      localEntry: { name: "app.conf", path: "/tmp/app.conf", kind: "file", size: 12 },
    })).toEqual({ ready: true, reason: "" });
  });

  it("builds SFTP transfer direction button display states", () => {
    expect(buildSftpDirectionButtonDisplay({
      direction: "up",
      availability: { ready: true, reason: "" },
    })).toEqual({
      text: "→",
      title: "上传所选",
      disabled: false,
      tone: "pending",
      borderTone: "pending",
      opacity: 1,
      ready: true,
    });

    expect(buildSftpDirectionButtonDisplay({
      direction: "down",
      availability: { ready: true, reason: "" },
      realRemote: true,
    })).toEqual({
      text: "←",
      title: "下载所选到本地",
      disabled: false,
      tone: "pending",
      borderTone: "pending",
      opacity: 1,
      ready: true,
    });

    expect(buildSftpDirectionButtonDisplay({
      direction: "up",
      availability: { ready: false, reason: "请选择一个本地文件" },
      realRemote: true,
    })).toEqual({
      text: "→",
      title: "请选择一个本地文件",
      disabled: true,
      tone: "neutral",
      borderTone: "neutral",
      opacity: 0.5,
      ready: false,
    });

    expect(buildSftpDirectionButtonDisplay({
      direction: "sideways",
      availability: null,
    })).toMatchObject({
      text: "→",
      title: "当前选择不可传输",
      disabled: true,
    });
  });

  it("builds streaming download queue items from real SFTP plans", () => {
    expect(buildStreamingTransferQueueItem({
      id: 42,
      direction: "down",
      startedAt: 1000,
      plan: {
        name: "archive.tar.gz",
        size: 4096,
        sourceKind: "file",
        localTargetPath: "/tmp",
        remoteSourcePath: "/var/archive.tar.gz",
        existsLocal: true,
        resumeOffset: 1024,
      },
    })).toMatchObject({
      id: 42,
      name: "archive.tar.gz",
      totalSize: 4096,
      dir: "down",
      toPath: "/tmp",
      localTargetPath: "/tmp",
      remoteSourcePath: "/var/archive.tar.gz",
      existsLocal: true,
      resumeOffset: 1024,
      transferred: 1024,
      progress: 25,
      status: "stream",
      rateLabel: "—",
    });
  });

  it("builds completed queue items for equal-size single-file resume skips", () => {
    expect(buildStreamingTransferQueueItem({
      id: 44,
      direction: "down",
      startedAt: 1000,
      plan: {
        name: "archive.tar.gz",
        size: 4096,
        sourceKind: "file",
        localTargetPath: "/tmp",
        remoteSourcePath: "/var/archive.tar.gz",
        existsLocal: true,
        skip: true,
        resumeOffset: 4096,
      },
    })).toMatchObject({
      id: 44,
      name: "archive.tar.gz",
      dir: "down",
      totalSize: 4096,
      localTargetPath: "/tmp",
      remoteSourcePath: "/var/archive.tar.gz",
      existsLocal: true,
      resumeOffset: 4096,
      transferred: 4096,
      progress: 100,
      status: "done",
      skip: true,
      materialized: true,
      rateLabel: "已存在",
    });
  });

  it("builds zero-byte streaming queue items as full progress until materialized", () => {
    expect(buildStreamingTransferQueueItem({
      id: 45,
      direction: "down",
      startedAt: 1000,
      plan: {
        name: "empty.log",
        size: 0,
        sourceKind: "file",
        localTargetPath: "/tmp",
        remoteSourcePath: "/var/empty.log",
      },
    })).toMatchObject({
      id: 45,
      name: "empty.log",
      totalSize: 0,
      transferred: 0,
      progress: 100,
      status: "stream",
      materialized: false,
      skip: false,
    });
  });

  it("builds streaming upload queue items and caps resumed initial progress", () => {
    expect(buildStreamingTransferQueueItem({
      id: 43,
      direction: "up",
      startedAt: 1000,
      plan: {
        name: "payload.bin",
        size: 4096,
        sourceKind: "file",
        localSourcePath: "/tmp/payload.bin",
        remoteTargetPath: "/var",
        existsRemote: true,
        resumeOffset: 8192,
      },
    })).toMatchObject({
      id: 43,
      name: "payload.bin",
      totalSize: 4096,
      dir: "up",
      toPath: "/var",
      localSourcePath: "/tmp/payload.bin",
      remoteTargetPath: "/var",
      rootExists: true,
      resumeOffset: 4096,
      transferred: 4096,
      progress: 99,
      status: "stream",
    });
  });

  it("plans equal-size real uploads as completed resume skips", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var", entries: [{ name: "payload.bin", kind: "file", size: 4096 }] },
      localEntry: { name: "payload.bin", path: "/tmp/payload.bin", kind: "file", size: 4096 },
    })).toMatchObject({
      ok: true,
      existsRemote: true,
      existingRemoteKind: "file",
      skip: true,
      resumeOffset: 4096,
      localSourcePath: "/tmp/payload.bin",
      remoteTargetPath: "/var",
    });
  });

  it("blocks local directory upload over an existing remote file", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var", entries: [{ name: "build", kind: "file" }] },
      localEntry: { name: "build", path: "/tmp/build", kind: "dir" },
    })).toMatchObject({ ok: false, reason: "build 已作为文件存在于真实远端目录" });
  });

  it("blocks local file upload over an existing remote directory", () => {
    expect(planRealSftpFileTransfer({
      direction: "up",
      localListing: { path: "/tmp", entries: [] },
      remoteListing: { path: "/var", entries: [{ name: "build", kind: "dir" }] },
      localEntry: { name: "build", path: "/tmp/build", kind: "file", size: 42 },
    })).toMatchObject({ ok: false, reason: "build 已作为目录存在于真实远端目录" });
  });

  it("classifies active and completed queue items", () => {
    expect(isActiveTransferQueueItem({ status: "run" })).toBe(true);
    expect(isActiveTransferQueueItem({ status: "stream" })).toBe(true);
    expect(isActiveTransferQueueItem({ status: "done", materializing: true })).toBe(true);
    expect(isActiveTransferQueueItem({ status: "failed" })).toBe(false);
    expect(isCompletedTransferQueueItem({ status: "done" })).toBe(true);
    expect(isCompletedTransferQueueItem({ status: "done", materializing: true })).toBe(false);
  });

  it("clears only completed queue items", () => {
    const queue = [
      { id: 1, status: "done" },
      { id: 2, status: "failed" },
      { id: 3, status: "run" },
      { id: 4, status: "stream" },
      { id: 5, status: "done", materializing: true },
    ];

    expect(clearCompletedTransferQueue(queue).map(item => item.id)).toEqual([2, 3, 4, 5]);
  });

  it("normalizes transfer queue display values", () => {
    expect(normalizeTransferQueueItem({
      dir: "up",
      progress: 140,
      transferred: 9000,
      totalSize: 4096,
    })).toMatchObject({
      dir: "up",
      progress: 100,
      transferred: 4096,
      totalSize: 4096,
    });

    expect(normalizeTransferQueueItem({
      dir: "sideways",
      progress: Number.NaN,
      size: 2048,
    })).toMatchObject({
      dir: "down",
      progress: 0,
      transferred: 0,
      totalSize: 2048,
    });

    expect(normalizeTransferQueueItem({
      status: "done",
      progress: undefined,
      size: 1024,
    })).toMatchObject({
      progress: 100,
      transferred: 1024,
      totalSize: 1024,
    });
  });

  it("builds queue row display labels from normalized transfer state", () => {
    expect(buildTransferQueueDisplay({
      dir: "up",
      status: "stream",
      progress: 24.8,
      transferred: 1024,
      totalSize: 4096,
      rateLabel: "120 KB/s",
    })).toMatchObject({
      directionLabel: "↑ 上传",
      statusLabel: "24%",
      statusTone: "active",
      metrics: "1 KB / 4 KB · 120 KB/s",
      progress: 24.8,
    });

    expect(buildTransferQueueDisplay({
      dir: "down",
      status: "done",
      skip: true,
      transferred: 4096,
      totalSize: 4096,
      rateLabel: "已存在",
    })).toMatchObject({
      directionLabel: "↓ 下载",
      statusLabel: "✓ 已存在",
      statusTone: "success",
      metrics: "4 KB / 4 KB · 已存在",
      progress: 100,
    });
  });

  it("summarizes transfer queue header state", () => {
    expect(buildTransferQueueSummary()).toEqual({
      visible: false,
      text: "",
      tone: "neutral",
      activeCount: 0,
      failedCount: 0,
      completedCount: 0,
      totalCount: 0,
      canClearCompleted: false,
    });

    expect(buildTransferQueueSummary([
      { status: "stream" },
      { status: "run" },
      { status: "done" },
    ])).toEqual({
      visible: true,
      text: "2 个进行中",
      tone: "pending",
      activeCount: 2,
      failedCount: 0,
      completedCount: 1,
      totalCount: 3,
      canClearCompleted: true,
    });

    expect(buildTransferQueueSummary([
      { status: "stream" },
      { status: "failed" },
      { status: "done" },
    ])).toEqual({
      visible: true,
      text: "1 个失败",
      tone: "error",
      activeCount: 1,
      failedCount: 1,
      completedCount: 1,
      totalCount: 3,
      canClearCompleted: true,
    });

    expect(buildTransferQueueSummary([
      { status: "done" },
      { status: "done", skip: true },
    ])).toEqual({
      visible: true,
      text: "✓ 全部完成",
      tone: "success",
      activeCount: 0,
      failedCount: 0,
      completedCount: 2,
      totalCount: 2,
      canClearCompleted: true,
    });
  });

  it("builds SFTP pane status messages", () => {
    expect(buildSftpPaneStatusMessage({ loading: true, side: "local" })).toEqual({
      visible: true,
      text: "正在读取本地目录…",
      tone: "pending",
    });
    expect(buildSftpPaneStatusMessage({ loading: true, side: "remote", error: "ignored" })).toEqual({
      visible: true,
      text: "正在读取真实远端目录…",
      tone: "pending",
    });
    expect(buildSftpPaneStatusMessage({ error: "  permission denied  " })).toEqual({
      visible: true,
      text: "permission denied",
      tone: "error",
    });
    expect(buildSftpPaneStatusMessage({ empty: true, side: "remote" })).toEqual({
      visible: true,
      text: "远端目录为空",
      tone: "neutral",
    });
    expect(buildSftpPaneStatusMessage()).toEqual({
      visible: false,
      text: "",
      tone: "neutral",
    });
  });

  it("builds explicit SFTP toast message tones from existing messages", () => {
    expect(buildSftpToastMessage(" ✓ 已创建 release ")).toEqual({
      text: "✓ 已创建 release",
      tone: "success",
    });
    expect(buildSftpToastMessage("远端演示目录已刷新")).toEqual({
      text: "远端演示目录已刷新",
      tone: "success",
    });
    expect(buildSftpToastMessage("正在读取远端文件…")).toEqual({
      text: "正在读取远端文件…",
      tone: "pending",
    });
    expect(buildSftpToastMessage("真实远端 SFTP 仅在桌面端可用")).toEqual({
      text: "真实远端 SFTP 仅在桌面端可用",
      tone: "error",
    });
    expect(buildSftpToastMessage("")).toEqual({
      text: "",
      tone: "neutral",
    });
  });

  it("builds real remote SFTP connection control display states", () => {
    expect(buildSftpRemoteConnectionControl()).toEqual({
      text: "连接真实 SFTP",
      tone: "pending",
      borderTone: "pending",
      disabled: false,
      opacity: 1,
    });
    expect(buildSftpRemoteConnectionControl({ loading: true })).toEqual({
      text: "连接中",
      tone: "pending",
      borderTone: "pending",
      disabled: true,
      opacity: 0.6,
    });
    expect(buildSftpRemoteConnectionControl({ connected: true })).toEqual({
      text: "真实 SFTP 已连接",
      tone: "success",
      borderTone: "success",
      disabled: false,
      opacity: 1,
    });
    expect(buildSftpRemoteConnectionControl({ connected: true, loading: true })).toMatchObject({
      text: "连接中",
      tone: "success",
      disabled: true,
    });
  });

  it("builds SFTP page chrome display metadata", () => {
    expect(buildSftpPageDisplay({
      hostName: " prod-web ",
      routeSummary: "经出口代理 · 2 跳",
      routeTitle: "本机 -> proxy -> bastion -> prod-web",
      queueSummary: { totalCount: 2, canClearCompleted: true },
      editorSaving: true,
    })).toEqual({
      backLabel: "← 返回",
      pageTitle: "SFTP 文件传输",
      hostName: "prod-web",
      routeBadgeTitle: "文件流量路径: 本机 -> proxy -> bastion -> prod-web",
      routeBadgeText: "文件流量 · 经出口代理 · 2 跳",
      queueTitle: "传输队列",
      queueEmptyText: "选中文件后点击 → 或 ← 传输;断点续传自动启用",
      clearCompletedVisible: true,
      clearCompletedText: "清除已完成",
      clearCompletedDisabled: false,
      clearCompletedOpacity: 1,
      clearCompletedCursor: "pointer",
      editorTitle: "✎ 在线编辑",
      editorCancelText: "取消",
      editorCancelDisabled: true,
      editorCancelOpacity: 0.5,
    });

    expect(buildSftpPageDisplay({
      hostName: "",
      routeSummary: "",
      queueSummary: { totalCount: 1, canClearCompleted: false },
    })).toMatchObject({
      hostName: "未命名主机",
      routeBadgeTitle: "文件流量路径: 直连",
      routeBadgeText: "文件流量 · 直连",
      clearCompletedVisible: true,
      clearCompletedDisabled: true,
      clearCompletedOpacity: 0.45,
      clearCompletedCursor: "not-allowed",
      editorCancelDisabled: false,
      editorCancelOpacity: 1,
    });

    expect(buildSftpPageDisplay().clearCompletedVisible).toBe(false);
  });

  it("labels failed, materializing and preview queue states consistently", () => {
    expect(buildTransferQueueDisplay({
      status: "failed",
      progress: 60,
      totalSize: 0,
    })).toMatchObject({
      statusLabel: "× 失败",
      statusTone: "error",
      metrics: "—",
    });

    expect(buildTransferQueueDisplay({
      status: "done",
      materializing: true,
      totalSize: 0,
      rateLabel: "—",
    })).toMatchObject({
      statusLabel: "传输中",
      statusTone: "active",
      metrics: "—",
      active: true,
    });

    expect(buildTransferQueueDisplay({
      status: "run",
      progress: 42,
      size: 2048,
    }, { formatSize: bytes => `${bytes}B` })).toMatchObject({
      statusLabel: "42%",
      statusTone: "active",
      metrics: "860B / 2048B · 模拟",
    });
  });

  it("tracks SFTP editor dirty state before closing", () => {
    const editor = buildSftpEditorState({
      side: "remote",
      name: "nginx.conf",
      path: ["etc"],
      content: "server {}",
    });

    expect(editor).toMatchObject({
      content: "server {}",
      originalContent: "server {}",
    });
    expect(hasSftpEditorUnsavedChanges(editor)).toBe(false);
    expect(hasSftpEditorUnsavedChanges({ ...editor, content: "server { listen 80; }" })).toBe(true);
    expect(hasSftpEditorUnsavedChanges({ content: "legacy" })).toBe(false);
    expect(buildSftpEditorCloseConfirmation(editor)).toBe("放弃未保存的编辑?\n\nnginx.conf");
    expect(buildSftpEditorCloseConfirmation({ name: " " })).toBe("放弃未保存的编辑?\n\n当前文件");
  });

  it("builds SFTP editor display state for save targets and dirty status", () => {
    expect(buildSftpEditorDisplay({
      side: "local",
      name: "app.conf",
      path: "/tmp/app.conf",
      content: "next",
      originalContent: "old",
    })).toMatchObject({
      titlePath: "/tmp/app.conf",
      saveHint: "保存后直接写回本地文件",
      saveButtonText: "保存到本地",
      saveDisabled: false,
      statusText: "有未保存更改",
      tone: "pending",
      dirty: true,
    });

    expect(buildSftpEditorDisplay({
      side: "remote-real",
      name: "nginx.conf",
      path: "/etc/nginx/nginx.conf",
      content: "same",
      originalContent: "same",
    })).toMatchObject({
      titlePath: "/etc/nginx/nginx.conf",
      saveHint: "保存后经 SFTP 直接写回远端",
      saveButtonText: "写回远端",
      saveDisabled: true,
      statusText: "无未保存更改",
      tone: "neutral",
      dirty: false,
    });

    expect(buildSftpEditorDisplay({
      side: "remote",
      name: "index.html",
      path: ["site", "public"],
      content: "next",
      originalContent: "old",
      saving: true,
    })).toMatchObject({
      titlePath: "/var/www/site/public/index.html",
      saveHint: "保存后更新演示远端文件",
      saveButtonText: "保存中",
      saveDisabled: true,
      textareaDisabled: true,
      statusText: "正在保存…",
      saving: true,
    });
  });
});
