import { isMetaShortcutEvent } from "./shortcuts.js";

export function getGlobalShortcutAction(event, { page = "", platform } = {}) {
  if (isMetaShortcutEvent(event, "k", { allowEditable: true, platform })) return "palette";
  if (isMetaShortcutEvent(event, ";", { allowEditable: true, platform }) && page !== "session") {
    return "snippets";
  }
  return "";
}
