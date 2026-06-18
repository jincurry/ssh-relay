import { isMetaShortcutEvent } from "./shortcuts.js";

export function getGlobalShortcutAction(event, { page = "" } = {}) {
  if (isMetaShortcutEvent(event, "k", { allowEditable: true })) return "palette";
  if (isMetaShortcutEvent(event, ";", { allowEditable: true }) && page !== "session") {
    return "snippets";
  }
  return "";
}
