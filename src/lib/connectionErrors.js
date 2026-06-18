export function connectionErrorMessage(error) {
  return String(error?.message || error || "").trim();
}

export function isPrivateKeyPermissionError(error) {
  const message = connectionErrorMessage(error);
  return Boolean(
    extractPrivateKeyPermissionFix(error)
    || /warning:\s*unprotected private key file/i.test(message)
    || /private key permissions\s+[0-7]{3,4}.*too open/i.test(message)
    || /load key\s+["'][^"']+["']:\s*bad permissions/i.test(message)
  );
}

export function extractPrivateKeyPermissionFix(error) {
  const message = connectionErrorMessage(error);
  if (!message) return null;

  const openssh = message.match(/Permissions\s+0?([0-7]{3,4})\s+for\s+['"]([^'"]+)['"]\s+are too open/i);
  if (openssh) {
    return buildPrivateKeyPermissionFix(openssh[2], openssh[1]);
  }

  const relay = message.match(/private key permissions\s+([0-7]{3,4})\s+for\s+(.+?)\s+are too open/i);
  if (relay) {
    return buildPrivateKeyPermissionFix(relay[2], relay[1]);
  }

  const loadKey = message.match(/Load key\s+["']([^"']+)["']:\s*bad permissions/i);
  if (loadKey) {
    return buildPrivateKeyPermissionFix(loadKey[1], null);
  }

  return null;
}

export function formatConnectionError(error) {
  const message = connectionErrorMessage(error);
  const guidance = buildConnectionErrorGuidance(error);
  return guidance ? [guidance, message].filter(Boolean).join("\n") : message;
}

export function buildConnectionErrorState(error) {
  return {
    message: formatConnectionError(error),
    resetCachedAuth: shouldResetCachedSshAuth(error),
  };
}

export function buildConnectionErrorGuidance(error) {
  const message = connectionErrorMessage(error);
  if (!message) return "";

  if (isPrivateKeyPermissionError(error)) {
    const fix = extractPrivateKeyPermissionFix(error);
    const action = fix?.command
      ? `请在本机执行: ${fix.command}`
      : "请将私钥权限改为仅当前用户可读写，例如 chmod 600 <private-key>。";

    return [
      "私钥文件权限过宽，SSH 已拒绝使用该密钥。",
      action,
    ].join("\n");
  }

  if (/Permission denied\s+\((?=[^)]*(?:publickey|password|keyboard-interactive))[^)]+\)/i.test(message)
    || /authentication rejected/i.test(message)
    || /public key authentication failed/i.test(message)) {
    return "SSH 认证失败，服务器拒绝了当前凭据。\n请检查用户名、IdentityFile、SSH Agent 和服务器 authorized_keys 设置。";
  }

  if (/password authentication failed/i.test(message)) {
    return "SSH 密码认证失败。\n请重新输入密码，或改用已授权的 IdentityFile 私钥。";
  }

  if (/keyboard-interactive authentication/i.test(message)) {
    return "SSH 交互式认证失败。\n请检查堡垒机 2FA/TOTP 绑定和动态口令是否仍然有效。";
  }

  if (/password or privateKeyPath is required/i.test(message)) {
    return "缺少 SSH 认证凭据。\n请为目标主机配置密码，或填写 IdentityFile 私钥路径。";
  }

  if (/failed to (load|read) private key/i.test(message)
    || /private key at .+ is not a regular file/i.test(message)) {
    return "私钥读取失败。\n请检查 IdentityFile 路径是否存在、是否为普通文件，以及私钥口令是否正确。";
  }

  return "";
}

export function shouldResetCachedSshAuth(error) {
  const message = connectionErrorMessage(error);
  return Boolean(
    isPrivateKeyPermissionError(error)
    || /authentication rejected/i.test(message)
    || /public key authentication failed/i.test(message)
    || /password authentication failed/i.test(message)
    || /keyboard-interactive authentication/i.test(message)
    || /failed to (load|read) private key/i.test(message)
    || /private key at .+ is not a regular file/i.test(message)
    || /Permission denied\s+\((?=[^)]*(?:publickey|password|keyboard-interactive))[^)]+\)/i.test(message)
  );
}

function buildPrivateKeyPermissionFix(path, mode) {
  const cleanPath = String(path || "").trim();
  if (!cleanPath) return null;
  return {
    path: cleanPath,
    mode: mode ? String(mode).replace(/^0+/, "") || "0" : null,
    command: `chmod 600 ${shellQuote(cleanPath)}`,
  };
}

function shellQuote(value) {
  const text = String(value || "");
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
