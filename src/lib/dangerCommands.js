const DANGER_RULES = [
  {
    id: "recursive-delete",
    label: "递归删除文件",
    test: segment => isCommand(segment, "rm") && hasRecursiveFlag(segment) && hasDestructivePath(segment),
  },
  {
    id: "service-control",
    label: "停止或重启服务",
    test: segment => (
      isCommand(segment, "systemctl") && /\b(?:restart|stop|disable|mask)\b/i.test(segment)
    ) || (
      isCommand(segment, "service") && /\b(?:restart|stop)\b/i.test(segment)
    ),
  },
  {
    id: "system-power",
    label: "重启或关闭系统",
    test: segment => /^(?:reboot|shutdown|poweroff|halt)\b/i.test(segment) || isSystemctlPowerCommand(segment),
  },
  {
    id: "format-disk",
    label: "格式化磁盘",
    test: segment => /^(?:mkfs|mkfs\.[\w-]+|mkswap)\b/i.test(segment),
  },
  {
    id: "raw-device-write",
    label: "直接写入块设备",
    test: segment => isCommand(segment, "dd") && /\bof=\/dev\/\S+/i.test(segment),
  },
  {
    id: "permission-root",
    label: "递归修改系统权限",
    test: segment => /^(?:chmod|chown|chgrp)\b/i.test(segment) && hasRecursiveFlag(segment) && hasDestructivePath(segment),
  },
  {
    id: "orchestrator-delete",
    label: "删除容器或集群资源",
    test: segment => (
      isCommand(segment, "kubectl") && /\bdelete\b/i.test(segment)
    ) || (
      isCommand(segment, "docker") && /\b(?:rm|rmi|volume\s+rm|system\s+prune)\b/i.test(segment)
    ),
  },
];

export function detectDangerousCommand(command) {
  const segments = splitShellSegments(command)
    .flatMap(segment => expandShellWrappedSegments(stripCommandPrefixes(segment)))
    .filter(Boolean);
  for (const segment of segments) {
    const rule = DANGER_RULES.find(item => item.test(segment));
    if (rule) {
      return {
        danger: true,
        id: rule.id,
        label: rule.label,
        segment,
      };
    }
  }
  return { danger: false };
}

export function buildDangerConfirmation(command, finding = detectDangerousCommand(command)) {
  if (!finding.danger) return "";
  return `即将执行危险命令: ${finding.label}\n\n${finding.segment}\n\n确认继续发送到远端会话?`;
}

function splitShellSegments(command) {
  const text = String(command || "");
  const segments = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n" || char === ";") {
      pushSegment(segments, current);
      current = "";
      continue;
    }
    if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
      pushSegment(segments, current);
      current = "";
      index += 1;
      continue;
    }
    current += char;
  }

  pushSegment(segments, current);
  return segments;
}

function pushSegment(segments, value) {
  const segment = value.trim();
  if (segment) segments.push(segment);
}

function stripCommandPrefixes(segment) {
  let current = segment.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const next = current
      .replace(/^(?:sudo|doas|command|nohup)\s+/i, "")
      .replace(/^env\s+(?:-[^\s]+\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*/i, "")
      .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)+/, "")
      .trim();
    if (next !== current) {
      current = next;
      changed = true;
    }
  }
  return current;
}

function expandShellWrappedSegments(segment, depth = 0) {
  const current = segment.trim();
  if (!current || depth > 3) return current ? [current] : [];
  const inner = extractShellCommandString(current);
  if (!inner) return [current];
  return [current, ...splitShellSegments(inner).flatMap(part => expandShellWrappedSegments(stripCommandPrefixes(part), depth + 1))];
}

function extractShellCommandString(segment) {
  const match = segment.match(/^(?:\/usr\/bin\/|\/bin\/|\/usr\/local\/bin\/)?(?:ba|z|da)?sh\s+(?:-[A-Za-z]*c[A-Za-z]*\s+)+(.+)$/i);
  if (!match) return null;
  return parseShellWord(match[1].trim());
}

function parseShellWord(value) {
  if (!value) return "";
  const quote = value[0];
  if (quote !== "'" && quote !== "\"") return value.split(/\s+/)[0] || "";
  let out = "";
  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && quote === "\"" && index + 1 < value.length) {
      out += value[index + 1];
      index += 1;
      continue;
    }
    if (char === quote) return out;
    out += char;
  }
  return out;
}

function isCommand(segment, command) {
  return new RegExp(`^(?:/usr/bin/|/bin/|/usr/local/bin/)?${escapeRegExp(command)}\\b`, "i").test(segment);
}

function hasShortFlag(segment, flag) {
  return new RegExp(`\\s-[A-Za-z]*${escapeRegExp(flag)}[A-Za-z]*\\b`).test(segment);
}

function hasRecursiveFlag(segment) {
  return hasShortFlag(segment, "r") || hasShortFlag(segment, "R") || /\s--recursive\b/i.test(segment);
}

function isSystemctlPowerCommand(segment) {
  return isCommand(segment, "systemctl") && /\b(?:reboot|poweroff|halt|shutdown|suspend|hibernate|hybrid-sleep)\b/i.test(segment);
}

function hasDestructivePath(segment) {
  return /\s(?:--\s+)?(?:\/(?:\S*)?|~(?:\/\S*)?|\.\.(?:\/\S*)?)(?=\s|$)/i.test(segment);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
