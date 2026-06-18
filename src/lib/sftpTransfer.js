export function joinRemotePath(parent, name) {
  const base = String(parent || ".").trim();
  if (!base || base === ".") return name;
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

export function joinLocalPath(parent, name) {
  const base = String(parent || "").trim();
  if (!base) return name;
  const child = String(name || "");
  if (base === "/") return `/${child}`;
  if (/^[A-Za-z]:[\\/]?$/.test(base)) {
    const separator = base.endsWith("/") ? "/" : "\\";
    return `${base.replace(/[\\/]*$/, "")}${separator}${child}`;
  }
  const separator = inferLocalPathSeparator(base);
  return `${base.replace(/[\\/]+$/, "")}${separator}${child}`;
}

function inferLocalPathSeparator(path) {
  const value = String(path || "");
  const lastSlash = value.lastIndexOf("/");
  const lastBackslash = value.lastIndexOf("\\");
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return lastSlash > lastBackslash ? "/" : "\\";
  }
  return lastBackslash > lastSlash ? "\\" : "/";
}

export function buildTreePathBreadcrumbs(root, path = []) {
  const safeRoot = String(root || "").trim() || ".";
  const parts = Array.isArray(path) ? path.map(part => String(part || "").trim()).filter(Boolean) : [];
  return [
    { label: safeRoot, path: [] },
    ...parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1),
    })),
  ];
}

export function buildFileSystemPathBreadcrumbs(path) {
  const text = String(path || ".").trim() || ".";
  const windowsRoot = text.match(/^([A-Za-z]:)[\\/]*(.*)$/);

  if (windowsRoot) {
    const root = `${windowsRoot[1]}\\`;
    const parts = windowsRoot[2].split(/[\\/]+/).filter(Boolean);
    return [
      { label: root, path: root },
      ...parts.map((part, index) => ({
        label: part,
        path: root + parts.slice(0, index + 1).join("\\"),
      })),
    ];
  }

  if (text.startsWith("/")) {
    const parts = text.split("/").filter(Boolean);
    return [
      { label: "/", path: "/" },
      ...parts.map((part, index) => ({
        label: part,
        path: `/${parts.slice(0, index + 1).join("/")}`,
      })),
    ];
  }

  const parts = text.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return [{ label: ".", path: "." }];
  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

export function buildSftpFilePaneDisplay({
  title = "",
  entries = [],
  editable = false,
  refreshable = false,
  creatable = false,
  mockable = false,
  canGoUp = false,
} = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return {
    title: String(title || "").trim() || "文件",
    upText: "↑ 上级",
    refreshTitle: "刷新",
    refreshIcon: "⟳",
    createDirTitle: "新建文件夹",
    createDirIcon: "＋",
    editText: "✎ 编辑",
    mockTitle: "回到演示远端",
    mockText: "演示",
    emptyText: "空目录 — 从另一侧传输文件,或拖入本窗口",
    hasEntries: safeEntries.length > 0,
    editable: Boolean(editable),
    refreshable: Boolean(refreshable),
    creatable: Boolean(creatable),
    mockable: Boolean(mockable),
    canGoUp: Boolean(canGoUp),
  };
}

export function buildSftpNewFolderPromptLabel({ side = "remote", mode = "preview", path = ".", pathSegments = [] } = {}) {
  const sideLabel = side === "local" ? "本地" : "远端";
  const modeLabel = mode === "real" ? "真实" : "预览";
  const location = mode === "real"
    ? String(path || ".").trim() || "."
    : formatTreePromptPath(side, pathSegments);
  return `新建${modeLabel}${sideLabel}文件夹名称\n\n父目录: ${location}`;
}

export function buildSftpLocalFolderCreateErrorState(error) {
  const message = String(error?.message || error || "本地目录创建失败").trim() || "本地目录创建失败";
  return {
    message,
    tone: "error",
    resetCachedAuth: false,
    timeoutMs: 2200,
  };
}

function entryKind(entry) {
  return entry?.kind || entry?.type || "";
}

function formatTreePromptPath(side, pathSegments) {
  const root = side === "local" ? "本地根目录" : "远端根目录";
  const parts = Array.isArray(pathSegments)
    ? pathSegments.map(part => String(part || "").trim()).filter(Boolean)
    : [];
  return parts.length ? `${root}/${parts.join("/")}` : root;
}

export function describeUnsupportedTransferEntry(entry, role) {
  const kind = entryKind(entry);
  if (kind === "file" || kind === "dir") return null;
  if (kind === "symlink") return `${entry?.name || role} 是符号链接, 当前不跟随链接传输`;
  return `${entry?.name || role} 不是可传输的文件或目录`;
}

function validateTransferEntry(entry, role) {
  return describeUnsupportedTransferEntry(entry, role);
}

export function calculateTransferProgress({ transferred = 0, totalSize = 0, startedAt, now = Date.now() }) {
  const total = Math.max(0, Number(totalSize) || 0);
  const bytes = Math.max(0, Math.min(Number(transferred) || 0, total || Number(transferred) || 0));
  const elapsedMs = Math.max(0, Number(now) - Number(startedAt || now));
  const rateBytesPerSecond = elapsedMs > 0 ? Math.round((bytes / elapsedMs) * 1000) : 0;
  return {
    progress: total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 100,
    transferred: bytes,
    totalSize: total,
    rateBytesPerSecond,
    rateLabel: formatTransferRate(rateBytesPerSecond),
  };
}

export function shouldPublishTransferProgress({
  transferred = 0,
  totalSize = 0,
  lastTransferred = 0,
  lastProgress = 0,
  lastPublishedAt = 0,
  now = Date.now(),
  minIntervalMs = 120,
  minProgressDelta = 1,
  force = false,
} = {}) {
  if (force) return true;
  const current = calculateTransferProgress({ transferred, totalSize, startedAt: now, now });
  if (!Number(lastPublishedAt)) return true;
  if (current.transferred <= Number(lastTransferred || 0)) return false;
  if (current.progress >= 100) return true;
  if (current.progress - Number(lastProgress || 0) >= minProgressDelta) return true;
  return Number(now) - Number(lastPublishedAt) >= minIntervalMs;
}

export function formatTransferRate(bytesPerSecond) {
  const rate = Math.max(0, Number(bytesPerSecond) || 0);
  if (!rate) return "—";
  if (rate >= 1024 * 1024) return `${(rate / 1024 / 1024).toFixed(1)} MB/s`;
  if (rate >= 1024) return `${Math.round(rate / 1024)} KB/s`;
  return `${Math.round(rate)} B/s`;
}

export function planRealSftpFileTransfer({ direction, localEntry, remoteEntry, localListing, remoteListing }) {
  if (direction === "down") {
    if (!localListing) {
      return { ok: false, reason: "真实远端下载需要先读取本地目录" };
    }
    if (!remoteEntry) {
      return { ok: false, reason: "请选择一个真实远端文件" };
    }
    const unsupported = validateTransferEntry(remoteEntry, "远端条目");
    if (unsupported) {
      return { ok: false, reason: unsupported };
    }
    const localTarget = (localListing.entries || []).find(entry => entry.name === remoteEntry.name);
    const sourceKind = entryKind(remoteEntry);
    let resumeOffset = 0;
    if (localTarget) {
      const targetKind = entryKind(localTarget);
      if (targetKind && targetKind !== "file" && targetKind !== "dir") {
        return { ok: false, reason: describeUnsupportedTransferEntry(localTarget, "本地目标") };
      }
      const sourceSize = Number(remoteEntry.size) || 0;
      const targetSize = Number(localTarget.size) || 0;
      if (sourceKind === "file" && targetKind === "file" && targetSize > sourceSize) {
        return { ok: false, reason: `${remoteEntry.name} 本地文件大于远端文件, 无法断点续传` };
      } else if (sourceKind === "file" && targetKind === "file" && targetSize < sourceSize) {
        resumeOffset = targetSize;
      } else if (sourceKind === "file" && targetKind === "file" && targetSize === sourceSize) {
        resumeOffset = targetSize;
      } else if (sourceKind === "dir" && targetKind === "dir") {
        resumeOffset = 0;
      } else if (sourceKind === "dir") {
        return { ok: false, reason: `${remoteEntry.name} 已作为文件存在于本地目录` };
      } else if (targetKind === "dir") {
        return { ok: false, reason: `${remoteEntry.name} 已作为目录存在于本地目录` };
      } else {
        return { ok: false, reason: `${remoteEntry.name} 已存在于本地目录` };
      }
    }
    return {
      ok: true,
      name: remoteEntry.name,
      size: remoteEntry.size,
      sourceKind,
      localTargetPath: localListing.path,
      remoteSourcePath: remoteEntry.path,
      existsLocal: Boolean(localTarget),
      existingLocalKind: entryKind(localTarget),
      skip: sourceKind === "file" && entryKind(localTarget) === "file" && resumeOffset === (Number(remoteEntry.size) || 0),
      resumeOffset,
    };
  }

  if (!localListing) {
    return { ok: false, reason: "真实远端上传需要先读取本地目录" };
  }
  if (!remoteListing) {
    return { ok: false, reason: "真实远端上传需要先连接 SFTP" };
  }
  if (!localEntry) {
    return { ok: false, reason: "请选择一个本地文件" };
  }
  const unsupported = validateTransferEntry(localEntry, "本地条目");
  if (unsupported) {
    return { ok: false, reason: unsupported };
  }
  const sourceKind = entryKind(localEntry);
  const existingRemote = (remoteListing.entries || []).find(entry => entry.name === localEntry.name);
  const existingRemoteKind = entryKind(existingRemote);
  if (existingRemoteKind && existingRemoteKind !== "file" && existingRemoteKind !== "dir") {
    return { ok: false, reason: describeUnsupportedTransferEntry(existingRemote, "远端目标") };
  }
  if (sourceKind === "dir" && existingRemote && entryKind(existingRemote) !== "dir") {
    return { ok: false, reason: `${localEntry.name} 已作为文件存在于真实远端目录` };
  }
  if (sourceKind !== "dir" && existingRemoteKind === "dir") {
    return { ok: false, reason: `${localEntry.name} 已作为目录存在于真实远端目录` };
  }
  let resumeOffset = 0;
  const sourceSize = Number(localEntry.size) || 0;
  const targetSize = Number(existingRemote?.size) || 0;
  if (sourceKind === "file" && existingRemoteKind === "file" && targetSize > sourceSize) {
    return { ok: false, reason: `${localEntry.name} 真实远端文件大于本地文件, 无法断点续传` };
  }
  if (sourceKind === "file" && existingRemoteKind === "file" && targetSize < sourceSize) {
    resumeOffset = targetSize;
  }
  if (sourceKind === "file" && existingRemoteKind === "file" && targetSize === sourceSize) {
    resumeOffset = targetSize;
  }
  return {
    ok: true,
    existsRemote: Boolean(existingRemote),
    existingRemoteKind,
    name: localEntry.name,
    size: localEntry.size,
    sourceKind,
    localSourcePath: localEntry.path,
    remoteTargetPath: remoteListing.path,
    skip: sourceKind === "file" && existingRemoteKind === "file" && resumeOffset === sourceSize,
    resumeOffset,
  };
}

export function planRecursiveSftpFileTransfer({ direction, sourceEntry, existingTarget }) {
  const sourceName = sourceEntry?.name || "文件";
  const sourceKind = entryKind(sourceEntry);
  const sourceSize = Number(sourceEntry?.size) || 0;
  const targetKind = entryKind(existingTarget);

  if (sourceKind !== "file") {
    const unsupported = describeUnsupportedTransferEntry(
      sourceEntry,
      direction === "up" ? "本地条目" : "远端条目",
    );
    return { ok: false, reason: unsupported || `${sourceName} 不是可传输的文件` };
  }

  if (targetKind === "dir") {
    return {
      ok: false,
      reason: direction === "up"
        ? `${sourceName} 已作为目录存在于真实远端目录`
        : `${sourceName} 已作为目录存在于本地目录`,
    };
  }

  if (existingTarget && targetKind !== "file") {
    const unsupported = describeUnsupportedTransferEntry(existingTarget, "目标条目");
    return { ok: false, reason: unsupported || `${sourceName} 已存在于目标目录` };
  }

  const targetSize = Number(existingTarget?.size) || 0;
  if (targetKind === "file" && targetSize > sourceSize) {
    return {
      ok: false,
      reason: direction === "up"
        ? `${sourceName} 真实远端文件大于本地文件, 无法断点续传`
        : `${sourceName} 本地文件大于远端文件, 无法断点续传`,
    };
  }

  if (targetKind === "file" && targetSize === sourceSize) {
    return { ok: true, skip: true, resumeOffset: sourceSize };
  }

  return {
    ok: true,
    skip: false,
    resumeOffset: targetKind === "file" ? targetSize : 0,
  };
}

export function buildRecursiveSftpWorkFile({ plan, localPath, remotePath, size } = {}) {
  const totalSize = Math.max(0, Number(size) || 0);
  const resumeOffset = normalizeTransferred(plan?.resumeOffset, totalSize);
  const skip = Boolean(plan?.skip);
  return {
    localPath,
    remotePath,
    size: totalSize,
    resumeOffset,
    skip,
  };
}

export function summarizeRecursiveSftpWorkFiles(files = []) {
  const items = Array.isArray(files) ? files : [];
  return items.reduce((summary, file) => {
    const size = Math.max(0, Number(file?.size) || 0);
    const transferred = normalizeTransferred(file?.resumeOffset, size);
    return {
      totalSize: summary.totalSize + size,
      transferred: summary.transferred + transferred,
      skippedCount: summary.skippedCount + (file?.skip ? 1 : 0),
    };
  }, { totalSize: 0, transferred: 0, skippedCount: 0 });
}

export function getSftpTransferAvailability({
  direction,
  localEntry = null,
  remoteEntry = null,
  mockLocalEntry = null,
  mockRemoteEntry = null,
  localListing = null,
  remoteListing = null,
} = {}) {
  if (direction === "up") {
    if (remoteListing) {
      return transferPlanAvailability(planRealSftpFileTransfer({
        direction: "up",
        localEntry,
        localListing,
        remoteListing,
      }));
    }
    if (localListing) {
      return validatePreviewRealFileSelection(localEntry, "本地文件", "真实本地目录上传需要先连接真实远端 SFTP");
    }
    return validatePreviewTreeSelection(mockLocalEntry, "本地文件");
  }

  if (remoteListing) {
    return transferPlanAvailability(planRealSftpFileTransfer({
      direction: "down",
      localListing,
      remoteEntry,
    }));
  }
  if (localListing) {
    return validatePreviewRealFileSelection(mockRemoteEntry, "远端文件", "演示远端目录下载到真实本地需要连接真实远端 SFTP");
  }
  return validatePreviewTreeSelection(mockRemoteEntry, "远端文件");
}

export function buildSftpDirectionButtonDisplay({ direction, availability, realRemote = false } = {}) {
  const ready = Boolean(availability?.ready);
  const normalizedDirection = direction === "down" ? "down" : "up";
  const action = normalizedDirection === "up" ? "上传" : "下载";
  const realTarget = normalizedDirection === "up" ? "到真实远端" : "到本地";
  return {
    text: normalizedDirection === "up" ? "→" : "←",
    title: ready ? `${action}所选${realRemote ? realTarget : ""}` : String(availability?.reason || "当前选择不可传输"),
    disabled: !ready,
    tone: ready ? "pending" : "neutral",
    borderTone: ready ? "pending" : "neutral",
    opacity: ready ? 1 : 0.5,
    ready,
  };
}

export function buildSftpPaneStatusMessage({ loading = false, error = "", empty = false, side = "local" } = {}) {
  if (loading) {
    return {
      visible: true,
      text: side === "remote" ? "正在读取真实远端目录…" : "正在读取本地目录…",
      tone: "pending",
    };
  }

  const errorText = String(error || "").trim();
  if (errorText) {
    return {
      visible: true,
      text: errorText,
      tone: "error",
    };
  }

  if (empty) {
    return {
      visible: true,
      text: side === "remote" ? "远端目录为空" : "空目录",
      tone: "neutral",
    };
  }

  return {
    visible: false,
    text: "",
    tone: "neutral",
  };
}

export function buildStreamingTransferQueueItem({ id = Date.now(), direction, plan, startedAt = id } = {}) {
  const dir = direction === "up" ? "up" : "down";
  const totalSize = Math.max(0, Number(plan?.size) || 0);
  const resumeOffset = normalizeTransferred(plan?.resumeOffset, totalSize);
  const skip = Boolean(plan?.skip);
  const progress = skip || totalSize === 0 ? 100 : Math.min(99, Math.round((resumeOffset / totalSize) * 100));
  const base = {
    id,
    name: plan?.name,
    size: plan?.size,
    totalSize,
    dir,
    toPath: dir === "up" ? plan?.remoteTargetPath : plan?.localTargetPath,
    sourceKind: plan?.sourceKind,
    resumeOffset,
    transferred: resumeOffset,
    startedAt,
    rateLabel: skip ? "已存在" : "—",
    progress,
    status: skip ? "done" : "stream",
    skip,
    materialized: skip,
  };

  if (dir === "up") {
    return {
      ...base,
      localSourcePath: plan?.localSourcePath,
      sourceEditable: true,
      remoteTargetPath: plan?.remoteTargetPath,
      rootExists: Boolean(plan?.existsRemote),
    };
  }

  return {
    ...base,
    localTargetPath: plan?.localTargetPath,
    remoteSourcePath: plan?.remoteSourcePath,
    existsLocal: Boolean(plan?.existsLocal),
  };
}

export function buildSftpRemoteOverwriteConfirmation(plan) {
  const name = String(plan?.name || "").trim() || "所选条目";
  const sourceKind = entryKind({ kind: plan?.sourceKind }) || "file";
  const action = sourceKind === "dir" ? "合并上传到真实远端目录" : "覆盖真实远端文件";
  const localSource = String(plan?.localSourcePath || "").trim();
  const remoteTarget = joinRemotePath(plan?.remoteTargetPath || ".", name);
  const lines = [`${name} 已存在于真实远端目录。`, "", `确认${action}?`];
  if (localSource) lines.push("", `本地来源: ${localSource}`);
  lines.push("", `远端目标: ${remoteTarget}`);
  lines.push(
    "",
    sourceKind === "dir"
      ? "同名目录会被合并,冲突文件可能被后续上传覆盖。"
      : "远端同名文件会被本地文件内容替换。",
  );
  return lines.join("\n");
}

export function isActiveTransferQueueItem(item) {
  return item?.status === "run" || item?.status === "stream" || Boolean(item?.materializing);
}

export function isCompletedTransferQueueItem(item) {
  return item?.status === "done" && !item?.materializing;
}

export function clearCompletedTransferQueue(queue) {
  if (!Array.isArray(queue)) return [];
  return queue.filter(item => !isCompletedTransferQueueItem(item));
}

export function buildTransferQueueSummary(queue) {
  const items = Array.isArray(queue) ? queue : [];
  const activeCount = items.filter(isActiveTransferQueueItem).length;
  const failedCount = items.filter(item => item?.status === "failed").length;
  const completedCount = items.filter(isCompletedTransferQueueItem).length;

  if (failedCount > 0) {
    return {
      visible: true,
      text: `${failedCount} 个失败`,
      tone: "error",
      activeCount,
      failedCount,
      completedCount,
      totalCount: items.length,
      canClearCompleted: completedCount > 0,
    };
  }

  if (activeCount > 0) {
    return {
      visible: true,
      text: `${activeCount} 个进行中`,
      tone: "pending",
      activeCount,
      failedCount,
      completedCount,
      totalCount: items.length,
      canClearCompleted: completedCount > 0,
    };
  }

  return {
    visible: items.length > 0,
    text: items.length > 0 ? "✓ 全部完成" : "",
    tone: items.length > 0 ? "success" : "neutral",
    activeCount,
    failedCount,
    completedCount,
    totalCount: items.length,
    canClearCompleted: completedCount > 0,
  };
}

export function buildSftpToastMessage(message) {
  const text = String(message || "").trim();
  if (!text) return { text: "", tone: "neutral" };
  if (text.startsWith("✓") || text.includes("已刷新")) return { text, tone: "success" };
  if (text.startsWith("正在")) return { text, tone: "pending" };
  return { text, tone: "error" };
}

export function buildSftpRemoteConnectionControl({ connected = false, loading = false } = {}) {
  const isLoading = Boolean(loading);
  const isConnected = Boolean(connected);
  return {
    text: isLoading ? "连接中" : isConnected ? "真实 SFTP 已连接" : "连接真实 SFTP",
    tone: isConnected ? "success" : "pending",
    borderTone: isConnected ? "success" : "pending",
    disabled: isLoading,
    opacity: isLoading ? 0.6 : 1,
  };
}

export function buildSftpPageDisplay({
  hostName = "",
  routeSummary = "",
  routeTitle = "",
  queueSummary = {},
  editorSaving = false,
} = {}) {
  const safeHostName = String(hostName || "").trim() || "未命名主机";
  const safeRouteSummary = String(routeSummary || "").trim() || "直连";
  const safeRouteTitle = String(routeTitle || "").trim() || safeRouteSummary;
  const totalCount = Math.max(0, Number(queueSummary?.totalCount) || 0);
  const canClearCompleted = Boolean(queueSummary?.canClearCompleted);
  const saving = Boolean(editorSaving);

  return {
    backLabel: "← 返回",
    pageTitle: "SFTP 文件传输",
    hostName: safeHostName,
    routeBadgeTitle: `文件流量路径: ${safeRouteTitle}`,
    routeBadgeText: `文件流量 · ${safeRouteSummary}`,
    queueTitle: "传输队列",
    queueEmptyText: "选中文件后点击 → 或 ← 传输;断点续传自动启用",
    clearCompletedVisible: totalCount > 0,
    clearCompletedText: "清除已完成",
    clearCompletedDisabled: !canClearCompleted,
    clearCompletedOpacity: canClearCompleted ? 1 : 0.45,
    clearCompletedCursor: canClearCompleted ? "pointer" : "not-allowed",
    editorTitle: "✎ 在线编辑",
    editorCancelText: "取消",
    editorCancelDisabled: saving,
    editorCancelOpacity: saving ? 0.5 : 1,
  };
}

export function normalizeTransferQueueItem(item = {}) {
  const totalSize = Math.max(0, Number(item.totalSize ?? item.size ?? 0) || 0);
  const progress = normalizeProgress(item.progress, item.status === "done" ? 100 : 0);
  const inferredTransferred = item.status === "done"
    ? totalSize
    : Math.round(totalSize * (progress / 100));
  const rawTransferred = Number(item.transferred ?? inferredTransferred);
  const transferred = normalizeTransferred(rawTransferred, totalSize);

  return {
    ...item,
    dir: item.dir === "up" ? "up" : "down",
    progress,
    totalSize,
    transferred,
  };
}

export function buildTransferQueueDisplay(item = {}, { formatSize = formatTransferSize } = {}) {
  const normalized = normalizeTransferQueueItem(item);
  const active = isActiveTransferQueueItem(item);
  const directionLabel = normalized.dir === "up" ? "↑ 上传" : "↓ 下载";
  const rateLabel = getTransferQueueRateLabel(item);
  const metrics = buildTransferQueueMetrics(normalized, rateLabel, formatSize);
  const status = getTransferQueueStatus(item, normalized);

  return {
    ...normalized,
    directionLabel,
    metrics,
    rateLabel,
    active,
    statusLabel: status.label,
    statusTone: status.tone,
  };
}

export function buildSftpEditorState({ side, name, path, content } = {}) {
  const text = String(content ?? "");
  return {
    side,
    name,
    path,
    content: text,
    originalContent: text,
  };
}

export function buildSftpEditorDisplay(editor) {
  const side = editor?.side || "remote";
  const name = String(editor?.name || "").trim() || "当前文件";
  const saving = Boolean(editor?.saving);
  const dirty = hasSftpEditorUnsavedChanges(editor);
  return {
    titlePath: buildSftpEditorTitlePath(editor, name),
    saveHint: side === "local"
      ? "保存后直接写回本地文件"
      : side === "remote-real"
        ? "保存后经 SFTP 直接写回远端"
        : "保存后更新演示远端文件",
    saveButtonText: saving
      ? "保存中"
      : side === "local"
        ? "保存到本地"
        : side === "remote-real"
          ? "写回远端"
          : "保存并上传",
    saveDisabled: saving || !dirty,
    textareaDisabled: saving,
    statusText: saving ? "正在保存…" : dirty ? "有未保存更改" : "无未保存更改",
    tone: saving || dirty ? "pending" : "neutral",
    dirty,
    saving,
    name,
  };
}

export function hasSftpEditorUnsavedChanges(editor) {
  if (!editor) return false;
  const current = String(editor.content ?? "");
  const original = Object.prototype.hasOwnProperty.call(editor, "originalContent")
    ? String(editor.originalContent ?? "")
    : current;
  return current !== original;
}

export function buildSftpEditorCloseConfirmation(editor) {
  const name = String(editor?.name || "").trim() || "当前文件";
  return `放弃未保存的编辑?\n\n${name}`;
}

function buildSftpEditorTitlePath(editor, fallbackName) {
  const side = editor?.side || "remote";
  if (side === "local" || side === "remote-real") {
    return String(editor?.path || fallbackName || "当前文件");
  }
  const segments = Array.isArray(editor?.path) ? editor.path.filter(Boolean).map(segment => String(segment)) : [];
  const name = fallbackName || "当前文件";
  return `/var/www/${segments.length ? `${segments.join("/")}/` : ""}${name}`;
}

function normalizeProgress(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return normalizeProgress(fallback, 0);
  return Math.min(100, Math.max(0, next));
}

function normalizeTransferred(value, totalSize) {
  const next = Math.max(0, Number(value) || 0);
  return totalSize > 0 ? Math.min(next, totalSize) : next;
}

function getTransferQueueRateLabel(item) {
  if (item?.status === "run") return "模拟";
  if (item?.status === "stream" || item?.materializing) return item?.rateLabel || "—";
  if (item?.skip) return item?.rateLabel || "已存在";
  return "";
}

function getTransferQueueStatus(item, normalized) {
  if (item?.status === "failed") return { label: "× 失败", tone: "error" };
  if (item?.materializing) return { label: "传输中", tone: "active" };
  if (item?.status === "done") {
    return {
      label: item?.skip ? "✓ 已存在" : "✓ 完成",
      tone: "success",
    };
  }
  return {
    label: `${Math.floor(normalized.progress)}%`,
    tone: item?.status === "stream" || item?.status === "run" ? "active" : "neutral",
  };
}

function buildTransferQueueMetrics(item, rateLabel, formatSize) {
  const totalSize = item.totalSize;
  const transferred = item.transferred;
  const format = typeof formatSize === "function" ? formatSize : formatTransferSize;
  if (totalSize > 0) {
    const base = `${format(transferred)} / ${format(totalSize)}`;
    return rateLabel ? `${base} · ${rateLabel}` : base;
  }
  return rateLabel || "—";
}

function formatTransferSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${Math.round(size)} B`;
}

function transferPlanAvailability(plan) {
  return plan?.ok ? { ready: true, reason: "" } : { ready: false, reason: plan?.reason || "当前选择不可传输" };
}

function validatePreviewTreeSelection(entry, role) {
  if (!entry) return { ready: false, reason: `请选择一个${role}` };
  const unsupported = validateTransferEntry(entry, role);
  if (unsupported) return { ready: false, reason: unsupported };
  return { ready: true, reason: "" };
}

function validatePreviewRealFileSelection(entry, role, directoryReason) {
  if (!entry) return { ready: false, reason: `请选择一个${role}` };
  const kind = entryKind(entry);
  if (kind === "file") return { ready: true, reason: "" };
  if (kind === "dir") return { ready: false, reason: directoryReason };
  const unsupported = validateTransferEntry(entry, role);
  return { ready: false, reason: unsupported || `${entry?.name || role} 不是可传输的文件` };
}
