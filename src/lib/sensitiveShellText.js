export function isSensitiveShellText(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  return [
    /(^|\s)(?:[A-Za-z_][A-Za-z0-9_]*_)?(?:password|passwd|passphrase|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)s?\s*=/i,
    /(^|\s)--(?:password|passwd|passphrase|secret|token|api-key|access-key|private-key|credential)(?:=|\s|$)/i,
    /(^|\s)(?:sshpass|docker\s+login|podman\s+login)\b.*\s-(?:p|P)(?:\s+\S+|=\S+)/i,
    /(^|\s)(?:mysql|mysqldump)\b.*\s-p\S+/i,
    /(^|[\s'"])authorization\s*:\s*(?:bearer|basic)\s+\S+/i,
  ].some(pattern => pattern.test(text));
}
