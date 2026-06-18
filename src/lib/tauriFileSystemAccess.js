import {
  createLocalDir,
  getLocalPathInfo,
  listLocalDir,
  pickTrzszSaveDirectory,
  pickTrzszUploadPaths,
  readLocalFileChunkBase64,
  truncateLocalFile,
  writeLocalFileChunkBase64,
} from "./tauriBridge.js";

const CHUNK_SIZE = 1024 * 1024;

export function installTauriFileSystemAccess(target = globalThis.window, backend = defaultBackend) {
  if (!target || target.__RELAY_TAURI_FS_ACCESS__) return false;

  target.showOpenFilePicker = async ({ multiple = false } = {}) => {
    const paths = await backend.pickUploadPaths({ directory: false });
    const selected = multiple ? paths : paths.slice(0, 1);
    return selected.map(path => new TauriFileHandle(path, backend));
  };

  target.showDirectoryPicker = async ({ id, mode } = {}) => {
    const path = id === "trzsz_download" || mode === "readwrite"
      ? await backend.pickSaveDirectory()
      : (await backend.pickUploadPaths({ directory: true }))[0];
    if (!path) throw abortError();
    return new TauriDirectoryHandle(path, backend);
  };

  target.__RELAY_TAURI_FS_ACCESS__ = true;
  return true;
}

const defaultBackend = {
  pickUploadPaths: pickTrzszUploadPaths,
  pickSaveDirectory: pickTrzszSaveDirectory,
  getInfo: getLocalPathInfo,
  listDir: listLocalDir,
  createDir: createLocalDir,
  readChunk: readLocalFileChunkBase64,
  truncateFile: truncateLocalFile,
  writeChunk: writeLocalFileChunkBase64,
};

class TauriFileHandle {
  constructor(path, backend) {
    this.kind = "file";
    this.path = path;
    this.name = basename(path);
    this.backend = backend;
  }

  async getFile() {
    const info = await this.backend.getInfo(this.path);
    if (!info || info.kind !== "file") throw typeMismatchError(`${this.path} 不是文件`);
    return new TauriLazyFile(this.path, info.name, info.size, this.backend);
  }

  async createWritable() {
    return new TauriWritableFile(this.path, this.backend);
  }
}

class TauriDirectoryHandle {
  constructor(path, backend) {
    this.kind = "directory";
    this.path = path;
    this.name = basename(path);
    this.backend = backend;
  }

  async *values() {
    const listing = await this.backend.listDir(this.path);
    for (const entry of listing?.entries || []) {
      yield entry.kind === "dir"
        ? new TauriDirectoryHandle(entry.path, this.backend)
        : new TauriFileHandle(entry.path, this.backend);
    }
  }

  async getFileHandle(name, options = {}) {
    const path = joinPath(this.path, name);
    if (options.create) return new TauriFileHandle(path, this.backend);
    const info = await this.backend.getInfo(path);
    if (!info || info.kind !== "file") throw typeMismatchError(`${path} 不是文件`);
    return new TauriFileHandle(path, this.backend);
  }

  async getDirectoryHandle(name, options = {}) {
    const path = joinPath(this.path, name);
    try {
      const info = await this.backend.getInfo(path);
      if (!info || info.kind !== "dir") throw typeMismatchError(`${path} 不是目录`);
    } catch (err) {
      if (!options.create) throw err;
      await this.backend.createDir(this.path, name);
    }
    return new TauriDirectoryHandle(path, this.backend);
  }
}

class TauriLazyFile {
  constructor(path, name, size, backend) {
    this.path = path;
    this.name = name;
    this.size = Number(size) || 0;
    this.backend = backend;
  }

  slice(start = 0, end = this.size) {
    const path = this.path;
    const backend = this.backend;
    const offset = Math.max(0, Number(start) || 0);
    const limit = Math.max(offset, Math.min(Number(end) || this.size, this.size));
    return {
      async arrayBuffer() {
        const chunks = [];
        let pos = offset;
        while (pos < limit) {
          const length = Math.min(CHUNK_SIZE, limit - pos);
          const chunk = await backend.readChunk(path, pos, length);
          const bytes = decodeBase64(chunk.contentBase64 || chunk.content_base64 || "");
          chunks.push(bytes);
          pos += bytes.byteLength;
          if (!bytes.byteLength || chunk.done) break;
        }
        return concatBytes(chunks).buffer;
      },
    };
  }
}

class TauriWritableFile {
  constructor(path, backend) {
    this.path = path;
    this.backend = backend;
    this.offset = 0;
    this.closed = false;
  }

  async write(chunk) {
    this.assertOpen();
    if (isWriteParams(chunk)) {
      await this.writeParams(chunk);
      return;
    }
    await this.writeData(chunk);
  }

  async writeParams(params) {
    if (params.type === "write") {
      if (params.position !== undefined) await this.seek(params.position);
      await this.writeData(params.data ?? new Uint8Array());
      return;
    }
    if (params.type === "seek") {
      await this.seek(params.position);
      return;
    }
    if (params.type === "truncate") {
      await this.truncate(params.size);
      return;
    }
    throw new Error(`不支持的文件写入操作: ${params.type}`);
  }

  async writeData(chunk) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    await this.backend.writeChunk(this.path, this.offset, encodeBase64(bytes), this.offset === 0);
    this.offset += bytes.byteLength;
  }

  async seek(position) {
    this.assertOpen();
    this.offset = assertNonNegativeInteger(position, "position");
  }

  async truncate(size) {
    this.assertOpen();
    const length = assertNonNegativeInteger(size, "size");
    if (typeof this.backend.truncateFile !== "function") {
      throw new Error("当前文件写入后端不支持截断");
    }
    await this.backend.truncateFile(this.path, length);
    if (this.offset > length) this.offset = length;
  }

  async close() {
    this.closed = true;
  }

  assertOpen() {
    if (this.closed) throw new Error("文件写入器已关闭");
  }
}

function isWriteParams(value) {
  return value && typeof value === "object" && typeof value.type === "string";
}

function assertNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    const label = name === "position" ? "写入位置" : name === "size" ? "文件大小" : name;
    throw new Error(`${label}必须是非负整数: ${value}`);
  }
  return number;
}

function basename(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean).pop() || "";
}

function joinPath(parent, name) {
  return String(parent || "").replace(/[\\/]+$/, "") + "/" + String(name || "").replace(/^[\\/]+/, "");
}

function abortError() {
  return new DOMException("The user aborted a request.", "AbortError");
}

function typeMismatchError(message) {
  return new DOMException(message, "TypeMismatchError");
}

function decodeBase64(value) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
