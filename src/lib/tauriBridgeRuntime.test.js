import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => {
  const invoke = vi.fn(async (command, payload) => ({
    command,
    payload,
  }));
  class Channel {}
  return { Channel, invoke };
});

import { invoke } from "@tauri-apps/api/core";
import {
  createLocalFile,
  isTauriRuntime,
  listForwards,
  openLocalPty,
  readLocalFileChunkBase64,
  readRemoteSftpFileChunkBase64,
  sampleMonitor,
  startDynamicForward,
  startLocalForward,
  startRemoteForward,
  stopForward,
  truncateLocalFile,
  writeLocalFileChunkBase64,
  writeRemoteSftpFileChunkBase64,
} from "./tauriBridge.js";

describe("tauriBridge runtime routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = { __TAURI_INTERNALS__: {} };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("routes monitor sampling through an existing SSH session when a session id is available", async () => {
    await expect(sampleMonitor({
      sessionId: "ssh-session-1",
      host: "prod.example.com",
      user: "deploy",
      password: "secret",
    })).resolves.toMatchObject({
      command: "ssh_sample_monitor",
      payload: {
        req: {
          sessionId: "ssh-session-1",
        },
      },
    });

    expect(isTauriRuntime()).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("ssh_sample_monitor", {
      req: {
        sessionId: "ssh-session-1",
      },
    });
  });

  it("falls back to remote monitor auth only when no reusable session id exists", async () => {
    await sampleMonitor({
      host: "prod.example.com",
      port: 2222,
      user: "deploy",
      password: "secret",
      privateKeyPath: "~/.ssh/prod",
      privateKeyPassphrase: "phrase",
      totpCode: "123456",
      proxy: { type: "socks5", host: "127.0.0.1", port: 1080 },
      jumpHosts: [{ host: "bastion.example.com", user: "jump" }],
      strictHostKey: true,
      trustUnknownHostKey: true,
      connectTimeoutMs: 12000,
      serverAliveIntervalMs: 30000,
      serverAliveCountMax: 4,
    });

    expect(invoke).toHaveBeenCalledWith("sample_remote_monitor", {
      req: {
        host: "prod.example.com",
        port: 2222,
        user: "deploy",
        password: "secret",
        privateKeyPath: "~/.ssh/prod",
        privateKeyPassphrase: "phrase",
        totpCode: "123456",
        proxy: { type: "socks5", host: "127.0.0.1", port: 1080 },
        jumpHosts: [{ host: "bastion.example.com", user: "jump" }],
        strictHostKey: true,
        trustUnknownHostKey: true,
        connectTimeoutMs: 12000,
        serverAliveIntervalMs: 30000,
        serverAliveCountMax: 4,
      },
    });
  });

  it("samples the local desktop host when no SSH auth context is available", async () => {
    await sampleMonitor(null);

    expect(invoke).toHaveBeenCalledWith("sample_monitor");
  });

  it("uses camelCase request fields for local PTY lifecycle IPC", async () => {
    invoke.mockImplementation(async (command, payload) => {
      if (command === "pty_open") return "pty-session-1";
      return { command, payload };
    });
    const onData = vi.fn();

    const pty = await openLocalPty({
      cols: 100,
      rows: 30,
      cwd: "/tmp",
      shell: "/bin/zsh",
      onData,
    });
    await pty.write("ls\r");
    await pty.resize(120, 40);
    await pty.close();

    expect(pty.sessionId).toBe("pty-session-1");
    expect(invoke).toHaveBeenNthCalledWith(1, "pty_open", {
      req: {
        cols: 100,
        rows: 30,
        cwd: "/tmp",
        shell: "/bin/zsh",
      },
      channel: expect.any(Object),
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "pty_write", {
      sessionId: "pty-session-1",
      data: Array.from(new TextEncoder().encode("ls\r")),
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "pty_resize", {
      req: {
        sessionId: "pty-session-1",
        cols: 120,
        rows: 40,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "pty_close", {
      sessionId: "pty-session-1",
    });
  });

  it("uses camelCase request fields for port forward lifecycle IPC", async () => {
    const ssh = {
      host: "prod.example.com",
      port: 2222,
      user: "deploy",
      password: "secret",
      strictHostKey: true,
    };

    await listForwards();
    await startLocalForward({
      bindHost: "127.0.0.1",
      bindPort: 15432,
      targetHost: "db.internal",
      targetPort: 5432,
      ssh,
    });
    await startDynamicForward({
      bindHost: "127.0.0.1",
      bindPort: 1086,
      ssh,
    });
    await startRemoteForward({
      bindHost: "127.0.0.1",
      bindPort: 18080,
      targetHost: "127.0.0.1",
      targetPort: 8080,
      ssh,
    });
    await stopForward("forward-1");

    expect(invoke).toHaveBeenNthCalledWith(1, "list_forwards");
    expect(invoke).toHaveBeenNthCalledWith(2, "start_forward", {
      req: {
        kind: "L",
        bindHost: "127.0.0.1",
        bindPort: 15432,
        targetHost: "db.internal",
        targetPort: 5432,
        ssh,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "start_forward", {
      req: {
        kind: "D",
        bindHost: "127.0.0.1",
        bindPort: 1086,
        ssh,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "start_forward", {
      req: {
        kind: "R",
        bindHost: "127.0.0.1",
        bindPort: 18080,
        targetHost: "127.0.0.1",
        targetPort: 8080,
        ssh,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "stop_forward", {
      id: "forward-1",
    });
  });

  it("uses camelCase request fields for local SFTP file chunk IPC", async () => {
    await readLocalFileChunkBase64("/tmp/app.log", 4096, 8192);
    await writeLocalFileChunkBase64("/tmp/app.log", 12288, "AAE=", true);
    await truncateLocalFile("/tmp/app.log", 12291);
    await createLocalFile("/tmp", "empty.log", 0);

    expect(invoke).toHaveBeenNthCalledWith(1, "read_local_file_chunk_base64", {
      req: {
        path: "/tmp/app.log",
        offset: 4096,
        length: 8192,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "write_local_file_chunk_base64", {
      req: {
        path: "/tmp/app.log",
        offset: 12288,
        contentBase64: "AAE=",
        truncate: true,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "truncate_local_file", {
      req: {
        path: "/tmp/app.log",
        size: 12291,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "create_local_file", {
      req: {
        parent: "/tmp",
        name: "empty.log",
        size: 0,
      },
    });
  });

  it("uses camelCase auth and transfer fields for remote SFTP chunk IPC", async () => {
    const auth = {
      host: "prod.example.com",
      port: 2222,
      user: "deploy",
      password: "secret",
      privateKeyPath: "~/.ssh/prod",
      privateKeyPassphrase: "phrase",
      totpCode: "123456",
      proxy: { type: "http", host: "127.0.0.1", port: 8080, auth: true },
      jumpHosts: [{ host: "bastion.example.com", user: "jump", port: 22 }],
      strictHostKey: false,
      trustUnknownHostKey: true,
      connectTimeoutMs: 15000,
      serverAliveIntervalMs: 30000,
      serverAliveCountMax: 3,
    };

    await readRemoteSftpFileChunkBase64({
      ...auth,
      path: "/var/log/app.log",
      offset: 2048,
      length: 65536,
    });
    await writeRemoteSftpFileChunkBase64({
      ...auth,
      path: "/tmp/app.log",
      offset: 4096,
      contentBase64: "AAE=",
      truncate: true,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "read_remote_sftp_file_chunk_base64", {
      req: {
        ...auth,
        path: "/var/log/app.log",
        offset: 2048,
        length: 65536,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "write_remote_sftp_file_chunk_base64", {
      req: {
        ...auth,
        path: "/tmp/app.log",
        offset: 4096,
        contentBase64: "AAE=",
        truncate: true,
      },
    });
  });
});
