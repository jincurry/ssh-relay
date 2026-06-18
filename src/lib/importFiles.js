export function getFirstSelectedFile(files) {
  return Array.from(files || [])[0] || null;
}

export function getReadableSelectedFile(files, { emptyMessage = "请选择要导入的文件", unreadableMessage = "无法读取所选文件" } = {}) {
  const file = getFirstSelectedFile(files);
  if (!file) return { ok: false, file: null, reason: emptyMessage };
  if (typeof file.text !== "function") return { ok: false, file: null, reason: unreadableMessage };
  return { ok: true, file, reason: "" };
}

export function resetFileInput(input) {
  if (!input || !Object.prototype.hasOwnProperty.call(input, "value")) return false;
  input.value = "";
  return true;
}

export function buildSshConfigImportDropzoneDisplay(status = {}) {
  const statusText = String(status?.text || "").trim();
  const tone = status?.tone === "error" ? "error" : status?.tone === "pending" ? "pending" : status?.tone === "neutral" ? "neutral" : "success";
  return {
    prefix: "拖入或点击选择",
    pathLabel: "~/.ssh/config",
    suffix: "一键导入主机",
    title: "导入 OpenSSH config",
    statusText,
    statusTone: tone,
    statusVisible: Boolean(statusText),
  };
}
