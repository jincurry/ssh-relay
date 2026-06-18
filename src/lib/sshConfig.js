const GLOB_CHARS = /[*?!]/;
const ADDITIVE_OPTIONS = new Set(["localforward", "remoteforward", "dynamicforward"]);

export function parseSshConfig(text) {
  const sections = [{ patterns: ["*"], options: new Map(), global: true }];
  let current = sections[0];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    const directive = parseDirective(splitShellWords(line));
    if (!directive) continue;

    const keyword = directive.keywordRaw.toLowerCase();
    if (keyword === "host") {
      current = { patterns: directive.args, options: new Map(), global: false };
      sections.push(current);
      continue;
    }

    if (keyword === "match") {
      current = null;
      continue;
    }

    if (!current) continue;
    if (!current.options.has(keyword)) current.options.set(keyword, []);
    current.options.get(keyword).push(directive.args.join(" "));
  }

  return sections.flatMap((section, index) => sectionToHosts(section, index, sections));
}

export function mergeImportedHosts(existingHosts, importedHosts) {
  const next = existingHosts.slice();
  const seen = new Set(existingHosts.map(hostKey));
  const maxId = existingHosts.reduce((max, host) => Math.max(max, Number(host.id) || 0), 0);
  let offset = 1;

  for (const host of importedHosts) {
    const key = hostKey(host);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ ...host, host: normalizeImportedHostAddress(host.host), id: maxId + offset });
    offset += 1;
  }

  return next;
}

function sectionToHosts(section, sectionIndex, sections) {
  if (section.global) return [];

  return section.patterns
    .filter(isImportablePattern)
    .map((pattern, patternIndex) => {
      const options = effectiveOptionsForHost(pattern, sections);
      const user = firstOption(options, "user") || defaultUser();
      const port = Number(firstOption(options, "port") || 22);
      const hostName = expandHostNameTokens(firstOption(options, "hostname"), {
        hostName: pattern,
        user,
        port: Number.isFinite(port) && port > 0 ? port : 22,
      });
      const proxyJump = firstOption(options, "proxyjump");
      const proxyCommand = normalizeProxyCommand(firstOption(options, "proxycommand"));
      const identity = firstOption(options, "identityfile");
      const hostKeyPolicy = parseStrictHostKeyChecking(firstOption(options, "stricthostkeychecking"));
      const connectTimeoutMs = parseConnectTimeoutMs(firstOption(options, "connecttimeout"));
      const serverAliveIntervalMs = parseServerAliveIntervalMs(firstOption(options, "serveraliveinterval"));
      const serverAliveCountMax = parseServerAliveCountMax(firstOption(options, "serveralivecountmax"));
      const jumpHosts = parseProxyJumpHosts(proxyJump, { fallbackUser: user, sections });
      const targetProxyCommand = jumpHosts.length ? null : proxyCommand;
      const forwards = parseForwardOptions(options, pattern);
      const host = normalizeImportedHostAddress(hostName || pattern);
      const tags = ["ssh-config"];
      if (identity) tags.push("key");
      if (targetProxyCommand) tags.push("proxy");
      if (forwards.length) tags.push("forward");
      if (hostKeyPolicy) tags.push("host-key");
      if (connectTimeoutMs) tags.push("timeout");
      if (serverAliveIntervalMs) tags.push("keepalive");
      if (port && port !== 22) tags.push(`:${port}`);

      return {
        id: `import-${sectionIndex}-${patternIndex}`,
        name: pattern,
        host,
        user,
        port: Number.isFinite(port) && port > 0 ? port : 22,
        group: "SSH Config",
        tags,
        status: "online",
        lat: [],
        chain: jumpHosts.map(jump => jump.name || jump.host),
        fav: false,
        proxy: targetProxyCommand ? { type: "cmd", cmd: targetProxyCommand } : undefined,
        jumpHosts: jumpHosts.length ? jumpHosts : undefined,
        forwards: forwards.length ? forwards : undefined,
        identityFile: identity,
        connectTimeoutMs,
        serverAliveIntervalMs,
        serverAliveCountMax,
        ...hostKeyPolicy,
      };
    });
}

function effectiveOptionsForHost(hostName, sections) {
  const options = new Map();

  for (const section of sections) {
    if (!hostMatchesSection(hostName, section.patterns)) continue;
    for (const [keyword, values] of section.options.entries()) {
      if (ADDITIVE_OPTIONS.has(keyword)) {
        options.set(keyword, [...(options.get(keyword) || []), ...values]);
      } else if (!options.has(keyword)) {
        options.set(keyword, values.slice());
      }
    }
  }

  return options;
}

function firstOption(options, name) {
  const values = options.get(name);
  return values?.[0];
}

function allOptions(options, name) {
  return options.get(name) || [];
}

function parseForwardOptions(options, hostName) {
  if (parseBooleanOption(firstOption(options, "clearallforwardings"))) return [];

  let id = 1;
  const forwards = [];

  for (const value of allOptions(options, "localforward")) {
    const parsed = parseTcpForward(value);
    if (!parsed) continue;
    forwards.push({
      id: `import-${hostName}-L-${id++}`,
      type: "L",
      lport: parsed.listenPort,
      rhost: parsed.targetHost,
      rport: parsed.targetPort,
      on: true,
    });
  }

  for (const value of allOptions(options, "remoteforward")) {
    const parsed = parseTcpForward(value);
    if (!parsed) continue;
    forwards.push({
      id: `import-${hostName}-R-${id++}`,
      type: "R",
      lport: parsed.targetPort,
      rhost: parsed.targetHost,
      rport: parsed.listenPort,
      on: true,
    });
  }

  for (const value of allOptions(options, "dynamicforward")) {
    const listenPort = parseListenPort(value);
    if (!listenPort) continue;
    forwards.push({
      id: `import-${hostName}-D-${id++}`,
      type: "D",
      lport: listenPort,
      rhost: "",
      rport: "",
      on: true,
    });
  }

  return forwards;
}

function parseTcpForward(value) {
  const words = splitShellWords(String(value || ""));
  if (words.length >= 2) {
    const listenPort = parseListenPort(words[0]);
    const target = parseHostPortSpec(words[1]);
    if (listenPort && target) {
      return { listenPort, targetHost: target.host, targetPort: target.port };
    }
  }

  if (words.length === 1) {
    const compact = parseCompactForwardSpec(words[0]);
    if (compact) return compact;
  }

  return null;
}

function parseCompactForwardSpec(value) {
  const parts = splitColonSpec(value);
  if (parts.length < 3) return null;
  const listenPort = parsePort(parts.at(-3));
  const targetHost = parts.at(-2);
  const targetPort = parsePort(parts.at(-1));
  if (!listenPort || !targetHost || !targetPort) return null;
  return { listenPort, targetHost, targetPort };
}

function parseListenPort(value) {
  const parts = splitColonSpec(value);
  return parsePort(parts.at(-1));
}

function parseHostPortSpec(value) {
  const parts = splitColonSpec(value);
  const host = parts.length > 1 ? parts.slice(0, -1).join(":") : "";
  const port = parsePort(parts.at(-1));
  if (!host || !port) return null;
  return { host: stripAddressBrackets(host), port };
}

function splitColonSpec(value) {
  const text = String(value || "").trim();
  const parts = [];
  let current = "";
  let bracketDepth = 0;

  for (const ch of text) {
    if (ch === "[") bracketDepth += 1;
    if (ch === "]" && bracketDepth > 0) bracketDepth -= 1;
    if (ch === ":" && bracketDepth === 0) {
      parts.push(stripAddressBrackets(current));
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(stripAddressBrackets(current));
  return parts.map(part => part.trim()).filter(Boolean);
}

function stripAddressBrackets(value) {
  const text = String(value || "").trim();
  return text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
}

function normalizeImportedHostAddress(value) {
  const text = String(value || "").trim();
  const unwrapped = stripAddressBrackets(text).trim();
  return unwrapped.includes(":") ? unwrapped : text;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return "";
  return String(port);
}

function hostMatchesSection(hostName, patterns) {
  let matched = false;
  for (const rawPattern of patterns) {
    const negated = rawPattern.startsWith("!");
    const pattern = negated ? rawPattern.slice(1) : rawPattern;
    if (!pattern) continue;
    if (patternMatchesHost(pattern, hostName)) {
      if (negated) return false;
      matched = true;
    }
  }
  return matched;
}

function patternMatchesHost(pattern, hostName) {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${source}$`, "i").test(hostName);
}

function isImportablePattern(pattern) {
  return Boolean(pattern) && !pattern.startsWith("!") && !GLOB_CHARS.test(pattern);
}

function parseProxyJumpHosts(value, { fallbackUser, sections }) {
  if (!value || value.toLowerCase() === "none") return [];
  return value
    .split(",")
    .map(part => parseProxyJumpTarget(part, { fallbackUser, sections }))
    .filter(Boolean);
}

function parseProxyJumpTarget(value, { fallbackUser, sections }) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const atIndex = raw.lastIndexOf("@");
  const userPart = atIndex >= 0 ? raw.slice(0, atIndex).trim() : "";
  const hostPart = atIndex >= 0 ? raw.slice(atIndex + 1).trim() : raw;
  const parsed = splitHostPort(hostPart);
  if (!parsed.host) return null;

  const jumpOptions = effectiveOptionsForHost(parsed.host, sections);
  const proxyCommand = normalizeProxyCommand(firstOption(jumpOptions, "proxycommand"));
  const user = userPart || firstOption(jumpOptions, "user") || fallbackUser || defaultUser();
  const port = Number(parsed.port || firstOption(jumpOptions, "port") || 22);
  const host = normalizeImportedHostAddress(expandHostNameTokens(firstOption(jumpOptions, "hostname"), {
    hostName: parsed.host,
    user,
    port: Number.isFinite(port) && port > 0 ? port : 22,
  }) || parsed.host);
  const identityFile = firstOption(jumpOptions, "identityfile");
  const hostKeyPolicy = parseStrictHostKeyChecking(firstOption(jumpOptions, "stricthostkeychecking"));
  const connectTimeoutMs = parseConnectTimeoutMs(firstOption(jumpOptions, "connecttimeout"));
  const serverAliveIntervalMs = parseServerAliveIntervalMs(firstOption(jumpOptions, "serveraliveinterval"));
  const serverAliveCountMax = parseServerAliveCountMax(firstOption(jumpOptions, "serveralivecountmax"));

  return {
    name: parsed.host,
    host,
    user,
    port: Number.isFinite(port) && port > 0 ? port : 22,
    identityFile,
    proxy: proxyCommand ? { type: "cmd", cmd: proxyCommand } : undefined,
    connectTimeoutMs,
    serverAliveIntervalMs,
    serverAliveCountMax,
    ...hostKeyPolicy,
  };
}

function parseStrictHostKeyChecking(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "yes" || normalized === "ask") return null;
  if (normalized === "accept-new") {
    return { strictHostKey: true, trustUnknownHostKey: true };
  }
  if (["no", "off", "false"].includes(normalized)) {
    return { strictHostKey: false, trustUnknownHostKey: true };
  }
  return null;
}

function parseConnectTimeoutMs(value) {
  const seconds = Number(String(value || "").trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(30_000, Math.max(100, Math.round(seconds * 1000)));
}

function parseServerAliveIntervalMs(value) {
  const seconds = Number(String(value || "").trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(600_000, Math.max(1_000, Math.round(seconds * 1000)));
}

function parseServerAliveCountMax(value) {
  const count = Number(String(value || "").trim());
  if (!Number.isFinite(count) || count < 0) return undefined;
  return Math.min(20, Math.round(count));
}

function parseBooleanOption(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["yes", "on", "true"].includes(normalized);
}

function splitHostPort(value) {
  const text = String(value || "").trim();
  if (!text) return { host: "", port: "" };
  if (text.startsWith("[")) {
    const close = text.indexOf("]");
    if (close > 0) {
      const host = text.slice(1, close);
      const rest = text.slice(close + 1);
      return { host, port: rest.startsWith(":") ? rest.slice(1) : "" };
    }
  }
  const colon = text.lastIndexOf(":");
  if (colon > 0 && text.indexOf(":") === colon) {
    return { host: text.slice(0, colon), port: text.slice(colon + 1) };
  }
  return { host: text, port: "" };
}

function normalizeProxyCommand(value) {
  if (!value || String(value).trim().toLowerCase() === "none") return null;
  return value;
}

function expandHostNameTokens(value, { hostName, user, port }) {
  if (!value) return "";
  const replacements = {
    "%": "%",
    h: String(hostName || ""),
    n: String(hostName || ""),
    r: String(user || ""),
    p: String(port || 22),
  };
  return String(value).replace(/%([%hnrp])/g, (_, token) => replacements[token] ?? `%${token}`);
}

function hostKey(host) {
  return [
    String(host.name || "").trim().toLowerCase(),
    String(host.user || "").trim().toLowerCase(),
    normalizeImportedHostAddress(host.host).toLowerCase(),
    String(Number(host.port) || 22),
  ].join("|");
}

function defaultUser() {
  return typeof process !== "undefined" && process.env?.USER ? process.env.USER : "user";
}

function stripComment(line) {
  let quote = null;
  let out = "";

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && !isBackslashEscaped(line, i)) {
      quote = quote === ch ? null : quote || ch;
    }
    if (ch === "#" && !quote && !isBackslashEscaped(line, i)) break;
    out += ch;
  }

  return out;
}

function splitShellWords(line) {
  const words = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === "\\") {
      const next = line[i + 1];
      if (next && shouldUnescapeSshConfigChar(next)) {
        current += next;
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }

    if ((ch === '"' || ch === "'") && !isBackslashEscaped(line, i)) {
      quote = quote === ch ? null : quote || ch;
      continue;
    }

    if (/\s/.test(ch) && !quote) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) words.push(current);
  return words;
}

function shouldUnescapeSshConfigChar(ch) {
  return /\s/.test(ch) || ch === "\\" || ch === "\"" || ch === "'" || ch === "#";
}

function isBackslashEscaped(text, index) {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function parseDirective(words) {
  if (!words.length) return null;
  const [first, ...rest] = words;
  const inlineEqual = first.indexOf("=");

  if (inlineEqual > 0) {
    const keywordRaw = first.slice(0, inlineEqual);
    const inlineValue = first.slice(inlineEqual + 1);
    const args = inlineValue ? [inlineValue, ...rest] : rest;
    return args.length ? { keywordRaw, args } : null;
  }

  if (rest[0] === "=") {
    const args = rest.slice(1);
    return args.length ? { keywordRaw: first, args } : null;
  }

  if (rest[0]?.startsWith("=")) {
    const inlineValue = rest[0].slice(1);
    const args = inlineValue ? [inlineValue, ...rest.slice(1)] : rest.slice(1);
    return args.length ? { keywordRaw: first, args } : null;
  }

  return rest.length ? { keywordRaw: first, args: rest } : null;
}
