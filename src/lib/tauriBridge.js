import { Channel, invoke } from "@tauri-apps/api/core";

export function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

function desktopOnlyMessage(feature) {
  return `${feature} 仅在 Tauri 桌面端可用。`;
}

export async function getHealth() {
  if (!isTauriRuntime()) {
    return {
      app: "RELAY",
      version: "web-preview",
      channel_streaming: false,
      frame_aggregation_ms: 16
    };
  }

  return invoke("health");
}

export async function getSshAgentStatus() {
  if (!isTauriRuntime()) {
    return {
      available: true,
      socket: null,
      identityCount: 1,
      status: "preview",
      message: "浏览器预览 SSH Agent 状态"
    };
  }

  return invoke("ssh_agent_status");
}

export async function openLocalPty({ cols, rows, cwd, shell, onData }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地 PTY"));
  }

  const channel = new Channel();
  channel.onmessage = (bytes) => onData(bytes);
  const sessionId = await invoke("pty_open", {
    req: { cols, rows, cwd, shell },
    channel
  });

  return {
    sessionId,
    write(data) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      return invoke("pty_write", { sessionId, data: Array.from(bytes) });
    },
    resize(cols, rows) {
      return invoke("pty_resize", { req: { sessionId, cols, rows } });
    },
    close() {
      return invoke("pty_close", { sessionId });
    }
  };
}

export async function openSshSession({ host, port = 22, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, term = "xterm-256color", cols = 120, rows = 32, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null, onData }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实 SSH 会话"));
  }

  const channel = new Channel();
  channel.onmessage = (bytes) => onData(bytes);
  const result = await invoke("ssh_open", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      term,
      cols,
      rows,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    },
    channel
  });

  return {
    ...result,
    write(data) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      return invoke("ssh_write", { sessionId: result.sessionId, data: Array.from(bytes) });
    },
    resize(cols, rows) {
      return invoke("ssh_resize", { req: { sessionId: result.sessionId, cols, rows } });
    },
    close() {
      return invoke("ssh_close", { sessionId: result.sessionId });
    }
  };
}

export async function listForwards() {
  if (!isTauriRuntime()) {
    return [];
  }

  return invoke("list_forwards");
}

export async function startLocalForward({ bindHost = "127.0.0.1", bindPort, targetHost, targetPort, ssh }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("端口转发"));
  }

  return invoke("start_forward", {
    req: {
      kind: "L",
      bindHost,
      bindPort,
      targetHost,
      targetPort,
      ssh
    }
  });
}

export async function startDynamicForward({ bindHost = "127.0.0.1", bindPort, ssh }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("端口转发"));
  }

  return invoke("start_forward", {
    req: {
      kind: "D",
      bindHost,
      bindPort,
      ssh
    }
  });
}

export async function startRemoteForward({ bindHost = "127.0.0.1", bindPort, targetHost = "127.0.0.1", targetPort, ssh }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("端口转发"));
  }

  return invoke("start_forward", {
    req: {
      kind: "R",
      bindHost,
      bindPort,
      targetHost,
      targetPort,
      ssh
    }
  });
}

export async function stopForward(id) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("端口转发"));
  }

  return invoke("stop_forward", { id });
}

export async function testJumpChain({ nodes, proxy = { kind: "none" }, timeoutMs = 1500 }) {
  if (!isTauriRuntime()) {
    return nodes.slice(1).map((node, index) => ({
      from: nodes[index].label,
      to: node.label,
      status: index === 0 ? "ok" : "unchecked",
      latencyMs: index === 0 ? 18 + index * 7 : null,
      message: index === 0
        ? "浏览器预览路径检查"
        : "需要桌面端 SSH 通道"
    }));
  }

  return invoke("test_jump_chain", {
    req: {
      nodes,
      proxy,
      timeoutMs
    }
  });
}

export async function probeHosts({ targets, timeoutMs = 1500 }) {
  if (!isTauriRuntime()) {
    return targets.map((target, index) => ({
      id: target.id,
      host: target.host,
      port: target.port || 22,
      status: String(target.host || "").includes("backup") ? "offline" : "online",
      latencyMs: String(target.host || "").includes("backup") ? null : 16 + index * 5,
      error: String(target.host || "").includes("backup") ? "浏览器预览中主机离线" : null
    }));
  }

  return invoke("probe_hosts", {
    req: {
      targets,
      timeoutMs
    }
  });
}

export async function readDefaultSshConfig() {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke("read_default_ssh_config");
}

export async function sampleMonitor(auth = null) {
  if (!isTauriRuntime()) {
    return {
      cpu: 32,
      memory: 31,
      disk: 58,
      networkDownMbps: 7.0,
      load: "0.42",
      uptime: "47d 0h",
      os: "浏览器预览",
      processes: 183
    };
  }

  if (auth?.sessionId) {
    return invoke("ssh_sample_monitor", {
      req: {
        sessionId: auth.sessionId,
      },
    });
  }

  if (auth?.host) {
    return invoke("sample_remote_monitor", {
      req: {
        host: auth.host,
        port: auth.port || 22,
        user: auth.user,
        password: auth.password || null,
        privateKeyPath: auth.privateKeyPath || null,
        privateKeyPassphrase: auth.privateKeyPassphrase || null,
        totpCode: auth.totpCode || null,
        proxy: auth.proxy || null,
        jumpHosts: auth.jumpHosts || null,
        strictHostKey: auth.strictHostKey ?? true,
        trustUnknownHostKey: auth.trustUnknownHostKey ?? false,
        connectTimeoutMs: auth.connectTimeoutMs || null,
        serverAliveIntervalMs: auth.serverAliveIntervalMs || null,
        serverAliveCountMax: auth.serverAliveCountMax ?? null,
      },
    });
  }

  return invoke("sample_monitor");
}

export async function listLocalDir(path) {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke("list_local_dir", { req: { path } });
}

export async function getLocalPathInfo(path) {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke("get_local_path_info", { req: { path } });
}

export async function pickTrzszUploadPaths({ directory = false } = {}) {
  if (!isTauriRuntime()) {
    return [];
  }

  return invoke("pick_trzsz_upload_paths", { req: { directory } });
}

export async function pickTrzszSaveDirectory() {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke("pick_trzsz_save_directory");
}

export async function listRemoteSftpDir({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, path = ".", strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke("list_remote_sftp_dir", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      path,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function readRemoteSftpText({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, path, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实远端 SFTP"));
  }

  return invoke("read_remote_sftp_text", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      path,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function readRemoteSftpFileBase64({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, path, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实远端 SFTP"));
  }

  return invoke("read_remote_sftp_file_base64", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      path,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function readRemoteSftpFileChunkBase64({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, path, offset, length, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实远端 SFTP"));
  }

  return invoke("read_remote_sftp_file_chunk_base64", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      path,
      offset,
      length,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function writeRemoteSftpText({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, path, content, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实远端 SFTP"));
  }

  return invoke("write_remote_sftp_text", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      path,
      content,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function writeRemoteSftpFileBase64({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, path, contentBase64, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实远端 SFTP"));
  }

  return invoke("write_remote_sftp_file_base64", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      path,
      contentBase64,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function writeRemoteSftpFileChunkBase64({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, path, offset, contentBase64, truncate = false, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实远端 SFTP"));
  }

  return invoke("write_remote_sftp_file_chunk_base64", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      path,
      offset,
      contentBase64,
      truncate,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function createRemoteSftpDir({ host, port, user, password, privateKeyPath, privateKeyPassphrase, totpCode = null, proxy = null, jumpHosts = null, parent, name, strictHostKey = true, trustUnknownHostKey = false, connectTimeoutMs = null, serverAliveIntervalMs = null, serverAliveCountMax = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("真实远端 SFTP"));
  }

  return invoke("create_remote_sftp_dir", {
    req: {
      host,
      port,
      user,
      password,
      privateKeyPath,
      privateKeyPassphrase,
      totpCode,
      proxy,
      jumpHosts,
      parent,
      name,
      strictHostKey,
      trustUnknownHostKey,
      connectTimeoutMs,
      serverAliveIntervalMs,
      serverAliveCountMax
    }
  });
}

export async function readLocalText(path) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("read_local_text", { path });
}

export async function readLocalFileBase64(path) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("read_local_file_base64", { path });
}

export async function readLocalFileChunkBase64(path, offset, length) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("read_local_file_chunk_base64", { req: { path, offset, length } });
}

export async function writeLocalText(path, content) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("write_local_text", { req: { path, content } });
}

export async function writeLocalFileBase64(parent, name, contentBase64) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("write_local_file_base64", { req: { parent, name, contentBase64 } });
}

export async function writeLocalFileChunkBase64(path, offset, contentBase64, truncate = false) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("write_local_file_chunk_base64", { req: { path, offset, contentBase64, truncate } });
}

export async function truncateLocalFile(path, size) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("truncate_local_file", { req: { path, size } });
}

export async function createLocalDir(parent, name) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("create_local_dir", { req: { parent, name } });
}

export async function createLocalFile(parent, name, size = 0) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("本地文件访问"));
  }

  return invoke("create_local_file", { req: { parent, name, size } });
}

export async function listCredentials() {
  if (!isTauriRuntime()) {
    return [
      { name: "id_ed25519_work", kind: "ED25519 密钥", fingerprint: "SHA256:kF3x...9Qa", used: 5, path: null, privatePath: null, status: "ready", message: "浏览器预览凭据" },
      { name: "id_rsa_legacy", kind: "RSA 密钥", fingerprint: "SHA256:m2Lp...X7c", used: 1, path: null, privatePath: null, status: "warning", message: "旧版 RSA 密钥,建议评估轮换策略" },
      { name: "prod-2fa", kind: "TOTP", fingerprint: "绑定到 bastion-sh", used: 5, path: null, privatePath: null, status: "ready", message: "浏览器预览 TOTP 凭据" },
    ];
  }

  return invoke("list_credentials");
}

export async function repairCredentialPermissions(path) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("私钥权限修复"));
  }

  return invoke("repair_private_key_permissions", { req: { path } });
}

export async function getKeychainSecret({ host, port = 22, user, kind, privateKeyPath = null }) {
  if (!isTauriRuntime()) {
    return {
      found: false,
      secret: null,
      account: null,
      message: desktopOnlyMessage("系统钥匙串"),
    };
  }

  return invoke("get_keychain_secret", {
    req: {
      host,
      port,
      user,
      kind,
      privateKeyPath,
    },
  });
}

export async function saveKeychainSecret({ host, port = 22, user, kind, privateKeyPath = null, secret }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("系统钥匙串"));
  }

  return invoke("save_keychain_secret", {
    req: {
      host,
      port,
      user,
      kind,
      privateKeyPath,
      secret,
    },
  });
}

export async function deleteKeychainSecret({ host, port = 22, user, kind, privateKeyPath = null }) {
  if (!isTauriRuntime()) {
    throw new Error(desktopOnlyMessage("系统钥匙串"));
  }

  return invoke("delete_keychain_secret", {
    req: {
      host,
      port,
      user,
      kind,
      privateKeyPath,
    },
  });
}

export async function saveTotpSecret({ id, secret }) {
  if (!isTauriRuntime()) {
    return {
      saved: false,
      account: null,
      message: desktopOnlyMessage("TOTP 钥匙串存储"),
    };
  }

  return invoke("save_totp_secret", { req: { id, secret } });
}

export async function getTotpCode({ id, digits = 6, period = 30 }) {
  if (!isTauriRuntime()) {
    return {
      code: "000000".slice(0, digits),
      remainingSeconds: period,
      period,
      digits,
      account: null,
    };
  }

  return invoke("get_totp_code", { req: { id, digits, period } });
}

export async function deleteTotpSecret({ id }) {
  if (!isTauriRuntime()) {
    return {
      saved: false,
      account: null,
      message: desktopOnlyMessage("TOTP 钥匙串存储"),
    };
  }

  return invoke("delete_totp_secret", { req: { id } });
}
