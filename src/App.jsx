import { useState, useEffect, useRef, useMemo } from "react";
import { buildSshAgentStatusDisplay } from "./lib/agentStatus.js";
import { getGlobalShortcutAction } from "./lib/appShortcuts.js";
import { buildAccentOptionDisplay, buildAppearancePageDisplay, buildThemeOptionDisplay, buildTypographyDisplay, loadAppearance, normalizeAppearance, resetAppearance, saveAppearance } from "./lib/appearanceStore.js";
import { appendUniqueChainNode, buildChainHopActionDisplay, removeChainNode, reorderChainByDrag } from "./lib/chainEditor.js";
import { buildCommandHistoryClearButtonDisplay, buildCommandHistoryClearConfirmation, clearCommandHistory, getCommandCompletion, loadCommandHistory, recordCommand, saveCommandHistory } from "./lib/commandHistory.js";
import { buildConfigSnapshot, buildConfigSnapshotImportSummary, formatConfigSnapshotImportConfirmation, getOrCreateConfigSyncDeviceId, makeConfigSnapshotFileName, parseConfigSnapshotEnvelope, serializeConfigSnapshot } from "./lib/configSync.js";
import { buildConnectionConfigPageDisplay, buildConnectionConfigProxyNodeDisplay, buildConnectionPathDisplayNodes, buildConnectionPathNodes, buildConnectionProbeSegmentDisplay, buildConnectionProbeSummary, describeConnectionPath, summarizeConnectionPath } from "./lib/connectionPath.js";
import { buildConnectionErrorState, formatConnectionError, shouldResetCachedSshAuth } from "./lib/connectionErrors.js";
import { buildCredentialRowDisplay, buildCredentialScanStatus, buildCredentialVaultDisplay } from "./lib/credentialDisplay.js";
import { attachCredentialUsage } from "./lib/credentialUsage.js";
import { copyTreeEntry, copyTreeFile, createTreeDir, getTreeEntry, isEditableTextFileName, listTreeEntries, normalizeTreeEntryName, readTreeText, treeEntrySize, writeTreeText } from "./lib/fileTree.js";
import { buildDangerConfirmation, detectDangerousCommand } from "./lib/dangerCommands.js";
import { buildForwardDeleteConfirmation, buildForwardRuleDisplay, buildForwardRuleFieldDisplay, buildForwardTypeCreateOptions, createForwardRule, describeForwardRule, validateForwardRule } from "./lib/forwardRules.js";
import { areHostCardActionsVisible, buildHostCardDisplay, buildHostFormDisplay, buildHostListEmptyState, buildHostListSummary, buildHostListToolbarDisplay, buildHostListTopBarDisplay, buildHostSidebarDisplay, canOpenHostSession, canOpenHostSftp, getHostCardActionPointerEvents, getHostCardActionTabIndex, getHostStatusPresentation } from "./lib/hostActions.js";
import { ALL_HOSTS_GROUP, buildHostGroupNavItemDisplay, countHostsInGroup, filterHostsByGroup, getHostGroupOptions, resolveSelectedHostGroup, sortHostsForDisplay } from "./lib/hostGroups.js";
import { buildUnknownHostKeyPrompt, isUnknownHostKeyError, markAuthTrustedForUnknownHostKey, shouldTrustUnknownHostKeyByDefault } from "./lib/hostKeyTrust.js";
import { buildHostProbeSummary, mergeHostProbeResults } from "./lib/hostProbeResults.js";
import { buildSshCommand, buildSshCommandPreviewDisplay, buildSshCommandStatusMessage } from "./lib/sshCommand.js";
import { addHost, buildHostDeleteConfirmation, loadHosts, removeHost, saveHosts, toggleHostFavorite, updateHostConfig, updateHostProfile } from "./lib/hostStore.js";
import { getVisibleHostTags } from "./lib/hostTags.js";
import { buildPaletteResults, formatHostAddress, formatUserHostPort } from "./lib/hosts.js";
import { buildSshConfigImportDropzoneDisplay, getReadableSelectedFile, resetFileInput } from "./lib/importFiles.js";
import { buildPaletteChromeDisplay, buildPaletteStatusMessage, getPaletteActionGuard, getPaletteActionHint } from "./lib/paletteActions.js";
import { buildPageShellDisplay } from "./lib/pageShell.js";
import { appendMonitorHistory, buildMonitorPanelDisplay, DEFAULT_MONITOR_HISTORY, DEFAULT_MONITOR_SAMPLE, normalizeMonitorSample } from "./lib/monitorDisplay.js";
import { buildProxyFieldDisplay, buildProxyModeOptions, normalizeIdentityFile, resolveSshAuth } from "./lib/sessionAuth.js";
import { buildSessionInputPlaceholder, buildSessionInputPrefix, getCommandTargetPaneIds } from "./lib/sessionBroadcast.js";
import { applyStartedForwardRuntime, buildSessionForwardBadge, getEnabledForwardRules, getForwardRulesSignature, startForwardRule } from "./lib/sessionForwards.js";
import { buildSessionStatusBadge } from "./lib/sessionStatusBadge.js";
import { buildSessionToolbarDisplay } from "./lib/sessionToolbar.js";
import { buildSessionTrzszPreviewPlan } from "./lib/sessionTrzszCommands.js";
import { addSnippet, buildSnippetDeleteConfirmation, buildSnippetDisplay, buildSnippetLibraryDisplay, buildSnippetSessionDrawerDisplay, buildSnippetStatusMessage, filterSnippetsByTag, getSnippetInsertCommand, getSnippetTagOptions, getSnippetTags, loadSnippets, removeSnippet, saveSnippets, updateSnippet } from "./lib/snippets.js";
import { formatMetaShortcut, isMetaShortcutEvent } from "./lib/shortcuts.js";
import { mergeImportedHosts, parseSshConfig } from "./lib/sshConfig.js";
import { buildSparklinePoints, getLatestSparklineValue, normalizeSparklineData } from "./lib/sparkline.js";
import { buildStatusMessage } from "./lib/statusMessage.js";
import { buildTerminalSearchBarDisplay, buildTerminalSearchOptions, clearRelayTerminalSearch, searchPreviewLines, searchRelayTerminal } from "./lib/terminalSearch.js";
import { buildTerminalRendererStatus } from "./lib/terminalRendererStatus.js";
import { buildLocalPtyErrorLine, buildLocalPtyStartingLine, buildLocalTerminalDisplay, buildSshConnectingLine, buildSshErrorLine, buildSshHostKeyAcceptedLine } from "./lib/terminalMessages.js";
import { clampPaletteIndex, getPaletteItemAt, movePaletteSelection } from "./lib/paletteNavigation.js";
import { buildKeychainSecretDeleteConfirmation, buildKeychainSecretPromptLabel, buildKeychainSecretRowDisplay, buildKeychainSecretSaveConfirmation, buildKeychainSecretSaveErrorMessage, buildKeychainVaultDisplay, buildManageableKeychainSecrets, buildProxyKeychainSecretTarget } from "./lib/keychainSecrets.js";
import { buildReducedMotionCss } from "./lib/motionPreferences.js";
import { buildFileSystemPathBreadcrumbs, buildRecursiveSftpWorkFile, buildSftpDirectionButtonDisplay, buildSftpEditorCloseConfirmation, buildSftpEditorDisplay, buildSftpEditorState, buildSftpFilePaneDisplay, buildSftpLocalFolderCreateErrorState, buildSftpNewFolderPromptLabel, buildSftpPageDisplay, buildSftpPaneStatusMessage, buildSftpRemoteConnectionControl, buildSftpRemoteOverwriteConfirmation, buildSftpToastMessage, buildStreamingTransferQueueItem, buildTransferQueueDisplay, buildTransferQueueSummary, buildTreePathBreadcrumbs, calculateTransferProgress, clearCompletedTransferQueue, describeUnsupportedTransferEntry, getSftpTransferAvailability, hasSftpEditorUnsavedChanges, joinLocalPath, joinRemotePath, planRealSftpFileTransfer, planRecursiveSftpFileTransfer, shouldPublishTransferProgress, summarizeRecursiveSftpWorkFiles } from "./lib/sftpTransfer.js";
import { createLocalDir, createLocalFile, createRemoteSftpDir, deleteKeychainSecret, deleteTotpSecret, getKeychainSecret, getSshAgentStatus, getTotpCode, isTauriRuntime, listCredentials, listLocalDir, listRemoteSftpDir, openLocalPty, openSshSession, probeHosts, readDefaultSshConfig, readLocalFileBase64, readLocalFileChunkBase64, readLocalText, readRemoteSftpFileBase64, readRemoteSftpFileChunkBase64, readRemoteSftpText, repairCredentialPermissions, sampleMonitor, saveKeychainSecret, saveTotpSecret, startDynamicForward, startLocalForward, startRemoteForward, stopForward, testJumpChain, writeLocalFileBase64, writeLocalFileChunkBase64, writeLocalText, writeRemoteSftpFileBase64, writeRemoteSftpFileChunkBase64, writeRemoteSftpText } from "./lib/tauriBridge.js";
import { createTrzszBridge, getTransferItems, hasUploadableTransferItems } from "./lib/trzszBridge.js";
import { buildTrzszCompletionLine, buildTrzszDragOverlayDisplay, buildTrzszNegotiationLine, getTrzszRouteInfo } from "./lib/trzszStatus.js";
import { installTauriFileSystemAccess } from "./lib/tauriFileSystemAccess.js";
import { addTotpProfile, attachTotpUsage, buildTotpDeleteConfirmation, buildTotpProfileDisplay, buildTotpVaultDisplay, findTotpProfileForTarget, loadTotpProfiles, removeTotpProfile, saveTotpProfiles, updateTotpProfile, validateTotpSecretSubmission } from "./lib/totpStore.js";
import { buildVaultStatusMessage, buildVaultUnlockDisplay, buildVaultUnlockResetConfirmation, clearVaultUnlockRecord, createVaultUnlockRecord, loadVaultUnlockRecord, saveVaultUnlockRecord, verifyVaultUnlockRecord } from "./lib/vaultUnlock.js";
import { buildEditableJumpHosts, finalizeJumpHostsForSave, patchEditableJumpHost, reconcileJumpHostsForChain } from "./lib/jumpHostConfig.js";

/* ================= 主题系统 =================
   T 为活动令牌,切换主题时整体替换并重渲染。
   accent 即品牌强调色;onAccent 为强调色上的文字。
============================================== */
const THEMES = {
  "琥珀夜航": {
    bg: "#0C0F14", panel: "#12161D", panelHi: "#181D26", line: "#232A35",
    text: "#E6EAF0", dim: "#8A94A6", faint: "#5A6374",
    amber: "#E8A33D", amberSoft: "rgba(232,163,61,0.12)", onAccent: "#1A1206",
    green: "#4CC38A", red: "#E5534B", blue: "#5B9DD9", blueSoft: "rgba(91,157,217,0.12)",
    desc: "默认 · 深石墨蓝与信号琥珀",
  },
  "深海驰行": {
    bg: "#0A0E17", panel: "#0F1524", panelHi: "#151D33", line: "#1F2A47",
    text: "#E4E9F4", dim: "#8693AD", faint: "#566180",
    amber: "#5B9DD9", amberSoft: "rgba(91,157,217,0.14)", onAccent: "#06101F",
    green: "#4CC38A", red: "#E5534B", blue: "#7FB7E8", blueSoft: "rgba(127,183,232,0.12)",
    desc: "冷调深蓝 · 长时间夜间值守",
  },
  "苔原信号": {
    bg: "#0D1210", panel: "#111A15", panelHi: "#17231C", line: "#23332A",
    text: "#E3EDE6", dim: "#88A091", faint: "#587263",
    amber: "#4CC38A", amberSoft: "rgba(76,195,138,0.13)", onAccent: "#06140C",
    green: "#4CC38A", red: "#E5534B", blue: "#5B9DD9", blueSoft: "rgba(91,157,217,0.12)",
    desc: "经典终端绿的现代演绎",
  },
  "极昼": {
    bg: "#F4F5F7", panel: "#FFFFFF", panelHi: "#ECEEF2", line: "#D9DDE4",
    text: "#1C2230", dim: "#5A6374", faint: "#8A94A6",
    amber: "#B45309", amberSoft: "rgba(180,83,9,0.10)", onAccent: "#FFF8EE",
    green: "#15803D", red: "#DC2626", blue: "#2563EB", blueSoft: "rgba(37,99,235,0.10)",
    desc: "高亮环境 / 投屏演示友好",
  },
};

const T = {
  ...THEMES["琥珀夜航"],
  termSize: 13,
  termLigatures: true,
  mono: "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  sans: "-apple-system, 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
};

const APPEARANCE_DEFAULTS = {
  themeName: "琥珀夜航",
  themeNames: Object.keys(THEMES),
  accent: THEMES["琥珀夜航"].amber,
  termSize: 13,
  termLigatures: true,
  minTermSize: 11,
  maxTermSize: 18,
};

function applyAppearanceTokens(appearance) {
  Object.assign(T, THEMES[appearance.themeName] || THEMES[APPEARANCE_DEFAULTS.themeName]);
  T.amber = appearance.accent;
  T.amberSoft = `${appearance.accent}22`;
  T.termSize = appearance.termSize;
  T.termLigatures = appearance.termLigatures;
}

/* 动态样式(随主题取值) */
const kbdStyle = () => ({ fontFamily: "inherit", fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.line}`, color: T.dim, background: T.panelHi });
const ghostBtn = () => ({ background: "transparent", border: `1px solid ${T.line}`, borderRadius: 8, color: T.dim, fontSize: 12, cursor: "pointer", fontFamily: T.sans });
const fieldStyle = () => ({ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", width: "100%", boxSizing: "border-box" });
const miniBtn = () => ({ width: 18, height: 18, borderRadius: 99, border: `1px solid ${T.line}`, background: T.panelHi, color: T.dim, fontSize: 11, lineHeight: "16px", cursor: "pointer", padding: 0 });
const lbl = () => ({ display: "block", fontSize: 11, color: T.faint, marginBottom: 6 });
const statusToneColor = tone => tone === "ok" ? T.green : tone === "warn" ? T.amber : tone === "pending" ? T.amber : T.faint;
const messageToneColor = (message, fallback = T.faint) => message?.tone === "error" ? T.red : message?.tone === "success" ? T.green : message?.tone === "pending" ? T.amber : fallback;
const colorByKey = (key, fallback = T.faint) => key === "red" ? T.red : key === "blue" ? T.blue : key === "amber" ? T.amber : key === "green" ? T.green : fallback;

/* ================= 模拟数据 ================= */
const HOSTS = [
  { id: 1, name: "prod-web-01", host: "10.2.1.11", user: "deploy", group: "生产环境", tags: ["nginx", "华东"], status: "online", lat: [22, 24, 21, 26, 23, 22, 25, 23], chain: ["bastion-sh"], fav: true },
  { id: 2, name: "prod-web-02", host: "10.2.1.12", user: "deploy", group: "生产环境", tags: ["nginx", "华东"], status: "online", lat: [24, 25, 28, 26, 30, 27, 26, 28], chain: ["bastion-sh"], fav: true },
  { id: 3, name: "prod-db-master", host: "10.2.2.5", user: "dba", group: "生产环境", tags: ["mysql", "核心"], status: "online", lat: [31, 30, 33, 35, 32, 31, 34, 33], chain: ["bastion-sh", "relay-db"], fav: false },
  { id: 4, name: "staging-api", host: "192.168.3.40", user: "ubuntu", group: "预发布", tags: ["k8s"], status: "online", lat: [12, 11, 13, 12, 14, 11, 12, 13], chain: [], fav: false },
  { id: 5, name: "gpu-train-a100", host: "172.16.8.2", user: "ml", group: "算力集群", tags: ["cuda", "A100"], status: "busy", lat: [45, 48, 44, 52, 47, 49, 46, 50], chain: ["bastion-sh"], fav: true },
  { id: 6, name: "backup-archive", host: "10.9.0.8", user: "root", group: "运维", tags: ["冷备"], status: "offline", lat: [], chain: ["bastion-sh"], fav: false },
];

const BASTIONS = [
  { name: "bastion-sh", host: "bastion-sh", port: 22, desc: "上海堡垒机 · 2FA", type: "堡垒机" },
  { name: "bastion-bj", host: "bastion-bj", port: 22, desc: "北京堡垒机 · 2FA", type: "堡垒机" },
  { name: "relay-db", host: "relay-db", port: 22, desc: "数据库网段中继", type: "中继" },
  { name: "relay-hk", host: "relay-hk", port: 22, desc: "香港出口中继", type: "中继" },
];

const GROUPS = [ALL_HOSTS_GROUP, "生产环境", "预发布", "算力集群", "运维"];

const EMPTY_HOST_FORM = { name: "", host: "", user: "", port: "22", group: "手动添加", tags: "", identityFile: "" };

const TERM_LINES = [
  { t: "$", c: "ssh deploy@prod-web-01  # 经由 bastion-sh", d: 0 },
  { t: ">", c: "已建立加密通道 · ed25519 · chacha20-poly1305", d: 600 },
  { t: ">", c: "指纹 SHA256:kF3x…9Qa 与已知主机一致 ✓", d: 1100 },
  { t: "#", c: "Welcome to Ubuntu 24.04 LTS · 负载 0.42 · 内存 31%", d: 1700 },
  { t: "$", c: "tail -f /var/log/nginx/access.log", d: 2600 },
  { t: " ", c: '203.0.113.7 - "GET /api/v2/orders HTTP/2" 200 1.2ms', d: 3300 },
  { t: " ", c: '198.51.100.23 - "POST /api/v2/pay HTTP/2" 201 8.4ms', d: 3900 },
];

async function requestConnectionSecret(target, kind) {
  const privateKeyPath = normalizeIdentityFile(target.identityFile || target.privateKeyPath);
  const req = {
    host: target.host,
    port: Number(target.port) || 22,
    user: target.user,
    kind,
    privateKeyPath,
  };

  if (isTauriRuntime()) {
    try {
      const stored = await getKeychainSecret(req);
      if (stored?.found && stored.secret) return stored.secret;
    } catch (err) {
      console.warn("RELAY keychain read failed", err);
    }
  }

  const secret = window.prompt(buildKeychainSecretPromptLabel(target, kind)) || "";
  if (!secret || !isTauriRuntime()) return secret;

  const shouldSave = window.confirm(buildKeychainSecretSaveConfirmation(target, kind));
  if (!shouldSave) return secret;

  try {
    await saveKeychainSecret({ ...req, secret });
  } catch (err) {
    window.alert(buildKeychainSecretSaveErrorMessage(target, kind, err));
  }

  return secret;
}

async function requestTotpCode(target, profiles = []) {
  const profile = findTotpProfileForTarget(target, profiles);
  if (!profile) return null;
  try {
    const result = await getTotpCode({ id: profile.id, digits: profile.digits, period: profile.period });
    return result?.code || null;
  } catch (err) {
    console.warn("RELAY TOTP generation failed", err);
    return null;
  }
}

function sshSecretProviders(totpProfiles = []) {
  return {
    passwordProvider: host => requestConnectionSecret(host, "password"),
    passphraseProvider: host => host.identityFile || host.privateKeyPath
      ? requestConnectionSecret(host, "privateKeyPassphrase")
      : "",
    proxyPasswordProvider: proxy => {
      const target = buildProxyKeychainSecretTarget(proxy);
      return target ? requestConnectionSecret(target, "proxyPassword") : "";
    },
    totpProvider: host => requestTotpCode(host, totpProfiles),
  };
}

function setupRuntimeSshPane({ containerRef, host, knownHosts, totpProfiles, sshRef, terminalRef, trzszRef, paneLabel = "", onMode, onError, onStatus, onRendererStatus, onReady }) {
  if (!isTauriRuntime() || !containerRef.current) return undefined;

  let disposed = false;
  let resizeObserver = null;
  let relayTerm = null;
  let syncSize = () => ({ cols: 120, rows: 32 });
  const syncRenderingVisibility = () => relayTerm?.setRenderingPaused(Boolean(document.hidden));

  const setup = async () => {
    installTauriFileSystemAccess();
    const { createRelayTerminal } = await import("./lib/terminal.js");
    if (disposed || !containerRef.current) return;

    relayTerm = createRelayTerminal({
      theme: T,
      fontFamily: T.mono,
      fontSize: T.termSize,
      fontLigatures: T.termLigatures,
      onData: data => {
        const bridge = trzszRef.current;
        if (bridge) bridge.processTerminalInput(data);
        else sshRef.current?.write(data);
      },
    });
    terminalRef.current = relayTerm;
    onRendererStatus?.({
      renderer: relayTerm.renderer,
      message: relayTerm.rendererMessage,
      webglEnabled: relayTerm.webglEnabled,
    });
    relayTerm.open(containerRef.current);
    syncRenderingVisibility();
    document.addEventListener("visibilitychange", syncRenderingVisibility);
    relayTerm.terminal.writeln(buildSshConnectingLine(host, paneLabel));
    trzszRef.current = createTrzszBridge({
      writeToTerminal: data => relayTerm.writeBytes(data),
      sendToServer: data => sshRef.current?.write(data),
      terminalColumns: relayTerm.terminal.cols,
      onStatus: status => {
        if (!disposed) onStatus?.(status);
      },
    });

    syncSize = () => {
      const size = relayTerm.resize();
      sshRef.current?.resize(size.cols, size.rows);
      trzszRef.current?.setTerminalColumns(size.cols);
      return size;
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(syncSize);
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener("resize", syncSize);
    }

    connect();
  };

  const connect = async () => {
    if (!relayTerm) return;
    try {
      const size = syncSize();
      const auth = await resolveSshAuth(host, {
        ...sshSecretProviders(totpProfiles),
        knownHosts,
      });
      if (disposed) return;
      const open = (trustUnknownHostKey = auth.trustUnknownHostKey ?? false) => openSshSession({
        ...auth,
        cols: size.cols,
        rows: size.rows,
        strictHostKey: auth.strictHostKey ?? true,
        trustUnknownHostKey,
        onData: bytes => {
          const bridge = trzszRef.current;
          if (bridge) bridge.processServerOutput(bytes);
          else relayTerm.writeBytes(bytes);
        },
      });
      let trustedUnknownHostKey = shouldTrustUnknownHostKeyByDefault(auth);
      try {
        sshRef.current = await open(trustedUnknownHostKey);
      } catch (err) {
        if (!isUnknownHostKeyError(err)) throw err;
        const accepted = window.confirm(buildUnknownHostKeyPrompt(host, err));
        if (!accepted) throw err;
        relayTerm.terminal.writeln(buildSshHostKeyAcceptedLine(host));
        trustedUnknownHostKey = true;
        sshRef.current = await open(true);
      }
      onReady?.(sshRef.current, trustedUnknownHostKey ? markAuthTrustedForUnknownHostKey(auth) : auth);
      onMode?.("connected");
      relayTerm.terminal.focus();
    } catch (err) {
      if (disposed) return;
      const message = formatConnectionError(err);
      onMode?.("error");
      onError?.(message);
      relayTerm.terminal.writeln(buildSshErrorLine(message));
    }
  };

  setup().catch(err => {
    if (disposed) return;
    onMode?.("error");
    onError?.(formatConnectionError(err));
  });

  return () => {
    disposed = true;
    resizeObserver?.disconnect();
    if (typeof ResizeObserver === "undefined") window.removeEventListener("resize", syncSize);
    document.removeEventListener("visibilitychange", syncRenderingVisibility);
    sshRef.current?.close?.();
    sshRef.current = null;
    onReady?.(null, null);
    onStatus?.(null);
    onRendererStatus?.(null);
    trzszRef.current = null;
    relayTerm?.dispose();
    terminalRef.current = null;
  };
}

function downloadTextFile(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function shortSyncHash(hash) {
  const value = String(hash || "").split(":").pop() || "";
  return value ? `#${value.slice(0, 8)}` : "#unknown";
}

function TerminalSearchBar({ query, setQuery, caseSensitive, setCaseSensitive, pane, setPane, splitEnabled, status, statusTone = "neutral", onNext, onPrevious, onClose }) {
  const display = buildTerminalSearchBarDisplay({ splitEnabled, pane, status, statusTone });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${T.line}`, background: T.panelHi, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: T.faint, fontFamily: T.mono }}>{display.label}</span>
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrevious();
            else onNext();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={display.inputPlaceholder}
        style={{ ...fieldStyle(), width: 260, padding: "6px 10px", fontSize: 12 }}
      />
      {display.paneOptions.length > 0 && (
        <div style={{ display: "flex", border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
          {display.paneOptions.map(option => (
            <button key={option.id} onClick={() => setPane(option.id)} style={{
              border: "none",
              borderRight: option.borderAfter ? `1px solid ${T.line}` : "none",
              background: option.selected ? T.amberSoft : "transparent",
              color: option.selected ? T.amber : T.dim,
              padding: "5px 9px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: T.sans,
            }}>{option.label}</button>
          ))}
        </div>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: caseSensitive ? T.amber : T.dim, cursor: "pointer" }}>
        <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />
        {display.caseSensitiveLabel}
      </label>
      <button onClick={onPrevious} style={{ ...ghostBtn(), padding: "5px 9px" }} title={display.previousTitle}>{display.previousIcon}</button>
      <button onClick={onNext} style={{ ...ghostBtn(), padding: "5px 9px" }} title={display.nextTitle}>{display.nextIcon}</button>
      <span style={{ fontSize: 11, color: messageToneColor({ tone: display.statusTone }, T.faint), fontFamily: T.mono }}>{display.statusText}</span>
      <button onClick={onClose} style={{ ...ghostBtn(), padding: "5px 9px", marginLeft: "auto" }} title={display.closeTitle}>{display.closeIcon}</button>
    </div>
  );
}

/* ================= 基础组件 ================= */
function Spark({ data, color, w = 64, h = 18 }) {
  if (!normalizeSparklineData(data).length) return <span style={{ color: T.faint, fontSize: 11 }}>—</span>;
  const pts = buildSparklinePoints(data, { width: w, height: h });
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

function Pulse({ status }) {
  const presentation = getHostStatusPresentation({ status });
  const c = presentation.tone === "online" ? T.green : presentation.tone === "busy" ? T.amber : T.faint;
  return (
    <span style={{ position: "relative", width: 8, height: 8, display: "inline-block", flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: c }} />
      {presentation.animated && <span style={{ position: "absolute", inset: -3, borderRadius: 99, border: `1px solid ${c}`, opacity: 0.5, animation: "pulse 2s ease-out infinite" }} />}
    </span>
  );
}

function Chain({ chain, jumpHosts, name, compact, proxy }) {
  const pathInput = { chain, jumpHosts, name, proxy };
  const nodes = buildConnectionPathNodes(pathInput);
  const displayNodes = buildConnectionPathDisplayNodes(pathInput, { limit: compact ? 5 : 7 });
  const hopCount = nodes.filter(node => node.kind === "hop").length;
  const displayTail = displayNodes.slice(1);
  const title = describeConnectionPath(pathInput);
  const summary = summarizeConnectionPath(pathInput);
  return (
    <div title={title} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono }}>本机</span>
      {displayTail.map((node, i) => {
        const isTarget = node.kind === "target";
        const isProxy = node.kind === "proxy";
        const isOverflow = node.kind === "overflow";
        return (
        <span key={`${node.kind}-${node.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={T.line} strokeWidth="1" strokeDasharray="2 3" /></svg>
          <span style={{
            fontSize: 10, fontFamily: T.mono, padding: "2px 7px", borderRadius: 99, whiteSpace: "nowrap",
            border: `1px solid ${isTarget ? T.amber : isProxy ? T.blue : T.line}`,
            color: isTarget ? T.amber : isProxy ? T.blue : isOverflow ? T.faint : T.dim,
            background: isTarget ? T.amberSoft : isProxy ? T.blueSoft : "transparent",
          }}>{node.label}</span>
        </span>
      );})}
      {!compact && (hopCount > 0 || proxy?.type && proxy.type !== "none") && <span style={{ fontSize: 10, color: T.faint }}>· {summary}</span>}
    </div>
  );
}

function SectionCard({ title, sub, children }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: T.faint, marginBottom: 16 }}>{sub}</div>
      {children}
    </div>
  );
}

function PageShell({ title, accentWord, onBack, children, action }) {
  const display = buildPageShellDisplay();
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 24px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={onBack} style={{ ...ghostBtn(), padding: "5px 12px" }}>{display.backLabel}</button>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{title}</h1>
          {accentWord && <span style={{ fontFamily: T.mono, fontSize: 13, color: T.amber }}>{accentWord}</span>}
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ================= 命令面板 ⌘K ================= */
function Palette({ hosts, onClose, onConnect, onOpenSftp, onCopyCommand }) {
  const [q, setQ] = useState("");
  const [message, setMessage] = useState(buildPaletteStatusMessage(""));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const chrome = useMemo(() => buildPaletteChromeDisplay(), []);
  useEffect(() => inputRef.current?.focus(), []);
  const results = useMemo(() => {
    return buildPaletteResults(hosts, q);
  }, [hosts, q]);
  useEffect(() => {
    setSelectedIndex(index => clampPaletteIndex(index, results.length));
  }, [results.length]);
  const selected = getPaletteItemAt(results, selectedIndex);
  const runActionFor = async (item, action) => {
    const guard = getPaletteActionGuard(item, action);
    if (!guard.ok) {
      setMessage(buildPaletteStatusMessage(guard.message, "error"));
      return;
    }
    if (action === "connect") onConnect(item);
    if (action === "sftp") onOpenSftp(item);
    if (action === "copy") {
      const ok = await onCopyCommand(item);
      setMessage(buildPaletteStatusMessage(
        ok ? "SSH 命令已复制" : "复制失败,当前环境不允许访问剪贴板",
        ok ? "success" : "error",
      ));
    }
  };
  const runAction = action => runActionFor(selected, action);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,7,10,0.6)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "center", paddingTop: "14vh", zIndex: 50, animation: "fadeIn .15s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "fit-content", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${T.line}` }}>
          <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 14 }}>›_</span>
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSelectedIndex(0); }}
            placeholder={chrome.inputPlaceholder}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.text, fontSize: 15, fontFamily: T.sans }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(index => movePaletteSelection(index, results.length, 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(index => movePaletteSelection(index, results.length, -1)); }
              if (e.key === "Home") { e.preventDefault(); setSelectedIndex(0); }
              if (e.key === "End") { e.preventDefault(); setSelectedIndex(clampPaletteIndex(results.length - 1, results.length)); }
              if (e.key === "Enter") runAction("connect");
              if (isMetaShortcutEvent(e, "c", { allowEditable: true })) { e.preventDefault(); runAction("copy"); }
              if (isMetaShortcutEvent(e, "f", { allowEditable: true })) { e.preventDefault(); runAction("sftp"); }
              if (e.key === "Escape") onClose();
            }}
          />
          <kbd style={kbdStyle()}>{chrome.escapeKey}</kbd>
        </div>
        <div style={{ padding: 6 }}>
          {results.map((h, i) => {
            const hint = getPaletteActionHint(h, i === selectedIndex);
            return (
            <button key={h.id} onMouseEnter={() => setSelectedIndex(i)} onClick={() => runActionFor(h, "connect")} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
              padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              background: i === selectedIndex ? T.panelHi : "transparent", color: T.text, fontFamily: T.sans,
            }}>
              <Pulse status={h.status} />
              <span style={{ fontFamily: T.mono, fontSize: 13 }}>{h.name}</span>
              <span style={{ fontSize: 12, color: T.faint, fontFamily: T.mono }}>{formatUserHostPort(h)}</span>
              {h.temporary && <span style={{ fontSize: 10, color: T.amber, fontFamily: T.mono }}>临时</span>}
              <span style={{ marginLeft: "auto", fontSize: 11, color: messageToneColor(hint, T.dim) }}>{hint.text}</span>
            </button>
          );})}
          {!results.length && <div style={{ padding: 20, textAlign: "center", color: T.faint, fontSize: 13 }}>{chrome.emptyResultsText}</div>}
          {message.text && <div style={{ padding: "2px 12px 8px", color: messageToneColor(message), fontSize: 12, fontFamily: T.mono }}>{message.text}</div>}
        </div>
        <div style={{ display: "flex", gap: 14, padding: "10px 18px", borderTop: `1px solid ${T.line}`, fontSize: 11, color: T.faint }}>
          {chrome.shortcuts.map(shortcut => (
            <span key={`${shortcut.key}-${shortcut.label}`}><kbd style={kbdStyle()}>{shortcut.key}</kbd> {shortcut.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= 主题管理 ================= */
function ThemePreview({ th }) {
  return (
    <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${th.line}` }}>
      <div style={{ background: th.bg, padding: "10px 12px", fontFamily: T.mono, fontSize: 10, lineHeight: 1.9 }}>
        <div><span style={{ color: th.amber }}>❯</span> <span style={{ color: th.text }}>ssh deploy@prod-web-01</span></div>
        <div style={{ color: th.dim }}>› 已建立加密通道 ✓</div>
        <div><span style={{ color: th.green }}>200</span> <span style={{ color: th.text }}>GET /api/v2</span> <span style={{ color: th.blue }}>1.2ms</span> <span style={{ color: th.red }}>0 err</span></div>
      </div>
      <div style={{ background: th.panel, padding: "6px 12px", display: "flex", gap: 5, alignItems: "center" }}>
        {[th.amber, th.green, th.red, th.blue, th.dim].map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />)}
      </div>
    </div>
  );
}

function ThemeView({ onBack, appearance, setTheme, setAccent, setTermSize, setTermLigatures, onResetAppearance }) {
  const ACCENTS = ["#E8A33D", "#4CC38A", "#5B9DD9", "#C586D9", "#E5534B"];
  const pageDisplay = buildAppearancePageDisplay();
  const typographyDisplay = buildTypographyDisplay(appearance);
  return (
    <PageShell title={pageDisplay.pageTitle} onBack={onBack}
      action={<div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.green }}>{pageDisplay.syncHint}</span>
        <button onClick={onResetAppearance} style={{ ...ghostBtn(), padding: "5px 10px", fontSize: 11 }}>{pageDisplay.resetText}</button>
      </div>}>

      <SectionCard title={pageDisplay.themeSectionTitle} sub={pageDisplay.themeSectionSubtitle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {Object.entries(THEMES).map(([name, th]) => {
            const display = buildThemeOptionDisplay({ name, theme: th, currentThemeName: appearance.themeName });
            return (
              <button key={name} onClick={() => setTheme(name)} style={{
                textAlign: "left", padding: 10, borderRadius: 14, cursor: "pointer", fontFamily: T.sans,
                border: `2px solid ${display.selected ? T.amber : T.line}`, background: T.panelHi, transition: "border-color .15s",
              }}>
                <ThemePreview th={th} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "0 2px" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{display.label}</span>
                  {display.badgeText && <span style={{ fontSize: 10, color: messageToneColor({ tone: display.borderTone }, T.amber), fontFamily: T.mono }}>{display.badgeText}</span>}
                </div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 3, padding: "0 2px" }}>{display.description}</div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={pageDisplay.accentSectionTitle} sub={pageDisplay.accentSectionSubtitle}>
        <div style={{ display: "flex", gap: 12 }}>
          {ACCENTS.map(c => {
            const display = buildAccentOptionDisplay({ color: c, currentAccent: appearance.accent });
            return (
              <button key={display.value} onClick={() => setAccent(display.value)} style={{
                width: 34, height: 34, borderRadius: 99, background: display.value, cursor: "pointer",
                border: display.selected ? `3px solid ${T.text}` : `3px solid transparent`, outline: `1px solid ${T.line}`,
              }} title={display.title} />
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={pageDisplay.typographySectionTitle} sub={pageDisplay.typographySectionSubtitle}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={lbl()}>{typographyDisplay.sizeLabel}</label>
            <input type="range" min="11" max="18" value={appearance.termSize} onChange={e => setTermSize(Number(e.target.value))} style={{ width: "100%", accentColor: T.amber }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.dim, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={appearance.termLigatures} onChange={e => setTermLigatures(e.target.checked)} style={{ accentColor: T.amber }} />
              {typographyDisplay.ligatureLabel}
            </label>
          </div>
          <div style={{ flex: 2, minWidth: 260, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 16px", fontFamily: T.mono, fontSize: appearance.termSize, color: T.text, fontVariantLigatures: typographyDisplay.ligatureCss }}>
            <span style={{ color: T.amber }}>❯</span> {typographyDisplay.previewText}
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}

/* ================= 命令片段库 ================= */
function SnippetsView({ onBack, snippets, onAdd, onUpdate, onDelete }) {
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", cmd: "", tag: "自定义", danger: false });
  const [message, setMessage] = useState(buildSnippetStatusMessage(""));
  const [activeTag, setActiveTag] = useState("全部");
  const snippetTags = useMemo(() => getSnippetTags(snippets), [snippets]);
  const snippetTagOptions = useMemo(() => getSnippetTagOptions(snippets), [snippets]);
  const visibleSnippets = useMemo(() => filterSnippetsByTag(snippets, activeTag), [snippets, activeTag]);
  const formDanger = useMemo(() => detectDangerousCommand(form.cmd), [form.cmd]);
  const snippetShortcut = formatMetaShortcut(";");
  const display = buildSnippetLibraryDisplay({ editing: Boolean(editingId), snippetShortcut });
  useEffect(() => {
    if (activeTag !== "全部" && !snippetTags.includes(activeTag)) setActiveTag("全部");
  }, [activeTag, snippetTags]);
  const submit = () => {
    try {
      if (editingId) onUpdate(editingId, form);
      else onAdd(form);
      setActiveTag((form.tag || "自定义").trim() || "自定义");
      setForm({ name: "", cmd: "", tag: "自定义", danger: false });
      setEditingId(null);
      setShowNew(false);
      setMessage(buildSnippetStatusMessage(editingId ? "片段已更新" : "片段已保存"));
    } catch (err) {
      setMessage(buildSnippetStatusMessage(err?.message || String(err), "error"));
    }
  };
  const openNewSnippet = () => {
    setEditingId(null);
    setForm({ name: "", cmd: "", tag: "自定义", danger: false });
    setShowNew(true);
  };
  const editSnippet = (snippet) => {
    setEditingId(snippet.id);
    setForm({
      name: snippet.name || "",
      cmd: snippet.cmd || "",
      tag: snippet.tag || "自定义",
      danger: Boolean(snippet.danger),
    });
    setShowNew(true);
  };
  const closeForm = () => {
    setShowNew(false);
    setEditingId(null);
    setForm({ name: "", cmd: "", tag: "自定义", danger: false });
  };
  const copySnippet = async (snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.cmd);
      setMessage(buildSnippetStatusMessage(`已复制 ${snippet.name}`));
    } catch {
      setMessage(buildSnippetStatusMessage("复制失败,当前环境不允许访问剪贴板", "error"));
    }
  };
  const deleteSnippet = (snippet) => {
    if (!window.confirm(buildSnippetDeleteConfirmation(snippet))) return;
    onDelete(snippet.id);
    setMessage(buildSnippetStatusMessage(`已删除 ${snippet.name}`));
  };

  return (
    <PageShell title={display.pageTitle} onBack={onBack}
      action={<button onClick={openNewSnippet} style={{ marginLeft: "auto", background: T.amber, border: "none", borderRadius: 8, padding: "7px 16px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>{display.createButtonText}</button>}>
      <SectionCard title={display.sectionTitle} sub={display.sectionSubtitle}>
        {message.text && <div style={{ marginBottom: 10, fontSize: 12, color: messageToneColor(message) }}>{message.text}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {snippetTagOptions.map(tag => {
            const selected = activeTag === tag;
            const count = tag === "全部" ? snippets.length : filterSnippetsByTag(snippets, tag).length;
            return (
              <button key={tag} onClick={() => setActiveTag(tag)}
                style={{ ...ghostBtn(), padding: "5px 10px", color: selected ? T.amber : T.dim, borderColor: selected ? T.amber : T.line, background: selected ? T.amberSoft : "transparent" }}>
                {tag} <span style={{ color: selected ? T.amber : T.faint, fontFamily: T.mono }}>{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleSnippets.map(s => {
            const snippetDisplay = buildSnippetDisplay(s);
            const badgeColor = messageToneColor({ tone: snippetDisplay.tone }, T.dim);
            const badgeBorder = messageToneColor({ tone: snippetDisplay.borderTone }, T.line);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: T.panelHi, minWidth: 0 }}>
                <span style={{ fontSize: 10, fontFamily: T.mono, padding: "3px 8px", borderRadius: 99, border: `1px solid ${badgeBorder}`, color: badgeColor, whiteSpace: "nowrap" }}>{snippetDisplay.tagBadge}</span>
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={snippetDisplay.name}>{snippetDisplay.name}</span>
                <code title={snippetDisplay.title} style={{ fontFamily: T.mono, fontSize: 12, color: T.dim, marginLeft: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 220px" }}>{snippetDisplay.command}</code>
                <button title={display.rowActions.editTitle} onClick={() => editSnippet(s)} style={{ ...ghostBtn(), padding: "4px 10px", flex: "0 0 auto" }}>{display.rowActions.editIcon}</button>
                <button title={display.rowActions.copyTitle} onClick={() => copySnippet(s)} style={{ ...ghostBtn(), padding: "4px 10px", flex: "0 0 auto" }}>{display.rowActions.copyIcon}</button>
                <button title={display.rowActions.deleteTitle} onClick={() => deleteSnippet(s)} style={{ ...ghostBtn(), padding: "4px 10px", color: T.red, flex: "0 0 auto" }}>{display.rowActions.deleteIcon}</button>
              </div>
            );
          })}
          {!visibleSnippets.length && <div style={{ padding: 18, color: T.faint, fontSize: 12, textAlign: "center" }}>{display.emptyText}</div>}
        </div>
      </SectionCard>
      {showNew && (
        <div onClick={closeForm} style={{ position: "fixed", inset: 0, background: "rgba(5,7,10,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "fadeIn .15s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: "94vw", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.55)" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600 }}>{display.form.title}</div>
            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              {display.form.fields.map(field => (
                <div key={field.key}>
                  <label style={lbl()}>{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea value={form[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} spellCheck={false}
                      style={{ ...fieldStyle(), minHeight: 92, resize: "vertical", lineHeight: 1.7 }} />
                  ) : (
                    <input style={fieldStyle()} value={form[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
                  )}
                </div>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.dim, cursor: "pointer" }}>
                <input type="checkbox" checked={form.danger || formDanger.danger} onChange={e => setForm({ ...form, danger: e.target.checked })} style={{ accentColor: T.amber }} />
                {display.form.dangerLabel}
              </label>
              {formDanger.danger && <span style={{ fontSize: 11, color: T.red, fontFamily: T.mono }}>{display.form.autoDangerPrefix} {formDanger.label}</span>}
            </div>
            <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.line}`, justifyContent: "flex-end" }}>
              <button onClick={closeForm} style={{ ...ghostBtn(), padding: "7px 16px" }}>{display.form.cancelText}</button>
              <button onClick={submit} style={{ background: T.amber, border: "none", borderRadius: 8, padding: "7px 18px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>{display.form.saveText}</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

/* ================= 凭据保险库 ================= */
function VaultView({ onBack, hosts = [], knownHosts = hosts, totpProfiles, setTotpProfiles }) {
  const vaultStorage = typeof window === "undefined" ? null : window.localStorage;
  const [credentials, setCredentials] = useState([]);
  const [totpCodes, setTotpCodes] = useState({});
  const [showTotpForm, setShowTotpForm] = useState(false);
  const [totpForm, setTotpForm] = useState({ label: "", issuer: "", account: "", secret: "", digits: 6, period: 30 });
  const [editingTotpId, setEditingTotpId] = useState("");
  const [totpMessage, setTotpMessage] = useState(buildVaultStatusMessage(""));
  const [credentialStatus, setCredentialStatus] = useState(buildVaultStatusMessage("正在读取凭据…"));
  const [repairing, setRepairing] = useState("");
  const [clearingSecretId, setClearingSecretId] = useState("");
  const [keychainMessage, setKeychainMessage] = useState(buildVaultStatusMessage(""));
  const [vaultUnlockReady, setVaultUnlockReady] = useState(false);
  const [vaultUnlockRecord, setVaultUnlockRecord] = useState(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultConfirm, setVaultConfirm] = useState("");
  const [vaultMessage, setVaultMessage] = useState(buildVaultStatusMessage(""));
  const displayedCredentials = useMemo(() => attachCredentialUsage(credentials, hosts, knownHosts), [credentials, hosts, knownHosts]);
  const displayedTotpProfiles = useMemo(() => attachTotpUsage(totpProfiles, hosts, knownHosts), [totpProfiles, hosts, knownHosts]);
  const totpDisplay = buildTotpVaultDisplay({ showForm: showTotpForm, editing: Boolean(editingTotpId) });
  const credentialDisplay = buildCredentialVaultDisplay();
  const keychainDisplay = buildKeychainVaultDisplay({ desktop: isTauriRuntime() });
  const manageableKeychainSecrets = useMemo(() => buildManageableKeychainSecrets(hosts, knownHosts), [hosts, knownHosts]);
  const vaultUnlockDisplay = buildVaultUnlockDisplay({
    ready: vaultUnlockReady,
    hasRecord: Boolean(vaultUnlockRecord),
    unlocked: vaultUnlocked,
  });
  const load = async () => {
    setCredentialStatus(buildVaultStatusMessage("正在读取凭据…"));
    try {
      const next = await listCredentials();
      setCredentials(next);
      const scanStatus = buildCredentialScanStatus(next, { desktop: isTauriRuntime() });
      setCredentialStatus(buildVaultStatusMessage(scanStatus.text, scanStatus.tone));
    } catch (err) {
      setCredentialStatus(buildVaultStatusMessage(err?.message || String(err), "error"));
    }
  };
  const repair = async (credential) => {
    if (!credential.privatePath) return;
    setRepairing(credential.privatePath);
    setCredentialStatus(buildVaultStatusMessage(`正在修复 ${credential.name} 私钥权限…`));
    try {
      const result = await repairCredentialPermissions(credential.privatePath);
      setCredentialStatus(buildVaultStatusMessage(`${credential.name}: ${result.message}`));
      await load();
    } catch (err) {
      setCredentialStatus(buildVaultStatusMessage(`修复失败: ${err?.message || String(err)}`, "error"));
    } finally {
      setRepairing("");
    }
  };
  useEffect(() => {
    const record = loadVaultUnlockRecord(vaultStorage);
    setVaultUnlockRecord(record);
    setVaultUnlockReady(true);
    setCredentialStatus(buildVaultStatusMessage(record ? "保险库已锁定" : "等待设置本地解锁密码"));
    setVaultMessage(buildVaultStatusMessage(record ? "输入主密码解锁凭据保险库" : "首次使用请设置本地解锁密码"));
  }, [vaultStorage]);

  useEffect(() => {
    if (vaultUnlocked) {
      load();
    }
  }, [vaultUnlocked]);

  const submitTotp = async () => {
    try {
      const secretSubmission = validateTotpSecretSubmission({
        editing: Boolean(editingTotpId),
        secret: totpForm.secret,
      });
      if (!secretSubmission.ok) {
        setTotpMessage(buildVaultStatusMessage(secretSubmission.message, "error"));
        return;
      }
      const input = {
        label: totpForm.label,
        issuer: totpForm.issuer,
        account: totpForm.account,
        digits: Number(totpForm.digits),
        period: Number(totpForm.period),
      };
      const next = editingTotpId
        ? updateTotpProfile(totpProfiles, editingTotpId, input)
        : addTotpProfile(totpProfiles, input);
      const profile = editingTotpId
        ? next.find(item => item.id === editingTotpId)
        : next.at(-1);
      if (secretSubmission.shouldSave) {
        await saveTotpSecret({ id: profile.id, secret: secretSubmission.secret });
      }
      setTotpProfiles(next);
      setTotpCodes(current => {
        const updated = { ...current };
        delete updated[profile.id];
        return updated;
      });
      setTotpForm({ label: "", issuer: "", account: "", secret: "", digits: 6, period: 30 });
      setEditingTotpId("");
      setShowTotpForm(false);
      setTotpMessage(buildVaultStatusMessage(`${profile.label} ${editingTotpId ? "已更新" : "已保存"}`));
      await refreshTotp(profile);
    } catch (err) {
      setTotpMessage(buildVaultStatusMessage(`保存失败: ${err?.message || String(err)}`, "error"));
    }
  };
  const editTotp = (profile) => {
    setEditingTotpId(profile.id);
    setTotpForm({
      label: profile.label || "",
      issuer: profile.issuer || "",
      account: profile.account || "",
      secret: "",
      digits: profile.digits || 6,
      period: profile.period || 30,
    });
    setShowTotpForm(true);
    setTotpMessage(buildVaultStatusMessage(`${profile.label} 编辑中;Secret 留空则保留原值`));
  };
  const closeTotpForm = () => {
    setShowTotpForm(false);
    setEditingTotpId("");
    setTotpForm({ label: "", issuer: "", account: "", secret: "", digits: 6, period: 30 });
  };
  const refreshTotp = async (profile) => {
    try {
      const result = await getTotpCode({ id: profile.id, digits: profile.digits, period: profile.period });
      setTotpCodes(current => ({ ...current, [profile.id]: result }));
      setTotpMessage(buildVaultStatusMessage(`${profile.label} 验证码已刷新`));
      return result;
    } catch (err) {
      setTotpMessage(buildVaultStatusMessage(`生成失败: ${err?.message || String(err)}`, "error"));
      return null;
    }
  };
  const copyTotp = async (profile) => {
    const result = totpCodes[profile.id] || await refreshTotp(profile);
    if (!result?.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setTotpMessage(buildVaultStatusMessage(`${profile.label} 验证码已复制`));
    } catch {
      setTotpMessage(buildVaultStatusMessage("复制失败,当前环境不允许访问剪贴板", "error"));
    }
  };
  const deleteTotp = async (profile) => {
    if (!window.confirm(buildTotpDeleteConfirmation(profile))) return;
    try {
      await deleteTotpSecret({ id: profile.id });
      setTotpProfiles(current => removeTotpProfile(current, profile.id));
      setTotpCodes(current => {
        const next = { ...current };
        delete next[profile.id];
        return next;
      });
      setTotpMessage(buildVaultStatusMessage(`${profile.label} 已删除`));
    } catch (err) {
      setTotpMessage(buildVaultStatusMessage(`删除失败: ${err?.message || String(err)}`, "error"));
    }
  };
  const clearKeychainSecret = async (secret) => {
    if (!isTauriRuntime()) {
      setKeychainMessage(buildVaultStatusMessage("系统钥匙串仅在桌面端可用", "error"));
      return;
    }
    if (!window.confirm(buildKeychainSecretDeleteConfirmation(secret))) return;
    setClearingSecretId(secret.id);
    setKeychainMessage(buildVaultStatusMessage(""));
    try {
      const result = await deleteKeychainSecret(secret.request);
      setKeychainMessage(buildVaultStatusMessage(`${secret.label}: ${result.message}`));
    } catch (err) {
      setKeychainMessage(buildVaultStatusMessage(`清除失败: ${err?.message || String(err)}`, "error"));
    } finally {
      setClearingSecretId("");
    }
  };
  const submitVaultUnlock = async (event) => {
    event.preventDefault();
    setVaultMessage(buildVaultStatusMessage(""));
    try {
      if (!vaultUnlockRecord) {
        if (vaultPassphrase !== vaultConfirm) {
          setVaultMessage(buildVaultStatusMessage("两次输入的主密码不一致", "error"));
          return;
        }
        const record = await createVaultUnlockRecord(vaultPassphrase);
        saveVaultUnlockRecord(vaultStorage, record);
        setVaultUnlockRecord(record);
        setVaultUnlocked(true);
        setVaultPassphrase("");
        setVaultConfirm("");
        setVaultMessage(buildVaultStatusMessage("本地解锁门禁已启用", "success"));
        return;
      }

      const ok = await verifyVaultUnlockRecord(vaultPassphrase, vaultUnlockRecord);
      if (!ok) {
        setVaultMessage(buildVaultStatusMessage("主密码不正确", "error"));
        return;
      }
      setVaultUnlocked(true);
      setVaultPassphrase("");
      setVaultConfirm("");
      setVaultMessage(buildVaultStatusMessage("主密码已解锁", "success"));
    } catch (err) {
      setVaultMessage(buildVaultStatusMessage(err?.message || String(err), "error"));
    }
  };
  const lockVault = () => {
    setVaultUnlocked(false);
    setVaultPassphrase("");
    setVaultConfirm("");
    setTotpCodes({});
    setCredentialStatus(buildVaultStatusMessage("保险库已锁定"));
    setVaultMessage(buildVaultStatusMessage("输入主密码解锁凭据保险库"));
  };
  const resetVaultUnlock = () => {
    if (vaultUnlockRecord && !window.confirm(buildVaultUnlockResetConfirmation())) return;
    clearVaultUnlockRecord(vaultStorage);
    setVaultUnlockRecord(null);
    setVaultUnlocked(false);
    setVaultPassphrase("");
    setVaultConfirm("");
    setTotpCodes({});
    setCredentialStatus(buildVaultStatusMessage("等待设置本地解锁密码"));
    setVaultMessage(buildVaultStatusMessage("本地解锁门禁已重置,请设置新的主密码"));
  };

  if (!vaultUnlockReady || !vaultUnlocked) {
    const setupMode = vaultUnlockDisplay.setupMode;
    const actionColor = messageToneColor({ tone: vaultUnlockDisplay.action.tone }, T.faint);
    return (
      <PageShell title={vaultUnlockDisplay.pageTitle} onBack={onBack}
        action={<span style={{ marginLeft: "auto", fontSize: 11, fontFamily: T.mono, color: actionColor }}>{vaultUnlockDisplay.action.text}</span>}>
        <SectionCard title={vaultUnlockDisplay.gate.title} sub={vaultUnlockDisplay.gate.subtitle}>
          <form onSubmit={submitVaultUnlock} style={{ maxWidth: 520, display: "grid", gap: 12 }}>
            <label style={{ fontSize: 11, color: T.faint }}>{vaultUnlockDisplay.gate.passphraseLabel}
              <input
                autoFocus
                type="password"
                value={vaultPassphrase}
                onChange={event => setVaultPassphrase(event.target.value)}
                style={{ ...fieldStyle(), marginTop: 6 }}
                placeholder={vaultUnlockDisplay.gate.passphrasePlaceholder}
              />
            </label>
            {vaultUnlockDisplay.gate.confirmVisible && (
              <label style={{ fontSize: 11, color: T.faint }}>{vaultUnlockDisplay.gate.confirmLabel}
                <input
                  type="password"
                  value={vaultConfirm}
                  onChange={event => setVaultConfirm(event.target.value)}
                  style={{ ...fieldStyle(), marginTop: 6 }}
                  placeholder={vaultUnlockDisplay.gate.confirmPlaceholder}
                />
              </label>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={{ background: T.amber, border: "none", borderRadius: 8, padding: "8px 16px", color: T.onAccent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.sans }}>
                {vaultUnlockDisplay.gate.submitText}
              </button>
              {vaultUnlockRecord && <button type="button" onClick={resetVaultUnlock} style={{ ...ghostBtn(), padding: "8px 14px", color: T.amber }}>{vaultUnlockDisplay.gate.resetText}</button>}
              <span style={{ fontSize: 11, color: messageToneColor(vaultMessage), fontFamily: T.mono }}>{vaultMessage.text}</span>
            </div>
          </form>
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell title={vaultUnlockDisplay.pageTitle} onBack={onBack}
      action={<div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontFamily: T.mono, color: messageToneColor({ tone: vaultUnlockDisplay.action.tone }, T.green) }}>{vaultUnlockDisplay.action.text}</span>
        <button onClick={lockVault} style={{ ...ghostBtn(), padding: "3px 9px" }}>{vaultUnlockDisplay.action.buttonText}</button>
      </div>}>
      <SectionCard title={credentialDisplay.sectionTitle} sub={credentialDisplay.sectionSubtitle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: messageToneColor(credentialStatus), fontFamily: T.mono }}>{credentialStatus.text}</span>
          <button onClick={load} style={{ ...ghostBtn(), padding: "3px 9px", marginLeft: "auto" }}>{credentialDisplay.refreshText}</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {displayedCredentials.map(v => {
            const rowDisplay = buildCredentialRowDisplay(v, { repairing: repairing === v.privatePath });
            const statusColor = messageToneColor(rowDisplay.status, T.faint);
            const canRepair = isTauriRuntime() && rowDisplay.status.status === "warning" && v.privatePath;
            return (
              <div key={v.name} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) auto auto", gap: 10, padding: "12px 14px", borderRadius: 10, background: T.panelHi, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 13 }}>{rowDisplay.name}</span>
                    <span style={{ fontSize: 11, color: T.faint }}>{rowDisplay.kind}</span>
                    <span title={rowDisplay.status.title} style={{ fontSize: 10, color: statusColor, border: `1px solid ${statusColor}`, borderRadius: 99, padding: "2px 7px", fontFamily: T.mono }}>{rowDisplay.status.label}</span>
                  </div>
                  <div style={{ marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>{rowDisplay.fingerprint}</span>
                    {rowDisplay.privatePath && <span title={rowDisplay.privatePath} style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowDisplay.privatePath}</span>}
                    {rowDisplay.message && <span style={{ fontSize: 10, color: statusColor }}>{rowDisplay.message}</span>}
                  </div>
                </div>
                <span title={rowDisplay.usageTitle} style={{ fontSize: 10, color: messageToneColor({ tone: rowDisplay.usageTone }, T.faint) }}>{rowDisplay.usageText}</span>
                <button
                  disabled={!canRepair || repairing === v.privatePath}
                  onClick={() => repair(v)}
                  style={{ ...ghostBtn(), padding: "4px 10px", color: canRepair ? T.amber : T.faint, opacity: canRepair ? 1 : 0.45, cursor: canRepair ? "pointer" : "not-allowed" }}
                >
                  {rowDisplay.repairText}
                </button>
              </div>
            );
          })}
          {!displayedCredentials.length && <div style={{ padding: 20, color: T.faint, fontSize: 12 }}>{credentialDisplay.emptyText}</div>}
        </div>
      </SectionCard>
      <SectionCard title={keychainDisplay.sectionTitle} sub={keychainDisplay.sectionSubtitle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: messageToneColor(keychainMessage), fontFamily: T.mono }}>
            {keychainMessage.text || keychainDisplay.defaultMessage}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {manageableKeychainSecrets.map(secret => {
            const disabled = !isTauriRuntime() || clearingSecretId === secret.id;
            const rowDisplay = buildKeychainSecretRowDisplay(secret, { clearing: clearingSecretId === secret.id });
            return (
              <div key={secret.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) minmax(180px, 1.2fr) auto", gap: 10, padding: "12px 14px", borderRadius: 10, background: T.panelHi, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 13 }}>{rowDisplay.label}</span>
                    <span style={{ fontSize: 10, color: T.amber, border: `1px solid ${T.amber}`, borderRadius: 99, padding: "2px 7px", fontFamily: T.mono }}>{rowDisplay.kindLabel}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10, color: T.faint, fontFamily: T.mono }}>{rowDisplay.ownerName}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div title={rowDisplay.target} style={{ fontSize: 11, color: T.dim, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowDisplay.target}</div>
                  {rowDisplay.privateKeyPath && <div title={rowDisplay.privateKeyPath} style={{ marginTop: 5, fontSize: 10, color: T.faint, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowDisplay.privateKeyPath}</div>}
                </div>
                <button
                  disabled={disabled}
                  onClick={() => clearKeychainSecret(secret)}
                  style={{ ...ghostBtn(), padding: "4px 10px", color: isTauriRuntime() ? T.red : T.faint, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                >
                  {rowDisplay.clearText}
                </button>
              </div>
            );
          })}
          {!manageableKeychainSecrets.length && <div style={{ padding: 20, color: T.faint, fontSize: 12 }}>{keychainDisplay.emptyText}</div>}
        </div>
      </SectionCard>
      <SectionCard title={totpDisplay.sectionTitle} sub={totpDisplay.sectionSubtitle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: messageToneColor(totpMessage), fontFamily: T.mono }}>{totpMessage.text || totpDisplay.defaultMessage}</span>
          <button onClick={() => showTotpForm ? closeTotpForm() : setShowTotpForm(true)} style={{ ...ghostBtn(), padding: "3px 9px", marginLeft: "auto", color: T.amber }}>{totpDisplay.toggleText}</button>
        </div>
        {showTotpForm && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, padding: 12, border: `1px solid ${T.line}`, borderRadius: 10, background: T.panelHi, marginBottom: 12 }}>
            {totpDisplay.form.fields.map(field => (
              <label key={field.key} style={{ fontSize: 11, color: T.faint }}>{field.label}
                <input
                  type={field.type}
                  min={field.min}
                  max={field.max}
                  autoComplete={field.type === "password" ? "off" : undefined}
                  spellCheck={field.type === "password" ? false : undefined}
                  style={{ ...fieldStyle(), marginTop: 6 }}
                  value={totpForm[field.key]}
                  onChange={e => setTotpForm({ ...totpForm, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                />
              </label>
            ))}
            <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
              <button onClick={submitTotp} style={{ background: T.amber, border: "none", borderRadius: 8, padding: "8px 14px", color: T.onAccent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.sans }}>{totpDisplay.form.submitText}</button>
              <button onClick={closeTotpForm} style={{ ...ghostBtn(), padding: "8px 14px" }}>{totpDisplay.form.cancelText}</button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {displayedTotpProfiles.map(profile => {
            const code = totpCodes[profile.id];
            const profileDisplay = buildTotpProfileDisplay(profile, code);
            return (
              <div key={profile.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) auto auto auto auto", gap: 10, padding: "12px 14px", borderRadius: 10, background: T.panelHi, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 13 }}>{profileDisplay.label}</span>
                    <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono }}>{profileDisplay.scope}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10, color: T.faint, fontFamily: T.mono }}>{profileDisplay.meta}</div>
                </div>
                <span style={{ fontSize: 18, color: profileDisplay.codeActive ? T.green : T.faint, fontFamily: T.mono, letterSpacing: 2 }}>{profileDisplay.codeText}</span>
                <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono }}>{profileDisplay.remainingText}</span>
                <span title={profileDisplay.usageTitle} style={{ fontSize: 10, color: messageToneColor({ tone: profileDisplay.usageTone }, T.faint), whiteSpace: "nowrap" }}>{profileDisplay.usageText}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => refreshTotp(profile)} style={{ ...ghostBtn(), padding: "4px 8px" }}>{totpDisplay.rowActions.generateText}</button>
                  <button onClick={() => copyTotp(profile)} style={{ ...ghostBtn(), padding: "4px 8px" }}>{totpDisplay.rowActions.copyText}</button>
                  <button onClick={() => editTotp(profile)} style={{ ...ghostBtn(), padding: "4px 8px", color: T.amber }}>{totpDisplay.rowActions.editText}</button>
                  <button onClick={() => deleteTotp(profile)} style={{ ...ghostBtn(), padding: "4px 8px", color: T.red }}>{totpDisplay.rowActions.deleteText}</button>
                </div>
              </div>
            );
          })}
          {!totpProfiles.length && <div style={{ padding: 20, color: T.faint, fontSize: 12 }}>{totpDisplay.emptyText}</div>}
        </div>
      </SectionCard>
    </PageShell>
  );
}

/* ================= 连接配置(链路/代理/转发) ================= */
function ConfigView({ host, knownHosts = [], totpProfiles = [], onBack, onSave }) {
  const [chain, setChain] = useState(host.chain.slice());
  const [showAdd, setShowAdd] = useState(false);
  const defaultProxy = { type: "none", host: "127.0.0.1", port: "1080", auth: false, cmd: "connect -S %h:%p" };
  const defaultForwards = [
    { id: 1, type: "L", lport: "5432", rhost: "10.2.2.5", rport: "5432", on: true },
    { id: 2, type: "D", lport: "1086", rhost: "", rport: "", on: false },
  ];
  const [proxy, setProxy] = useState(() => ({ ...defaultProxy, ...(host.proxy || {}) }));
  const [forwards, setForwards] = useState(() => (host.forwards || defaultForwards).map(f => ({ ...f })));
  const [jumpHostDrafts, setJumpHostDrafts] = useState(() => buildEditableJumpHosts({ host, knownHosts }));
  const [testResults, setTestResults] = useState([]);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");
  const [saveStatus, setSaveStatus] = useState(buildSshCommandStatusMessage(""));
  const [copyStatus, setCopyStatus] = useState(buildSshCommandStatusMessage(""));
  const [draggedHopIndex, setDraggedHopIndex] = useState(null);
  const resolvedJumpHosts = useMemo(() => finalizeJumpHostsForSave(chain, jumpHostDrafts, { fallbackUser: host.user }) || undefined, [chain, jumpHostDrafts, host.user]);
  const probeSummary = useMemo(() => buildConnectionProbeSummary(testResults), [testResults]);
  const pageDisplay = useMemo(() => buildConnectionConfigPageDisplay({
    hostName: host.name,
    testing,
    hasJumpHosts: chain.length > 0,
  }), [host.name, testing, chain.length]);

  const nodes = useMemo(() => {
    const n = [{ kind: "local", label: "本机" }];
    const proxyNode = buildConnectionConfigProxyNodeDisplay(proxy);
    if (proxyNode.visible) n.push({ kind: "proxy", label: proxyNode.label, sub: proxyNode.sub });
    chain.forEach((c, i) => {
      const b = BASTIONS.find(x => x.name === c);
      const jump = resolvedJumpHosts?.[i];
      const jumpHost = formatHostAddress(jump?.host);
      const sub = jumpHost ? `${jump.user ? `${String(jump.user).trim()}@` : ""}${jumpHost}:${jump.port || 22}` : b ? b.type : "跳板";
      n.push({ kind: "hop", label: c, sub, idx: i });
    });
    const targetUser = String(host.user || "").trim();
    const targetHost = formatHostAddress(host.host);
    n.push({ kind: "target", label: host.name, sub: `${targetUser ? `${targetUser}@` : ""}${targetHost}` });
    return n;
  }, [chain, proxy, host, resolvedJumpHosts]);

  const resetTest = () => {
    setTestResults([]);
    setTestError("");
  };
  const resetSaved = () => setSaveStatus(buildSshCommandStatusMessage(""));
  const commitChain = (nextChain) => {
    setChain(nextChain);
    setJumpHostDrafts(current => reconcileJumpHostsForChain(nextChain, {
      currentJumpHosts: current,
      knownHosts,
      fallbackUser: host.user,
    }));
    resetTest();
    resetSaved();
  };

  const runTest = async () => {
    setTesting(true);
    setTestError("");
    setTestResults([]);
    const proxyType = proxyFieldDisplay.type;
    const commandProxy = proxyType === "cmd";
    const networkProxy = proxyType === "socks5" || proxyType === "http";

    const reqNodes = nodes.map((n) => {
      if (n.kind === "local") return { label: n.label, kind: "local" };
      if (n.kind === "proxy") {
        return {
          label: n.label,
          kind: "proxy",
          host: commandProxy ? undefined : proxy.host,
          port: commandProxy ? undefined : Number(proxy.port) || undefined,
        };
      }
      if (n.kind === "hop") {
        const jump = resolvedJumpHosts?.[n.idx];
        return { label: n.label, kind: "hop", host: jump?.host || n.label, port: Number(jump?.port) || 22 };
      }
      return { label: n.label, kind: "target", host: host.host, port: Number(host.port) || 22 };
    });

    try {
      const proxyPassword = networkProxy && proxy.auth
        ? proxy.password || await sshSecretProviders(totpProfiles).proxyPasswordProvider(proxy)
        : null;
      const results = await testJumpChain({
        nodes: reqNodes,
        proxy: {
          kind: proxyType,
          host: commandProxy ? undefined : proxy.host,
          port: commandProxy ? undefined : Number(proxy.port) || undefined,
          username: proxy.auth ? proxy.username : undefined,
          password: proxy.auth ? proxyPassword : undefined,
          cmd: proxy.cmd,
        },
        timeoutMs: 1500,
      });
      setTestResults(results);
    } catch (err) {
      setTestError(err?.message || String(err));
    } finally {
      setTesting(false);
    }
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= chain.length) return;
    commitChain(reorderChainByDrag(chain, i, j));
  };
  const dropHop = (targetIndex, fromIndex = draggedHopIndex) => {
    if (fromIndex == null) return;
    commitChain(reorderChainByDrag(chain, fromIndex, targetIndex));
    setDraggedHopIndex(null);
  };
  const patchJumpHost = (index, patch) => {
    setJumpHostDrafts(items => patchEditableJumpHost(items, index, patch));
    resetTest();
    resetSaved();
  };
  const draftHostConfig = useMemo(() => ({
    ...host,
    chain,
    jumpHosts: resolvedJumpHosts,
    proxy,
    forwards,
  }), [host, chain, resolvedJumpHosts, proxy, forwards]);

  const saveConfig = () => {
    onSave?.(draftHostConfig);
    setSaveStatus(buildSshCommandStatusMessage("已保存"));
    setTimeout(() => setSaveStatus(buildSshCommandStatusMessage("")), 1800);
  };

  const sshPreview = useMemo(() => buildSshCommand({ host, chain, jumpHosts: resolvedJumpHosts, proxy, forwards }), [chain, proxy, forwards, host, resolvedJumpHosts]);
  const proxyModeOptions = useMemo(() => buildProxyModeOptions(proxy), [proxy]);
  const proxyFieldDisplay = useMemo(() => buildProxyFieldDisplay(proxy), [proxy]);
  const forwardTypeCreateOptions = useMemo(() => buildForwardTypeCreateOptions(), []);
  const sshPreviewDisplay = useMemo(() => buildSshCommandPreviewDisplay(sshPreview, copyStatus), [sshPreview, copyStatus]);
  const copySshPreview = async () => {
    if (sshPreviewDisplay.copyDisabled) {
      setCopyStatus(buildSshCommandStatusMessage("没有可复制的 SSH 命令", "error"));
      return;
    }
    try {
      await navigator.clipboard.writeText(sshPreviewDisplay.copyText);
      setCopyStatus(buildSshCommandStatusMessage("已复制"));
    } catch {
      setCopyStatus(buildSshCommandStatusMessage("复制失败", "error"));
    }
    setTimeout(() => setCopyStatus(buildSshCommandStatusMessage("")), 1600);
  };

  const fwdInput = (width = 84) => ({
    width,
    background: T.bg,
    border: `1px solid ${T.line}`,
    borderRadius: 6,
    color: T.text,
    fontFamily: T.mono,
    fontSize: 12,
    padding: "4px 7px",
    outline: "none",
    boxSizing: "border-box",
  });
  const jumpField = () => ({
    ...fieldStyle(),
    padding: "6px 8px",
    fontSize: 12,
  });
  const patchForward = (id, patch) => {
    resetSaved();
    setForwards(items => items.map(x => x.id === id ? { ...x, ...patch } : x));
  };
  const toggleForward = async (f) => {
    if (!isTauriRuntime()) {
      if (!f.on) {
        const validation = validateForwardRule(f);
        if (!validation.ok) {
          patchForward(f.id, { error: validation.message });
          return;
        }
      }
      patchForward(f.id, { on: !f.on, error: null });
      return;
    }

    if (f.on) {
      patchForward(f.id, { busy: true, error: null });
      try {
        if (f.runtimeId) await stopForward(f.runtimeId);
        patchForward(f.id, { on: false, busy: false, runtimeId: null, error: null });
      } catch (err) {
        patchForward(f.id, { busy: false, error: formatConnectionError(err) });
      }
      return;
    }

    const validation = validateForwardRule(f);
    if (!validation.ok) {
      patchForward(f.id, { error: validation.message });
      return;
    }

    patchForward(f.id, { busy: true, error: null });
    try {
      const auth = await resolveSshAuth(draftHostConfig, {
        ...sshSecretProviders(totpProfiles),
        knownHosts,
      });
      const ssh = {
        ...auth,
        strictHostKey: auth.strictHostKey ?? true,
        trustUnknownHostKey: auth.trustUnknownHostKey ?? false,
      };
      const startWithTrust = (trustUnknownHostKey = auth.trustUnknownHostKey ?? false) => {
        const trustedSsh = { ...ssh, trustUnknownHostKey };
        return startForwardRule(f, trustedSsh, {
          startDynamicForward,
          startRemoteForward,
          startLocalForward,
        });
      };
      let started;
      try {
        started = await startWithTrust(shouldTrustUnknownHostKeyByDefault(auth));
      } catch (err) {
        if (!isUnknownHostKeyError(err)) throw err;
        const accepted = window.confirm(buildUnknownHostKeyPrompt(host, err));
        if (!accepted) throw err;
        started = await startWithTrust(true);
      }
      patchForward(f.id, {
        ...applyStartedForwardRuntime(f, started),
      });
    } catch (err) {
      patchForward(f.id, { busy: false, error: formatConnectionError(err) });
    }
  };
  const removeForward = async (f) => {
    if (!window.confirm(buildForwardDeleteConfirmation(f))) return;
    if (isTauriRuntime() && f.runtimeId) {
      try {
        await stopForward(f.runtimeId);
      } catch (err) {
        patchForward(f.id, { error: formatConnectionError(err) });
        return;
      }
    }
    setForwards(items => items.filter(x => x.id !== f.id));
    resetSaved();
  };

  return (
    <PageShell title={pageDisplay.pageTitle} accentWord={pageDisplay.accentWord} onBack={onBack}
      action={<div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {saveStatus.text && <span style={{ fontSize: 12, color: messageToneColor(saveStatus), fontFamily: T.mono }}>{saveStatus.text}</span>}
        <button onClick={saveConfig} style={{ background: T.amber, border: "none", borderRadius: 8, padding: "7px 18px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>{pageDisplay.saveButtonLabel}</button>
      </div>}>

      <SectionCard title={pageDisplay.chainSectionTitle} sub={pageDisplay.chainSectionSubtitle}>
        <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap", rowGap: 18 }}>
          {nodes.map((n, i) => {
            const isLast = i === nodes.length - 1;
            const incoming = i > 0 ? testResults[i - 1] : null;
            const outgoing = testResults[i];
            const incomingDisplay = buildConnectionProbeSegmentDisplay(incoming);
            const outgoingDisplay = buildConnectionProbeSegmentDisplay(outgoing);
            const edgeColor = messageToneColor(outgoingDisplay, T.line);
            const nodeStatusColor = incomingDisplay.hasResult ? messageToneColor(incomingDisplay, T.faint) : null;
            const border = nodeStatusColor || (n.kind === "target" ? T.amber : n.kind === "proxy" ? T.blue : T.line);
            const isDraggedHop = n.kind === "hop" && draggedHopIndex === n.idx;
            const isDropTarget = n.kind === "hop" && draggedHopIndex != null && draggedHopIndex !== n.idx;
            const hopActions = n.kind === "hop" ? buildChainHopActionDisplay({ index: n.idx, total: chain.length }) : null;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div
                  draggable={n.kind === "hop"}
                  onDragStart={e => {
                    if (n.kind !== "hop") return;
                    setDraggedHopIndex(n.idx);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(n.idx));
                  }}
                  onDragOver={e => {
                    if (n.kind !== "hop" || draggedHopIndex == null || draggedHopIndex === n.idx) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={e => {
                    if (n.kind !== "hop") return;
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    dropHop(n.idx, Number.isInteger(from) ? from : draggedHopIndex);
                  }}
                  onDragEnd={() => setDraggedHopIndex(null)}
                  title={n.kind === "hop" ? pageDisplay.hopDragTitle : undefined}
                  style={{
                  position: "relative", minWidth: n.kind === "local" ? 64 : 116, padding: "10px 12px",
                  border: `1px solid ${isDropTarget ? T.amber : border}`, borderRadius: 12, textAlign: "center",
                  background: n.kind === "target" ? T.amberSoft : n.kind === "proxy" ? T.blueSoft : T.panelHi,
                  transition: "border-color .3s, opacity .2s, transform .2s",
                  cursor: n.kind === "hop" ? "grab" : "default",
                  opacity: isDraggedHop ? 0.45 : 1,
                  transform: isDropTarget ? "translateY(-1px)" : "none",
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 12, color: n.kind === "target" ? T.amber : n.kind === "proxy" ? T.blue : T.text }}>{n.label}</div>
                  {n.sub && <div style={{ fontSize: 10, color: T.faint, marginTop: 3, fontFamily: T.mono }}>{n.sub}</div>}
                  {incomingDisplay.hasResult && <div title={incomingDisplay.title} style={{ fontSize: 9, color: nodeStatusColor, marginTop: 4, fontFamily: T.mono }}>{incomingDisplay.label}</div>}
                  {n.kind === "hop" && (
                    <div style={{ position: "absolute", top: -10, right: -6, display: "flex", gap: 3 }}>
                      <button disabled={!hopActions.moveLeft.enabled} onClick={() => move(n.idx, -1)} title={hopActions.moveLeft.title || pageDisplay.moveLeftTitle} style={{ ...miniBtn(), opacity: hopActions.moveLeft.opacity, cursor: hopActions.moveLeft.cursor }}>‹</button>
                      <button disabled={!hopActions.moveRight.enabled} onClick={() => move(n.idx, 1)} title={hopActions.moveRight.title || pageDisplay.moveRightTitle} style={{ ...miniBtn(), opacity: hopActions.moveRight.opacity, cursor: hopActions.moveRight.cursor }}>›</button>
                      <button disabled={!hopActions.remove.enabled} onClick={() => commitChain(removeChainNode(chain, n.idx))} title={hopActions.remove.title || pageDisplay.removeHopTitle} style={{ ...miniBtn(), color: T.red, opacity: hopActions.remove.opacity, cursor: hopActions.remove.cursor }}>×</button>
                    </div>
                  )}
                </div>
                {!isLast && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 44 }}>
                    <svg width="44" height="10">
                      <line x1="2" y1="5" x2="42" y2="5" stroke={edgeColor} strokeWidth="1.5" strokeDasharray={outgoingDisplay.status === "ok" ? "0" : "3 4"} style={{ transition: "stroke .3s" }} />
                      <polygon points="42,5 36,2 36,8" fill={edgeColor} />
                    </svg>
                    {outgoingDisplay.latencyLabel && <span style={{ fontSize: 9, fontFamily: T.mono, color: T.green }}>{outgoingDisplay.latencyLabel}</span>}
                    {outgoingDisplay.showEdgeStatus && <span title={outgoingDisplay.title} style={{ fontSize: 9, fontFamily: T.mono, color: messageToneColor(outgoingDisplay, T.faint) }}>{outgoingDisplay.label}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center", position: "relative" }}>
          <button onClick={() => setShowAdd(s => !s)} style={{ ...ghostBtn(), padding: "6px 14px", color: T.amber, borderColor: T.amber }}>{pageDisplay.insertNodeLabel}</button>
          <button disabled={pageDisplay.testButtonDisabled} onClick={runTest} style={{ ...ghostBtn(), padding: "6px 14px", opacity: pageDisplay.testButtonDisabled ? 0.6 : 1 }}>{pageDisplay.testButtonLabel}</button>
          {probeSummary.text && <span title={probeSummary.title} style={{ fontSize: 12, color: messageToneColor(probeSummary), fontFamily: T.mono }}>{probeSummary.text}</span>}
          {testError && <span style={{ fontSize: 12, color: T.red }}>{testError}</span>}
          {showAdd && (
            <div style={{ position: "absolute", top: 40, left: 0, zIndex: 10, background: T.panelHi, border: `1px solid ${T.line}`, borderRadius: 12, padding: 6, width: 280, boxShadow: "0 16px 48px rgba(0,0,0,0.4)" }}>
              {BASTIONS.map(b => (
                <button key={b.name} disabled={chain.includes(b.name)}
                  onClick={() => { commitChain(appendUniqueChainNode(chain, b.name)); setShowAdd(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: chain.includes(b.name) ? "not-allowed" : "pointer", opacity: chain.includes(b.name) ? 0.4 : 1, textAlign: "left" }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, padding: "2px 7px", borderRadius: 99, border: `1px solid ${T.line}`, color: b.type === "堡垒机" ? T.amber : T.blue }}>{b.type}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text }}>{b.name}</span>
                  <span style={{ fontSize: 11, color: T.faint, marginLeft: "auto" }}>{b.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {pageDisplay.jumpAuthVisible && (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: T.dim, fontWeight: 600 }}>{pageDisplay.jumpAuthTitle}</div>
              <div style={{ fontSize: 11, color: T.faint }}>{pageDisplay.jumpAuthSubtitle}</div>
            </div>
            {chain.map((label, index) => {
              const jump = jumpHostDrafts[index] || {};
              return (
                <div key={`${label}-${index}`} style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(112px, .8fr) minmax(160px, 1.2fr) minmax(96px, .7fr) 78px minmax(160px, 1.2fr) minmax(150px, 1fr)",
                  gap: 8,
                  alignItems: "end",
                  padding: "10px 0",
                  borderTop: `1px solid ${T.line}`,
                }}>
                  <div>
                    <label style={lbl()}>{pageDisplay.jumpIndexLabelPrefix} {index + 1} {pageDisplay.jumpIndexLabelSuffix}</label>
                    <div style={{ ...jumpField(), display: "flex", alignItems: "center", color: T.amber, background: T.panelHi }}>{label}</div>
                  </div>
                  <div>
                    <label style={lbl()}>{pageDisplay.jumpHostLabel}</label>
                    <input style={jumpField()} value={jump.host || ""} onChange={e => patchJumpHost(index, { host: e.target.value })} placeholder={label} />
                  </div>
                  <div>
                    <label style={lbl()}>{pageDisplay.jumpUserLabel}</label>
                    <input style={jumpField()} value={jump.user || ""} onChange={e => patchJumpHost(index, { user: e.target.value })} placeholder={host.user} />
                  </div>
                  <div>
                    <label style={lbl()}>{pageDisplay.jumpPortLabel}</label>
                    <input style={jumpField()} value={jump.port || ""} onChange={e => patchJumpHost(index, { port: e.target.value })} placeholder={pageDisplay.defaultJumpPortPlaceholder} />
                  </div>
                  <div>
                    <label style={lbl()}>{pageDisplay.jumpIdentityFileLabel}</label>
                    <input style={jumpField()} value={jump.identityFile || ""} onChange={e => patchJumpHost(index, { identityFile: e.target.value })} placeholder={pageDisplay.defaultIdentityFilePlaceholder} />
                  </div>
                  <div>
                    <label style={lbl()}>{pageDisplay.jumpTotpLabel}</label>
                    <select style={{ ...jumpField(), fontFamily: T.sans }} value={jump.totpProfileId || ""} onChange={e => patchJumpHost(index, { totpProfileId: e.target.value })}>
                      <option value="">{pageDisplay.jumpTotpUnboundLabel}</option>
                      {totpProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title={pageDisplay.proxySectionTitle} sub={pageDisplay.proxySectionSubtitle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
          {proxyModeOptions.map(o => {
            return (
              <button key={o.type} onClick={() => { setProxy({ ...proxy, type: o.type }); resetTest(); resetSaved(); }} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: "pointer", fontFamily: T.sans,
                border: `1px solid ${T[o.borderKey] || T.line}`, background: T[o.backgroundKey] || T.panelHi,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T[o.colorKey] || T.text }}>{o.label}</div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{o.description}</div>
              </button>
            );
          })}
        </div>
        {proxyFieldDisplay.showEndpointFields && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label style={lbl()}>{proxyFieldDisplay.hostLabel}</label>
              <input style={fieldStyle()} value={proxy.host} onChange={e => { setProxy({ ...proxy, host: e.target.value }); resetTest(); resetSaved(); }} />
            </div>
            <div style={{ width: 100 }}>
              <label style={lbl()}>{proxyFieldDisplay.portLabel}</label>
              <input style={fieldStyle()} value={proxy.port} onChange={e => { setProxy({ ...proxy, port: e.target.value }); resetTest(); resetSaved(); }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.dim, marginTop: 18, cursor: "pointer" }}>
              <input type="checkbox" checked={proxy.auth} onChange={e => { setProxy({ ...proxy, auth: e.target.checked }); resetTest(); resetSaved(); }} style={{ accentColor: T.amber }} />
              {proxyFieldDisplay.authLabel}
            </label>
            {proxyFieldDisplay.showAuthFields && (
              <>
                <div style={{ width: 140 }}>
                  <label style={lbl()}>{proxyFieldDisplay.usernameLabel}</label>
                  <input style={fieldStyle()} value={proxy.username || ""} onChange={e => { setProxy({ ...proxy, username: e.target.value }); resetTest(); resetSaved(); }} />
                </div>
                <div style={{ width: 180 }}>
                  <label style={lbl()}>{proxyFieldDisplay.passwordLabel}</label>
                  <input type="password" style={fieldStyle()} value={proxy.password || ""} onChange={e => { setProxy({ ...proxy, password: e.target.value }); resetTest(); resetSaved(); }} placeholder={proxyFieldDisplay.passwordPlaceholder} />
                </div>
              </>
            )}
          </div>
        )}
        {proxyFieldDisplay.showCommandField && (
          <div>
            <label style={lbl()}>{proxyFieldDisplay.commandLabel}</label>
            <input style={fieldStyle()} value={proxy.cmd} onChange={e => { setProxy({ ...proxy, cmd: e.target.value }); resetTest(); resetSaved(); }} />
          </div>
        )}
      </SectionCard>

      <SectionCard title={pageDisplay.forwardsSectionTitle} sub={pageDisplay.forwardsSectionSubtitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {forwards.map(f => {
            const display = buildForwardRuleDisplay(f);
            const fields = buildForwardRuleFieldDisplay(f);
            const typeColor = colorByKey(display.colorKey, T.red);
            const inputDisabled = f.busy || f.runtimeId || !display.supported;
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: T.panelHi, opacity: display.opacity, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontFamily: T.mono, padding: "3px 8px", borderRadius: 99, border: `1px solid ${typeColor}`, color: typeColor, flexShrink: 0 }}>{display.typeBadge}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: T.mono, fontSize: 12, flex: 1, flexWrap: "wrap" }}>
                  <span style={{ color: T.faint }}>{fields.sourcePrefix}</span>
                  <input value={fields.sourcePortValue} onChange={e => patchForward(f.id, { [fields.sourcePortPatchKey]: e.target.value, error: null })} disabled={inputDisabled} style={fwdInput(72)} title={fields.sourcePortTitle} />
                  <svg width="34" height="10"><line x1="2" y1="5" x2="30" y2="5" stroke={typeColor} strokeWidth="1.2" /><polygon points={fields.arrowPoints} fill={typeColor} /></svg>
                  {fields.showDynamicTarget && <span style={{ color: T.dim }}>{fields.dynamicTargetLabel}</span>}
                  {fields.showTargetFields && (
                    <>
                      <input value={fields.targetHostValue} onChange={e => patchForward(f.id, { [fields.targetHostPatchKey]: e.target.value, error: null })} disabled={inputDisabled} style={fwdInput(132)} title={fields.targetHostTitle} />
                      <span style={{ color: T.faint }}>:</span>
                      <input value={fields.targetPortValue} onChange={e => patchForward(f.id, { [fields.targetPortPatchKey]: e.target.value, error: null })} disabled={inputDisabled} style={fwdInput(72)} title={fields.targetPortTitle} />
                    </>
                  )}
                  <span style={{ fontSize: 10, color: T.faint }}>{display.description}</span>
                  {display.activeVisible && <span style={{ fontSize: 10, color: T.green }}>● 活跃</span>}
                  {display.runtimeVisible && <span style={{ fontSize: 10, color: T.faint }}>{display.runtimeLabel}</span>}
                </div>
                <button disabled={display.toggleDisabled} onClick={() => toggleForward(f)} style={{ ...ghostBtn(), padding: "4px 12px", color: messageToneColor({ tone: display.toggleTone }, T.faint), opacity: display.toggleDisabled ? 0.6 : 1 }}>{display.toggleText}</button>
                <button disabled={display.deleteDisabled} onClick={() => removeForward(f)} style={{ ...ghostBtn(), padding: "4px 10px", color: T.red, opacity: display.deleteDisabled ? 0.6 : 1 }}>×</button>
                {f.error && <div style={{ width: "100%", marginLeft: 92, fontSize: 11, color: T.red }}>{f.error}</div>}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8 }}>
            {forwardTypeCreateOptions.map(option => (
              <button key={option.type} onClick={() => { setForwards([...forwards, createForwardRule(option.type, Date.now() + Math.random())]); resetSaved(); }}
                style={{ ...ghostBtn(), padding: "6px 14px", color: colorByKey(option.colorKey, T.text) }}>{option.label}</button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={pageDisplay.sshCommandSectionTitle} sub={pageDisplay.sshCommandSectionSubtitle}>
        <pre style={{ margin: 0, padding: 16, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, fontFamily: T.mono, fontSize: 12, lineHeight: 1.8, color: sshPreviewDisplay.hasWarnings ? T.amber : T.green, overflowX: "auto", whiteSpace: "pre-wrap" }}>{sshPreviewDisplay.commandText}</pre>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button disabled={sshPreviewDisplay.copyDisabled} title={sshPreviewDisplay.copyButtonTitle} onClick={copySshPreview} style={{ ...ghostBtn(), padding: "6px 14px", opacity: sshPreviewDisplay.copyDisabled ? 0.55 : 1 }}>{sshPreviewDisplay.copyButtonLabel}</button>
          {sshPreviewDisplay.statusVisible && <span style={{ fontSize: 12, color: messageToneColor({ tone: sshPreviewDisplay.statusTone }), fontFamily: T.mono }}>{sshPreviewDisplay.statusText}</span>}
        </div>
      </SectionCard>
    </PageShell>
  );
}

/* ================= 监控面板(FinalShell 式) ================= */
function Meter({ label, value, color, suffix = "%" }) {
  const width = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
        <span style={{ color: T.dim }}>{label}</span>
        <span style={{ fontFamily: T.mono, color }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: T.line, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 99, transition: "width .8s ease" }} />
      </div>
    </div>
  );
}

function monitorColor(colorKey) {
  return colorKey === "red" ? T.red : colorKey === "blue" ? T.blue : colorKey === "amber" ? T.amber : T.green;
}

function MonitorPanel({ auth = null }) {
  const [sample, setSample] = useState(DEFAULT_MONITOR_SAMPLE);
  const sampleRef = useRef(DEFAULT_MONITOR_SAMPLE);
  const [cpu, setCpu] = useState(DEFAULT_MONITOR_HISTORY.cpu);
  const [net, setNet] = useState(DEFAULT_MONITOR_HISTORY.networkDownMbps);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      let next = null;
      try {
        next = isTauriRuntime()
          ? await sampleMonitor(auth)
          : {
          ...sampleRef.current,
          cpu: 25 + Math.floor(Math.random() * 30),
          networkDownMbps: 3 + Math.floor(Math.random() * 12),
        };
      } catch {}
      if (!alive) return;
      const normalized = normalizeMonitorSample(next, sampleRef.current);
      sampleRef.current = normalized;
      setSample(normalized);
      setCpu(p => appendMonitorHistory(p, normalized.cpu));
      setNet(p => appendMonitorHistory(p, normalized.networkDownMbps));
    };
    pull();
    const t = setInterval(pull, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [auth]);
  const display = buildMonitorPanelDisplay({ sample, cpuHistory: cpu, networkHistory: net });
  return (
    <div style={{ width: 210, flexShrink: 0, borderLeft: `1px solid ${T.line}`, padding: 16, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
      <div style={{ fontSize: 10, color: T.faint, letterSpacing: 2 }}>{display.panelTitle}</div>
      {display.meters.map(meter => (
        <Meter key={meter.key} label={meter.label} value={meter.value} suffix={meter.suffix} color={monitorColor(meter.colorKey)} />
      ))}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
          <span style={{ color: T.dim }}>{display.network.label}</span>
          <span style={{ fontFamily: T.mono, color: monitorColor(display.network.colorKey) }}>{display.network.rateLabel}</span>
        </div>
        <Spark data={display.network.data} color={monitorColor(display.network.colorKey)} w={176} h={32} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: T.dim, marginBottom: 6 }}>{display.cpuTrend.label}</div>
        <Spark data={display.cpuTrend.data} color={monitorColor(display.cpuTrend.colorKey)} w={176} h={32} />
      </div>
      <div style={{ marginTop: "auto", fontSize: 10, color: T.faint, lineHeight: 1.8, fontFamily: T.mono }}>
        {display.footerLine}<br />{display.footerDetail}
      </div>
    </div>
  );
}

/* ================= 会话视图 ================= */
function Session({ host, knownHosts = [], totpProfiles = [], snippets, commandHistory, onCommandRun, onClearCommandHistory, onBack, onSftp }) {
  const [lines, setLines] = useState([]);
  const [splitLines, setSplitLines] = useState([]);
  const [sessionMode, setSessionMode] = useState(isTauriRuntime() ? "connecting" : "preview");
  const [splitSessionMode, setSplitSessionMode] = useState("disabled");
  const [sessionError, setSessionError] = useState("");
  const [splitSessionError, setSplitSessionError] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [activePaneId, setActivePaneId] = useState("primary");
  const [broadcast, setBroadcast] = useState(false);
  const [showSnip, setShowSnip] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [terminalSearch, setTerminalSearch] = useState({
    query: "",
    pane: "primary",
    caseSensitive: false,
    status: "",
    statusTone: "neutral",
  });
  const [sessionSnippetTag, setSessionSnippetTag] = useState("全部");
  const [showMon, setShowMon] = useState(true);
  const [input, setInput] = useState("");
  const [trz, setTrz] = useState(null);   // 活跃的 trzsz 传输 {name,size,dir,progress}
  const [trzStatus, setTrzStatus] = useState(null);
  const [splitTrzStatus, setSplitTrzStatus] = useState(null);
  const [terminalRendererStatus, setTerminalRendererStatus] = useState(null);
  const [splitTerminalRendererStatus, setSplitTerminalRendererStatus] = useState(null);
  const [monitorAuth, setMonitorAuth] = useState(null);
  const [sessionAuth, setSessionAuth] = useState(null);
  const [sessionForwardStatus, setSessionForwardStatus] = useState({
    state: "idle",
    total: 0,
    started: 0,
    message: "",
    errors: [],
  });
  const [dragPane, setDragPane] = useState(null);
  const termRef = useRef(null);
  const splitTermRef = useRef(null);
  const xtermRef = useRef(null);
  const splitXtermRef = useRef(null);
  const terminalRef = useRef(null);
  const splitTerminalRef = useRef(null);
  const inputRef = useRef(null);
  const sshRef = useRef(null);
  const splitSshRef = useRef(null);
  const trzszRef = useRef(null);
  const splitTrzszRef = useRef(null);
  const forwardRulesSignature = useMemo(() => getForwardRulesSignature(host.forwards), [host.forwards]);

  useEffect(() => {
    if (isTauriRuntime()) return undefined;
    const timers = TERM_LINES.map(l => setTimeout(() => setLines(p => [...p, l]), l.d));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => { termRef.current?.scrollTo(0, 1e9); }, [lines, trz]);
  useEffect(() => { splitTermRef.current?.scrollTo(0, 1e9); }, [splitLines]);
  useEffect(() => {
    const onKeyDown = event => {
      if (isMetaShortcutEvent(event, ";", { allowEditable: true })) {
        event.preventDefault();
        setShowSnip(open => !open);
      }
      if (isMetaShortcutEvent(event, "f", { allowEditable: true })) {
        event.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setSessionMode(isTauriRuntime() ? "connecting" : "preview");
    setSessionError("");
    setSessionAuth(null);
    setTerminalRendererStatus(null);
    return setupRuntimeSshPane({
      containerRef: xtermRef,
      host,
      knownHosts,
      totpProfiles,
      sshRef,
      terminalRef,
      trzszRef,
      onMode: setSessionMode,
      onError: setSessionError,
      onStatus: setTrzStatus,
      onRendererStatus: setTerminalRendererStatus,
      onReady: (session, auth) => {
        setMonitorAuth(session?.sessionId ? { sessionId: session.sessionId } : null);
        setSessionAuth(auth || null);
      },
    });
  }, [host.id]);

  useEffect(() => {
    const rules = getEnabledForwardRules(host.forwards);
    if (!rules.length) {
      setSessionForwardStatus({ state: "idle", total: 0, started: 0, message: "", errors: [] });
      return undefined;
    }

    if (!isTauriRuntime()) {
      setSessionForwardStatus({
        state: "preview",
        total: rules.length,
        started: 0,
        message: `${rules.length} 条转发规则会在桌面会话连接后自动建立`,
        errors: [],
      });
      return undefined;
    }

    if (!sessionAuth) {
      setSessionForwardStatus({
        state: "waiting",
        total: rules.length,
        started: 0,
        message: "等待 SSH 会话连接后自动建立转发",
        errors: [],
      });
      return undefined;
    }

    let disposed = false;
    const runtimeIds = [];
    const starters = { startDynamicForward, startRemoteForward, startLocalForward };
    const baseSsh = {
      ...sessionAuth,
      strictHostKey: sessionAuth.strictHostKey ?? true,
      trustUnknownHostKey: sessionAuth.trustUnknownHostKey ?? false,
    };

    const start = async () => {
      let startedCount = 0;
      const errors = [];
      let forwardTrustUnknownHostKey = shouldTrustUnknownHostKeyByDefault(baseSsh);
      setSessionForwardStatus({
        state: "starting",
        total: rules.length,
        started: 0,
        message: `正在自动建立 ${rules.length} 条转发规则`,
        errors: [],
      });

      for (const rule of rules) {
        if (disposed) break;
        const startWithTrust = (trustUnknownHostKey = baseSsh.trustUnknownHostKey ?? false) => startForwardRule(rule, {
          ...baseSsh,
          trustUnknownHostKey,
        }, starters);

        try {
          let started;
          try {
            started = await startWithTrust(forwardTrustUnknownHostKey);
          } catch (err) {
            if (!isUnknownHostKeyError(err)) throw err;
            const accepted = window.confirm(buildUnknownHostKeyPrompt(host, err));
            if (!accepted) throw err;
            forwardTrustUnknownHostKey = true;
            started = await startWithTrust(true);
          }

          if (disposed) {
            await stopForward(started.id).catch(() => {});
            continue;
          }

          runtimeIds.push(started.id);
          startedCount += 1;
          setSessionForwardStatus({
            state: "starting",
            total: rules.length,
            started: startedCount,
            message: `已建立 ${startedCount}/${rules.length} 条转发规则`,
            errors: errors.slice(),
          });
        } catch (err) {
          errors.push(`${describeForwardRule(rule)}: ${formatConnectionError(err)}`);
          setSessionForwardStatus({
            state: "partial",
            total: rules.length,
            started: startedCount,
            message: `转发自动建立失败 ${errors.length} 条`,
            errors: errors.slice(),
          });
        }
      }

      if (disposed) return;
      setSessionForwardStatus({
        state: errors.length ? "partial" : "ready",
        total: rules.length,
        started: startedCount,
        message: errors.length
          ? `已建立 ${startedCount}/${rules.length} 条转发规则, ${errors.length} 条失败`
          : `已自动建立 ${startedCount} 条转发规则`,
        errors,
      });
    };

    start();

    return () => {
      disposed = true;
      runtimeIds.forEach(id => {
        stopForward(id).catch(err => console.warn("RELAY auto-forward stop failed", err));
      });
    };
  }, [sessionAuth, host.id, forwardRulesSignature]);

  useEffect(() => {
    if (!splitEnabled) {
      setActivePaneId("primary");
      setSplitSessionMode("disabled");
      setSplitSessionError("");
      setSplitTrzStatus(null);
      return undefined;
    }
    if (!isTauriRuntime()) {
      setSplitSessionMode("preview");
      setSplitLines(ls => ls.length ? ls : [
        { t: ">", c: `拆分会话已打开:${host.user}@${host.host}` },
        { t: "$", c: "watch -n1 uptime" },
      ]);
      return undefined;
    }
    setSplitSessionMode("connecting");
    setSplitSessionError("");
    setSplitTerminalRendererStatus(null);
    return setupRuntimeSshPane({
      containerRef: splitXtermRef,
      host,
      knownHosts,
      totpProfiles,
      sshRef: splitSshRef,
      terminalRef: splitTerminalRef,
      trzszRef: splitTrzszRef,
      paneLabel: "split",
      onMode: setSplitSessionMode,
      onError: setSplitSessionError,
      onStatus: setSplitTrzStatus,
      onRendererStatus: setSplitTerminalRendererStatus,
    });
  }, [splitEnabled, host.id]);

  /* trzsz 进度推进 */
  useEffect(() => {
    if (!trz) return;
    const t = setInterval(() => {
      setTrz(p => {
        if (!p) return p;
        const np = Math.min(p.progress + 5 + Math.random() * 12, 100);
        if (np >= 100) {
          setLines(ls => [...ls, { t: ">", c: buildTrzszCompletionLine({ name: p.name, sizeLabel: fmtSize(p.size), direction: p.dir, routeInfo: p.routeInfo }) }]);
          return null;
        }
        return { ...p, progress: np };
      });
    }, 300);
    return () => clearInterval(t);
  }, [trz ? trz.name : null]);

  const startTrz = (name, size, dir, commandText = dir === "up" ? "trz" : `tsz ${name}`) => {
    const routeInfo = getTrzszRouteInfo(host);
    setLines(ls => [...ls, { t: "$", c: commandText },
      { t: ">", c: buildTrzszNegotiationLine(host) }]);
    setTrz({ name, size, dir, progress: 0, routeInfo });
  };

  const getPaneRefs = (paneId) => paneId === "split"
    ? { ssh: splitSshRef, bridge: splitTrzszRef, terminal: splitTerminalRef }
    : { ssh: sshRef, bridge: trzszRef, terminal: terminalRef };

  const writeCommandToPane = (paneId, cmd) => {
    const { ssh, bridge } = getPaneRefs(paneId);
    if (!ssh.current) return false;
    if (bridge.current) bridge.current.processTerminalInput(`${cmd}\r`);
    else ssh.current.write(`${cmd}\r`);
    return true;
  };

  const appendPreviewCommand = (paneId, cmd) => {
    const append = paneId === "split" ? setSplitLines : setLines;
    append(ls => [...ls, { t: "$", c: cmd }]);
  };

  const onDrop = paneId => e => {
    e.preventDefault(); setDragPane(null);
    setActivePaneId(paneId);
    const f = e.dataTransfer?.files?.[0];
    const { ssh, bridge, terminal } = getPaneRefs(paneId);
    if (ssh.current) {
      const items = getTransferItems(e.dataTransfer);
      if (!items || !bridge.current) {
        terminal.current?.terminal.writeln(`\r\nRELAY: 未找到可上传的文件项。\r\n`);
        return;
      }
      terminal.current?.terminal.writeln(`\r\nRELAY: 开始 trz 上传 ${f ? f.name : "拖拽文件"}...\r\n`);
      bridge.current.uploadDroppedItems(items).catch(err => {
        terminal.current?.terminal.writeln(`\r\nRELAY trzsz 错误: ${err?.message || String(err)}\r\n`);
      });
      return;
    }
    if (paneId === "split") {
      setSplitLines(ls => [...ls, { t: "$", c: "trz" }, { t: ">", c: `拆分会话接收上传:${f ? f.name : "app-v2.4.tar.gz"}` }]);
    } else {
      startTrz(f ? f.name : "app-v2.4.tar.gz", f ? f.size || 18874368 : 18874368, "up");
    }
  };

  const runCommand = () => {
    const cmd = input.trim();
    if (!cmd) return;
    const danger = detectDangerousCommand(cmd);
    if (danger.danger && !window.confirm(buildDangerConfirmation(cmd, danger))) return;
    onCommandRun?.(cmd);
    const targetPaneIds = getCommandTargetPaneIds({ broadcast, splitEnabled, activePaneId });
    const wroteToRuntime = targetPaneIds
      .map(paneId => writeCommandToPane(paneId, cmd))
      .some(Boolean);
    if (wroteToRuntime) {
      setInput("");
      return;
    }
    const previewTrzszPlan = buildSessionTrzszPreviewPlan(cmd);
    if (previewTrzszPlan) {
      setInput("");
      if (targetPaneIds.includes("primary")) {
        startTrz(previewTrzszPlan.fileName, previewTrzszPlan.size, previewTrzszPlan.direction, previewTrzszPlan.commandText);
      }
      if (targetPaneIds.includes("split")) {
        setSplitLines(ls => [...ls, { t: "$", c: previewTrzszPlan.commandText }, { t: ">", c: previewTrzszPlan.splitMessage }]);
      }
      return;
    }
    targetPaneIds.forEach(paneId => appendPreviewCommand(paneId, cmd));
    setInput("");
  };
  const insertSnippet = (snippet) => {
    const command = getSnippetInsertCommand(snippet);
    if (!command) return;
    setInput(command);
    setShowSnip(false);
    const focusInput = () => inputRef.current?.focus();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focusInput);
    else setTimeout(focusInput, 0);
  };
  const clearHistory = () => {
    if (!commandHistory.length) return;
    if (!window.confirm(buildCommandHistoryClearConfirmation(commandHistory))) return;
    onClearCommandHistory?.();
  };
  const setTerminalSearchField = (patch) => {
    setTerminalSearch(current => ({ ...current, ...patch }));
  };
  const runTerminalFind = (direction = "next") => {
    const pane = splitEnabled ? terminalSearch.pane : "primary";
    const query = terminalSearch.query;
    const options = buildTerminalSearchOptions(T, { caseSensitive: terminalSearch.caseSensitive });
    const result = isTauriRuntime()
      ? searchRelayTerminal(pane === "split" ? splitTerminalRef.current : terminalRef.current, query, direction, options)
      : searchPreviewLines(pane === "split" ? splitLines : lines, query, { caseSensitive: terminalSearch.caseSensitive });
    setTerminalSearchField({ status: result.message, statusTone: result.tone });
  };
  const closeTerminalSearch = () => {
    clearRelayTerminalSearch(terminalRef.current);
    clearRelayTerminalSearch(splitTerminalRef.current);
    setShowSearch(false);
    setTerminalSearchField({ status: "", statusTone: "neutral" });
  };

  const sessionSnippetTagOptions = useMemo(() => getSnippetTagOptions(snippets), [snippets]);
  const visibleSessionSnippets = useMemo(() => filterSnippetsByTag(snippets, sessionSnippetTag), [snippets, sessionSnippetTag]);
  const sessionSnippetDrawer = buildSnippetSessionDrawerDisplay({ visibleCount: visibleSessionSnippets.length });
  const historyClearButton = buildCommandHistoryClearButtonDisplay(commandHistory);
  useEffect(() => {
    if (!sessionSnippetTagOptions.includes(sessionSnippetTag)) setSessionSnippetTag("全部");
  }, [sessionSnippetTag, sessionSnippetTagOptions]);

  const comp = useMemo(() => {
    return getCommandCompletion(input, commandHistory);
  }, [input, commandHistory]);
  const inputDanger = useMemo(() => detectDangerousCommand(input), [input]);
  const inputPlaceholder = buildSessionInputPlaceholder({ broadcast, splitEnabled, activePaneId });
  const inputPrefix = buildSessionInputPrefix({ broadcast, splitEnabled, activePaneId });
  const toggleSplit = () => {
    setSplitEnabled(enabled => {
      const next = !enabled;
      if (!next) {
        setBroadcast(false);
        setSplitLines([]);
        setActivePaneId("primary");
      }
      return next;
    });
  };

  const barW = 26;
  const trzBadgeText = trzStatus?.state === "starting"
    ? "trz/tsz 传输中"
    : trzStatus?.state === "error"
      ? "trz/tsz 错误"
      : isTauriRuntime()
        ? "trz/tsz 过滤器"
        : "trz/tsz 就绪";
  const trzBadgeColor = trzStatus?.state === "error" ? T.red : trzStatus?.state === "starting" ? T.amber : T.green;
  const splitTrzBadgeColor = splitTrzStatus?.state === "error" ? T.red : splitTrzStatus?.state === "starting" ? T.amber : T.green;
  const sessionBadge = buildSessionStatusBadge(sessionMode, { kind: "ssh-main", error: sessionError });
  const splitSessionBadge = buildSessionStatusBadge(splitSessionMode, { kind: "ssh", prefix: "拆分", error: splitSessionError || splitTrzStatus?.message || "" });
  const sessionBadgeColor = messageToneColor({ tone: sessionBadge.tone }, T.amber);
  const sessionBadgeBorderColor = messageToneColor({ tone: sessionBadge.borderTone }, T.line);
  const splitBadgeColor = splitSessionMode === "connected" && splitTrzStatus ? splitTrzBadgeColor : messageToneColor({ tone: splitSessionBadge.tone }, T.amber);
  const splitBadgeBorderColor = messageToneColor({ tone: splitSessionBadge.borderTone }, T.line);
  const rendererBadge = buildTerminalRendererStatus(terminalRendererStatus, { runtime: isTauriRuntime() });
  const splitRendererBadge = buildTerminalRendererStatus(splitTerminalRendererStatus, { runtime: isTauriRuntime() });
  const rendererBadgeColor = statusToneColor(rendererBadge.tone);
  const splitRendererBadgeColor = statusToneColor(splitRendererBadge.tone);
  const searchShortcut = formatMetaShortcut("F");
  const snippetShortcut = formatMetaShortcut(";");
  const sessionToolbar = buildSessionToolbarDisplay({
    host,
    splitEnabled,
    showSearch,
    showSnippets: showSnip,
    broadcast,
    showMonitor: showMon,
    searchShortcut,
    snippetShortcut,
  });
  const forwardBadge = buildSessionForwardBadge(sessionForwardStatus);
  const forwardBadgeColor = messageToneColor({ tone: forwardBadge.tone }, T.faint);
  const forwardBadgeBorderColor = forwardBadge.borderTone === "error" ? T.red : T.line;

  const renderTerminalPane = ({ paneId, title, paneLines, scrollRef, terminalHostRef, paneTrz, style = {} }) => {
    const paneFilled = paneTrz ? Math.round(paneTrz.progress / 100 * barW) : 0;
    const paneTrzRouteInfo = paneTrz?.routeInfo || getTrzszRouteInfo(host);
    const active = splitEnabled && activePaneId === paneId;
    const dragOverlay = buildTrzszDragOverlayDisplay({ active: dragPane === paneId });
    return (
      <div ref={scrollRef}
        tabIndex={0}
        onFocus={() => setActivePaneId(paneId)}
        onClick={() => setActivePaneId(paneId)}
        onDragOver={e => {
          if (!hasUploadableTransferItems(e.dataTransfer)) {
            setDragPane(current => current === paneId ? null : current);
            return;
          }
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          setDragPane(paneId);
        }}
        onDragLeave={() => setDragPane(null)}
        onDrop={onDrop(paneId)}
        style={{ flex: 1, minHeight: 0, position: "relative", padding: "18px 22px", fontFamily: T.mono, fontSize: T.termSize, fontVariantLigatures: T.termLigatures ? "contextual common-ligatures" : "none", lineHeight: 1.9, overflowY: "auto", background: T.bg, outline: active ? `1px solid ${T.amber}` : "none", outlineOffset: -1, ...style }}>
        {splitEnabled && (
          <div style={{ position: "sticky", top: -10, zIndex: 2, display: "flex", justifyContent: "flex-end", pointerEvents: "none" }}>
            <span style={{ fontSize: 10, color: active ? T.amber : T.faint, background: T.panelHi, border: `1px solid ${active ? T.amber : T.line}`, borderRadius: 99, padding: "2px 8px" }}>{active ? "● " : ""}{title}</span>
          </div>
        )}
        {isTauriRuntime() ? (
          <div ref={terminalHostRef} style={{ position: "absolute", inset: 0, padding: 8 }} />
        ) : (
          <>
            {paneLines.map((l, i) => (
              <div key={i} style={{ animation: "rise .25s ease both" }}>
                <span style={{ color: l.t === "$" ? T.amber : l.t === ">" ? T.blue : T.faint, marginRight: 10 }}>{l.t}</span>
                <span style={{ color: l.t === ">" ? T.dim : T.text }}>{l.c}</span>
              </div>
            ))}
            {paneTrz && (
              <div style={{ color: T.text }}>
                <span style={{ color: paneTrz.dir === "up" ? T.amber : T.blue }}>{paneTrz.dir === "up" ? "⇡" : "⇣"}</span>{" "}
                {paneTrz.name} [<span style={{ color: T.green }}>{"█".repeat(paneFilled)}</span>{"░".repeat(barW - paneFilled)}]{" "}
                <span style={{ color: T.green }}>{Math.floor(paneTrz.progress)}%</span>{" "}
                <span style={{ color: T.dim }}>{fmtSize(paneTrz.size * paneTrz.progress / 100)} / {fmtSize(paneTrz.size)} · {(4 + Math.random() * 3).toFixed(1)}MB/s</span>
                <span title={paneTrzRouteInfo.title} style={{ color: T.faint }}> · {paneTrzRouteInfo.summary}</span>
              </div>
            )}
            {!paneTrz && <span style={{ display: "inline-block", width: 8, height: 16, background: T.amber, verticalAlign: "middle", animation: "blink 1.1s step-end infinite" }} />}
          </>
        )}
        {dragOverlay.visible && (
          <div style={{ position: "sticky", inset: 0, top: 0, height: "100%", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", background: T.amberSoft, border: `2px dashed ${T.amber}`, borderRadius: 14, pointerEvents: "none" }}>
            <div style={{ textAlign: "center", fontFamily: T.sans }}>
              <div style={{ fontSize: 26 }}>{dragOverlay.icon}</div>
              <div style={{ fontSize: 14, color: T.amber, fontWeight: 600, marginTop: 6 }}>{dragOverlay.title}</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{dragOverlay.detail}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ ...ghostBtn(), padding: "4px 10px" }}>{sessionToolbar.backLabel}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 8, background: T.panelHi, border: `1px solid ${T.line}` }}>
          <Pulse status={sessionToolbar.hostStatus} />
          <span style={{ fontFamily: T.mono, fontSize: 12 }}>{sessionToolbar.hostName}</span>
          {sessionToolbar.latencyLabel && <span style={{ fontSize: 11, color: T.green, fontFamily: T.mono }}>{sessionToolbar.latencyLabel}</span>}
        </div>
        <span title={sessionBadge.title} style={{
          fontSize: 10,
          fontFamily: T.mono,
          color: sessionBadgeColor,
          border: `1px solid ${sessionBadgeBorderColor}`,
          borderRadius: 99,
          padding: "3px 9px",
        }}>{sessionBadge.text}</span>
        <span title={rendererBadge.title} style={{ fontSize: 10, fontFamily: T.mono, color: rendererBadgeColor, border: `1px solid ${T.line}`, borderRadius: 99, padding: "3px 9px" }}>{rendererBadge.label}</span>
        <span title={trzStatus?.message || ""} style={{ fontSize: 10, fontFamily: T.mono, color: trzBadgeColor, border: `1px solid ${T.line}`, borderRadius: 99, padding: "3px 9px" }}>{trzBadgeText}</span>
        {forwardBadge.visible && (
          <span title={forwardBadge.title} style={{ fontSize: 10, fontFamily: T.mono, color: forwardBadgeColor, border: `1px solid ${forwardBadgeBorderColor}`, borderRadius: 99, padding: "3px 9px" }}>
            {forwardBadge.text}
          </span>
        )}
        {splitEnabled && (
          <>
            <span title={splitSessionBadge.title} style={{ fontSize: 10, fontFamily: T.mono, color: splitBadgeColor, border: `1px solid ${splitBadgeBorderColor}`, borderRadius: 99, padding: "3px 9px" }}>
              {splitSessionBadge.text}
            </span>
            <span title={splitRendererBadge.title} style={{ fontSize: 10, fontFamily: T.mono, color: splitRendererBadgeColor, border: `1px solid ${T.line}`, borderRadius: 99, padding: "3px 9px" }}>
              拆分 {splitRendererBadge.label}
            </span>
          </>
        )}
        <button onClick={toggleSplit} style={{ ...ghostBtn(), padding: "5px 10px", color: sessionToolbar.splitButton.active ? T.amber : T.dim, borderColor: sessionToolbar.splitButton.active ? T.amber : T.line }}>{sessionToolbar.splitButton.label}</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {sessionToolbar.actions.map(action => {
            const activeColor = action.activeTone === "success" ? T.green : action.activeTone === "pending" ? T.amber : T.dim;
            const style = { ...ghostBtn(), padding: "5px 12px", color: action.active ? activeColor : T.dim };
            if (action.activeTone === "pending") style.borderColor = action.active ? T.amber : T.line;
            const handlers = {
              search: () => setShowSearch(s => !s),
              snippets: () => setShowSnip(s => !s),
              broadcast: () => setBroadcast(b => !b),
              monitor: () => setShowMon(m => !m),
              sftp: onSftp,
            };
            return <button key={action.id} onClick={handlers[action.id]} style={style}>{action.label}</button>;
          })}
        </div>
      </div>

      {showSearch && (
        <TerminalSearchBar
          query={terminalSearch.query}
          setQuery={query => setTerminalSearchField({ query })}
          caseSensitive={terminalSearch.caseSensitive}
          setCaseSensitive={caseSensitive => setTerminalSearchField({ caseSensitive })}
          pane={terminalSearch.pane}
          setPane={pane => setTerminalSearchField({ pane })}
          splitEnabled={splitEnabled}
          status={terminalSearch.status}
          statusTone={terminalSearch.statusTone}
          onNext={() => runTerminalFind("next")}
          onPrevious={() => runTerminalFind("previous")}
          onClose={closeTerminalSearch}
        />
      )}

      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Chain chain={host.chain} jumpHosts={host.jumpHosts} name={host.name} proxy={host.proxy} compact />
        <span style={{ fontSize: 11, color: T.faint, fontFamily: T.mono }}>{sessionToolbar.transferHint}</span>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
          {renderTerminalPane({
            paneId: "primary",
            title: "主会话",
            paneLines: lines,
            scrollRef: termRef,
            terminalHostRef: xtermRef,
            paneTrz: trz,
          })}
          {splitEnabled && renderTerminalPane({
            paneId: "split",
            title: "拆分会话",
            paneLines: splitLines,
            scrollRef: splitTermRef,
            terminalHostRef: splitXtermRef,
            paneTrz: null,
            style: { borderTop: `1px solid ${T.line}` },
          })}
        </div>
        {showMon && <MonitorPanel auth={monitorAuth} />}
      </div>

      {showSnip && (
        <div style={{ display: "grid", gap: 8, padding: "10px 16px", borderTop: `1px solid ${T.line}`, animation: "rise .2s ease" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
            {sessionSnippetTagOptions.map(tag => {
              const selected = sessionSnippetTag === tag;
              return (
                <button key={tag} onClick={() => setSessionSnippetTag(tag)}
                  style={{ ...ghostBtn(), padding: "5px 10px", whiteSpace: "nowrap", color: selected ? T.amber : T.dim, borderColor: selected ? T.amber : T.line, background: selected ? T.amberSoft : "transparent" }}>
                  {tag}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
            {visibleSessionSnippets.map(s => {
              const display = buildSnippetDisplay(s);
              return (
                <button key={s.id} title={display.title} onClick={() => insertSnippet(s)}
                  style={{ ...ghostBtn(), padding: "6px 12px", whiteSpace: "nowrap", color: messageToneColor({ tone: display.tone }, T.dim), borderColor: messageToneColor({ tone: display.borderTone }, T.line) }}>
                  {display.sessionButtonText}
                </button>
              );
            })}
            {sessionSnippetDrawer.emptyVisible && <span style={{ fontSize: 12, color: T.faint, padding: "6px 0" }}>{sessionSnippetDrawer.emptyText}</span>}
          </div>
        </div>
      )}

      <div style={{ padding: 14, borderTop: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.panelHi, border: `1px solid ${inputDanger.danger ? T.red : broadcast ? T.amber : T.line}`, borderRadius: 10, padding: "10px 14px" }}>
          <span style={{ color: inputDanger.danger ? T.red : broadcast ? T.amber : T.faint, fontFamily: T.mono, fontSize: 12 }}>{inputPrefix}</span>
          <div style={{ flex: 1, position: "relative", fontFamily: T.mono, fontSize: 13, fontVariantLigatures: T.termLigatures ? "contextual common-ligatures" : "none" }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Tab" && comp) { e.preventDefault(); setInput(input + comp); }
                if (e.key === "Enter") runCommand();
              }}
              placeholder={inputPlaceholder}
              style={{ width: "100%", background: "none", border: "none", outline: "none", color: T.text, fontFamily: T.mono, fontSize: 13, fontVariantLigatures: "inherit" }} />
            {comp && (
              <span style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", color: "transparent", whiteSpace: "pre" }}>
                {input}<span style={{ color: T.faint }}>{comp}</span>
              </span>
            )}
          </div>
          {inputDanger.danger && <span title={inputDanger.segment} style={{ fontSize: 10, fontFamily: T.mono, color: T.red, border: `1px solid ${T.red}`, borderRadius: 99, padding: "3px 8px", whiteSpace: "nowrap" }}>危险: {inputDanger.label}</span>}
          {comp && <kbd style={kbdStyle()}>Tab ⇥</kbd>}
          {historyClearButton.visible && <button onClick={clearHistory} title={historyClearButton.title} style={{ ...ghostBtn(), padding: "3px 8px", fontSize: 10, color: T.faint, flexShrink: 0 }}>{historyClearButton.text}</button>}
        </div>
      </div>
    </div>
  );
}

/* ================= 本地 PTY 终端 ================= */
function LocalTerminal({ onBack }) {
  const xtermRef = useRef(null);
  const ptyRef = useRef(null);
  const relayTermRef = useRef(null);
  const [mode, setMode] = useState(isTauriRuntime() ? "connecting" : "preview");
  const [error, setError] = useState("");
  const [rendererStatus, setRendererStatus] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [terminalSearch, setTerminalSearch] = useState({
    query: "",
    caseSensitive: false,
    status: "",
    statusTone: "neutral",
  });

  useEffect(() => {
    if (!isTauriRuntime() || !xtermRef.current) return undefined;

    let disposed = false;
    let resizeObserver = null;
    let relayTerm = null;
    let syncSize = () => ({ cols: 120, rows: 32 });
    const syncRenderingVisibility = () => relayTerm?.setRenderingPaused(Boolean(document.hidden));

    const setup = async () => {
      const { createRelayTerminal } = await import("./lib/terminal.js");
      if (disposed || !xtermRef.current) return;
      relayTerm = createRelayTerminal({
        theme: T,
        fontFamily: T.mono,
        fontSize: T.termSize,
        fontLigatures: T.termLigatures,
        onData: data => ptyRef.current?.write(data),
      });
      relayTermRef.current = relayTerm;
      setRendererStatus({
        renderer: relayTerm.renderer,
        message: relayTerm.rendererMessage,
        webglEnabled: relayTerm.webglEnabled,
      });
      relayTerm.open(xtermRef.current);
      syncRenderingVisibility();
      document.addEventListener("visibilitychange", syncRenderingVisibility);
      relayTerm.terminal.writeln(buildLocalPtyStartingLine());

      syncSize = () => {
        const size = relayTerm.resize();
        ptyRef.current?.resize(size.cols, size.rows);
        return size;
      };

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(syncSize);
        resizeObserver.observe(xtermRef.current);
      } else {
        window.addEventListener("resize", syncSize);
      }

      const size = syncSize();
      ptyRef.current = await openLocalPty({
        cols: size.cols,
        rows: size.rows,
        onData: bytes => relayTerm.writeBytes(bytes),
      });
      if (disposed) return;
      setMode("connected");
      relayTerm.terminal.focus();
    };

    setup().catch(err => {
      if (disposed) return;
      const message = err?.message || String(err);
      setMode("error");
      setError(message);
      relayTerm?.terminal.writeln(buildLocalPtyErrorLine(message));
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (typeof ResizeObserver === "undefined") window.removeEventListener("resize", syncSize);
      document.removeEventListener("visibilitychange", syncRenderingVisibility);
      ptyRef.current?.close?.();
      ptyRef.current = null;
      relayTerm?.dispose();
      relayTermRef.current = null;
      setRendererStatus(null);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = event => {
      if (isMetaShortcutEvent(event, "f", { allowEditable: true })) {
        event.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const setTerminalSearchField = (patch) => {
    setTerminalSearch(current => ({ ...current, ...patch }));
  };
  const runTerminalFind = (direction = "next") => {
    const result = isTauriRuntime()
      ? searchRelayTerminal(relayTermRef.current, terminalSearch.query, direction, buildTerminalSearchOptions(T, { caseSensitive: terminalSearch.caseSensitive }))
      : searchPreviewLines(previewLines, terminalSearch.query, { caseSensitive: terminalSearch.caseSensitive });
    setTerminalSearchField({ status: result.message, statusTone: result.tone });
  };
  const closeTerminalSearch = () => {
    clearRelayTerminalSearch(relayTermRef.current);
    setShowSearch(false);
    setTerminalSearchField({ status: "", statusTone: "neutral" });
  };

  const sessionBadge = buildSessionStatusBadge(mode, { kind: "pty", error });
  const badgeColor = messageToneColor({ tone: sessionBadge.tone }, T.amber);
  const badgeBorderColor = messageToneColor({ tone: sessionBadge.borderTone }, T.line);
  const rendererBadge = buildTerminalRendererStatus(rendererStatus, { runtime: isTauriRuntime() });
  const rendererBadgeColor = statusToneColor(rendererBadge.tone);
  const searchShortcut = formatMetaShortcut("F");
  const localTerminalDisplay = buildLocalTerminalDisplay({ searchShortcut, searchOpen: showSearch });
  const previewLines = localTerminalDisplay.previewLines;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${T.line}` }}>
        <button onClick={onBack} style={{ ...ghostBtn(), padding: "4px 10px" }}>{localTerminalDisplay.backLabel}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 8, background: T.panelHi, border: `1px solid ${T.line}` }}>
          <Pulse status="online" />
          <span style={{ fontFamily: T.mono, fontSize: 12 }}>{localTerminalDisplay.shellLabel}</span>
        </div>
        <span title={sessionBadge.title} style={{ fontSize: 10, fontFamily: T.mono, color: badgeColor, border: `1px solid ${badgeBorderColor}`, borderRadius: 99, padding: "3px 9px" }}>
          {sessionBadge.text}
        </span>
        <span title={rendererBadge.title} style={{ fontSize: 10, fontFamily: T.mono, color: rendererBadgeColor, border: `1px solid ${T.line}`, borderRadius: 99, padding: "3px 9px" }}>{rendererBadge.label}</span>
        <button onClick={() => setShowSearch(s => !s)} style={{ ...ghostBtn(), padding: "5px 12px", marginLeft: "auto", color: localTerminalDisplay.searchActive ? T.amber : T.dim, borderColor: localTerminalDisplay.searchActive ? T.amber : T.line }}>{localTerminalDisplay.searchButtonLabel}</button>
      </div>
      {showSearch && (
        <TerminalSearchBar
          query={terminalSearch.query}
          setQuery={query => setTerminalSearchField({ query })}
          caseSensitive={terminalSearch.caseSensitive}
          setCaseSensitive={caseSensitive => setTerminalSearchField({ caseSensitive })}
          pane="primary"
          setPane={() => {}}
          splitEnabled={false}
          status={terminalSearch.status}
          statusTone={terminalSearch.statusTone}
          onNext={() => runTerminalFind("next")}
          onPrevious={() => runTerminalFind("previous")}
          onClose={closeTerminalSearch}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, position: "relative", padding: "18px 22px", fontFamily: T.mono, fontSize: T.termSize, fontVariantLigatures: T.termLigatures ? "contextual common-ligatures" : "none", lineHeight: 1.9, overflowY: "auto", background: T.bg }}>
        {isTauriRuntime() ? (
          <div ref={xtermRef} style={{ position: "absolute", inset: 0, padding: 8 }} />
        ) : (
          <>
            {previewLines.map((line, index) => (
              <div key={index}>
                <span style={{ color: line.t === "$" ? T.amber : T.blue, marginRight: 10 }}>{line.t}</span>
                <span style={{ color: line.t === ">" ? T.dim : T.text }}>{line.c}</span>
              </div>
            ))}
            <span style={{ display: "inline-block", width: 8, height: 16, background: T.amber, verticalAlign: "middle", animation: "blink 1.1s step-end infinite" }} />
          </>
        )}
      </div>
    </div>
  );
}

/* ================= SFTP 双栏文件管理 ================= */
const LOCAL_FS = {
  "deploy.sh": { type: "file", size: 2048, mtime: "06-12 14:20" },
  "app-v2.4.tar.gz": { type: "file", size: 18 * 1024 * 1024, mtime: "06-13 09:02" },
  "notes.md": { type: "file", size: 4096, mtime: "06-10 18:44" },
  "dist": { type: "dir", children: {
    "index.js": { type: "file", size: 882 * 1024, mtime: "06-13 09:01" },
    "style.css": { type: "file", size: 64 * 1024, mtime: "06-13 09:01" },
  }},
  "config": { type: "dir", children: {
    "local.env": { type: "file", size: 1024, mtime: "06-01 10:00" },
  }},
};

const REMOTE_FS = {
  "nginx.conf": { type: "file", size: 3 * 1024, mtime: "06-09 22:10" },
  "index.html": { type: "file", size: 12 * 1024, mtime: "06-13 08:55" },
  ".env": { type: "file", size: 512, mtime: "05-28 16:30" },
  "logs": { type: "dir", children: {
    "access.log": { type: "file", size: 240 * 1024 * 1024, mtime: "06-13 11:59" },
    "error.log": { type: "file", size: 1.2 * 1024 * 1024, mtime: "06-13 11:59" },
  }},
  "releases": { type: "dir", children: {
    "app-v2.3.tar.gz": { type: "file", size: 17 * 1024 * 1024, mtime: "06-05 20:11" },
  }},
};

const SFTP_STREAM_CHUNK_BYTES = 1024 * 1024;
const fmtSize = b => b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + " MB" : b >= 1024 ? (b / 1024).toFixed(0) + " KB" : b + " B";
const fileIcon = (name, type) => type === "dir" ? "📁" : /\.(tar|gz|zip)/.test(name) ? "📦" : /\.(log)$/.test(name) ? "📜" : /\.(sh)$/.test(name) ? "⚙️" : "📄";
const remoteTextFallback = name => name === "nginx.conf" ? "server {\n    listen 80;\n    server_name example.com;\n\n    location /api/ {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_set_header Host $host;\n    }\n}" : "";

function PathBreadcrumbs({ crumbs, onOpen }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden", fontFamily: T.mono, fontSize: 11, color: T.faint }}>
      {crumbs.map((crumb, index) => {
        const current = index === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            {index > 0 && <span style={{ color: T.faint }}>/</span>}
            <button
              onClick={() => !current && onOpen?.(crumb.path)}
              disabled={current}
              title={String(crumb.path)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: current ? T.text : T.faint,
                cursor: current ? "default" : "pointer",
                fontFamily: T.mono,
                fontSize: 11,
                maxWidth: current ? 180 : 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {crumb.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function FilePane({ title, root, fs, path, setPath, sel, setSel, onEdit, editable, onRefresh, onCreateDir }) {
  const entries = listTreeEntries(fs, path);
  const crumbs = buildTreePathBreadcrumbs(root, path);
  const paneDisplay = buildSftpFilePaneDisplay({
    title,
    entries,
    editable,
    refreshable: Boolean(onRefresh),
    creatable: Boolean(onCreateDir),
    canGoUp: path.length > 0,
  });
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{paneDisplay.title}</span>
        <PathBreadcrumbs crumbs={crumbs} onOpen={nextPath => { setPath(nextPath); setSel(null); }} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => setPath(path.slice(0, -1))} disabled={!paneDisplay.canGoUp} style={{ ...ghostBtn(), padding: "3px 9px", opacity: paneDisplay.canGoUp ? 1 : 0.4 }}>{paneDisplay.upText}</button>
          {paneDisplay.refreshable && <button onClick={onRefresh} style={{ ...ghostBtn(), padding: "3px 9px" }} title={paneDisplay.refreshTitle}>{paneDisplay.refreshIcon}</button>}
          {paneDisplay.creatable && <button onClick={onCreateDir} style={{ ...ghostBtn(), padding: "3px 9px" }} title={paneDisplay.createDirTitle}>{paneDisplay.createDirIcon}</button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {entries.map(([name, meta]) => {
          const on = sel === name;
          return (
            <div key={name}
              onClick={() => setSel(on ? null : name)}
              onDoubleClick={() => meta.type === "dir" && (setPath([...path, name]), setSel(null))}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8,
                cursor: "pointer", userSelect: "none",
                background: on ? T.amberSoft : "transparent",
                border: `1px solid ${on ? T.amber : "transparent"}`,
              }}>
              <span style={{ fontSize: 14, width: 20 }}>{fileIcon(name, meta.type)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{name}</span>
              {paneDisplay.editable && meta.type === "file" && isEditableTextFileName(name) && on && (
                <button onClick={e => { e.stopPropagation(); onEdit(name); }} style={{ ...ghostBtn(), padding: "2px 9px", color: T.amber, borderColor: T.amber, flexShrink: 0 }}>{paneDisplay.editText}</button>
              )}
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 58, textAlign: "right", flexShrink: 0 }}>{meta.type === "dir" ? "—" : fmtSize(meta.size)}</span>
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 72, textAlign: "right", flexShrink: 0 }}>{meta.mtime}</span>
            </div>
          );
        })}
        {!paneDisplay.hasEntries && <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: T.faint }}>{paneDisplay.emptyText}</div>}
      </div>
    </div>
  );
}

function LocalFilePane({ listing, loading, error, selected, setSelected, onOpen, onUp, onRefresh, onCreateDir, onEdit }) {
  if (!listing) {
    return <FilePane title="💻 本地" root="~/work" fs={LOCAL_FS} path={[]} setPath={() => {}} sel={selected?.name || null} setSel={() => {}} editable={false} />;
  }
  const crumbs = buildFileSystemPathBreadcrumbs(listing.path);
  const paneStatus = buildSftpPaneStatusMessage({ loading, error, empty: !listing.entries.length, side: "local" });
  const paneDisplay = buildSftpFilePaneDisplay({
    title: "💻 本地",
    entries: listing.entries,
    editable: true,
    refreshable: true,
    creatable: true,
    canGoUp: Boolean(listing.parent),
  });
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{paneDisplay.title}</span>
        <PathBreadcrumbs crumbs={crumbs} onOpen={onOpen} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={onUp} disabled={!paneDisplay.canGoUp} style={{ ...ghostBtn(), padding: "3px 9px", opacity: paneDisplay.canGoUp ? 1 : 0.4 }}>{paneDisplay.upText}</button>
          <button onClick={onRefresh} style={{ ...ghostBtn(), padding: "3px 9px" }} title={paneDisplay.refreshTitle}>{paneDisplay.refreshIcon}</button>
          <button onClick={onCreateDir} style={{ ...ghostBtn(), padding: "3px 9px" }} title={paneDisplay.createDirTitle}>{paneDisplay.createDirIcon}</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {paneStatus.visible && <div style={{ padding: 18, color: messageToneColor(paneStatus), fontSize: 12 }}>{paneStatus.text}</div>}
        {listing.entries.map(entry => {
          const on = selected?.path === entry.path;
          return (
            <div key={entry.path}
              onClick={() => setSelected(on ? null : entry)}
              onDoubleClick={() => entry.kind === "dir" && onOpen(entry.path)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8,
                cursor: "pointer", userSelect: "none",
                background: on ? T.amberSoft : "transparent",
                border: `1px solid ${on ? T.amber : "transparent"}`,
              }}>
              <span style={{ fontSize: 14, width: 20 }}>{fileIcon(entry.name, entry.kind)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{entry.name}</span>
              {paneDisplay.editable && entry.kind === "file" && entry.editable && on && (
                <button onClick={e => { e.stopPropagation(); onEdit(entry); }} style={{ ...ghostBtn(), padding: "2px 9px", color: T.amber, borderColor: T.amber, flexShrink: 0 }}>{paneDisplay.editText}</button>
              )}
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 58, textAlign: "right", flexShrink: 0 }}>{entry.kind === "dir" ? "—" : fmtSize(entry.size)}</span>
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 72, textAlign: "right", flexShrink: 0 }}>{entry.mtime}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RemoteListingPane({ host, listing, loading, error, selected, setSelected, onOpen, onUp, onRefresh, onCreateDir, onMock, onEdit }) {
  const crumbs = buildFileSystemPathBreadcrumbs(listing?.path || ".");
  const paneStatus = buildSftpPaneStatusMessage({ loading, error, empty: Boolean(listing && !listing.entries.length), side: "remote" });
  const paneDisplay = buildSftpFilePaneDisplay({
    title: `☁ ${host.name}`,
    entries: listing?.entries || [],
    editable: true,
    refreshable: true,
    creatable: true,
    mockable: Boolean(onMock),
    canGoUp: Boolean(listing?.parent),
  });
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{paneDisplay.title}</span>
        <span style={{ fontSize: 10, color: T.green, border: `1px solid ${T.green}`, borderRadius: 99, padding: "2px 7px", fontFamily: T.mono }}>real SFTP</span>
        <PathBreadcrumbs crumbs={crumbs} onOpen={onOpen} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={onUp} disabled={!paneDisplay.canGoUp} style={{ ...ghostBtn(), padding: "3px 9px", opacity: paneDisplay.canGoUp ? 1 : 0.4 }}>{paneDisplay.upText}</button>
          <button onClick={onRefresh} style={{ ...ghostBtn(), padding: "3px 9px" }} title={paneDisplay.refreshTitle}>{paneDisplay.refreshIcon}</button>
          <button onClick={onCreateDir} style={{ ...ghostBtn(), padding: "3px 9px" }} title={paneDisplay.createDirTitle}>{paneDisplay.createDirIcon}</button>
          {paneDisplay.mockable && <button onClick={onMock} style={{ ...ghostBtn(), padding: "3px 9px" }} title={paneDisplay.mockTitle}>{paneDisplay.mockText}</button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {paneStatus.visible && <div style={{ padding: 18, color: messageToneColor(paneStatus), fontSize: 12 }}>{paneStatus.text}</div>}
        {(listing?.entries || []).map(entry => {
          const on = selected?.path === entry.path;
          return (
            <div key={entry.path}
              onClick={() => setSelected(on ? null : entry)}
              onDoubleClick={() => entry.kind === "dir" && onOpen(entry.path)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8,
                cursor: "pointer", userSelect: "none",
                background: on ? T.amberSoft : "transparent",
                border: `1px solid ${on ? T.amber : "transparent"}`,
              }}>
              <span style={{ fontSize: 14, width: 20 }}>{fileIcon(entry.name, entry.kind === "symlink" ? "file" : entry.kind)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{entry.name}</span>
              {entry.kind === "symlink" && <span style={{ fontSize: 10, color: T.blue, fontFamily: T.mono }}>link</span>}
              {paneDisplay.editable && entry.kind === "file" && entry.editable && on && (
                <button onClick={e => { e.stopPropagation(); onEdit(entry); }} style={{ ...ghostBtn(), padding: "2px 9px", color: T.amber, borderColor: T.amber, flexShrink: 0 }}>{paneDisplay.editText}</button>
              )}
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 58, textAlign: "right", flexShrink: 0 }}>{entry.kind === "dir" ? "—" : fmtSize(entry.size)}</span>
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 72, textAlign: "right", flexShrink: 0 }}>{entry.mtime}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SftpView({ host, knownHosts = [], totpProfiles = [], onBack }) {
  const [localFS, setLocalFS] = useState(() => JSON.parse(JSON.stringify(LOCAL_FS)));
  const [remoteFS, setRemoteFS] = useState(() => JSON.parse(JSON.stringify(REMOTE_FS)));
  const [localListing, setLocalListing] = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [remoteListing, setRemoteListing] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [remoteAuth, setRemoteAuth] = useState(null);
  const [remoteSel, setRemoteSel] = useState(null);
  const [lPath, setLPath] = useState([]);
  const [rPath, setRPath] = useState([]);
  const [lSel, setLSel] = useState(null);
  const [localSel, setLocalSel] = useState(null);
  const [rSel, setRSel] = useState(null);
  const [queue, setQueue] = useState([]);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");

  const loadLocal = async (path) => {
    if (!isTauriRuntime()) return;
    setLocalLoading(true);
    setLocalError("");
    try {
      const listing = await listLocalDir(path);
      setLocalListing(listing);
      setLocalSel(null);
    } catch (err) {
      setLocalError(err?.message || String(err));
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    loadLocal();
  }, []);

  const resolveRemoteAuth = async () => {
    if (remoteAuth) return remoteAuth;
    const auth = await resolveSshAuth(host, {
      ...sshSecretProviders(totpProfiles),
      knownHosts,
    });
    setRemoteAuth(auth);
    return auth;
  };

  const updateQueueProgress = (id, transferred, total, startedAt = Date.now(), now = Date.now()) => {
    const transfer = calculateTransferProgress({ transferred, totalSize: total, startedAt, now });
    setQueue(items => items.map(q => q.id === id ? {
      ...q,
      ...transfer,
      startedAt,
    } : q));
    return transfer;
  };

  const createProgressContext = ({ queueId, totalSize, transferred = 0, startedAt = Date.now() }) => ({
    queueId,
    totalSize: Number(totalSize) || 0,
    transferred: Number(transferred) || 0,
    startedAt,
    lastPublishedAt: 0,
    lastPublishedProgress: 0,
    lastPublishedTransferred: 0,
  });

  const touchProgress = (context, { force = false } = {}) => {
    if (!context) return;
    const now = Date.now();
    if (!shouldPublishTransferProgress({
      transferred: context.transferred,
      totalSize: context.totalSize,
      lastTransferred: context.lastPublishedTransferred,
      lastProgress: context.lastPublishedProgress,
      lastPublishedAt: context.lastPublishedAt,
      now,
      force,
    })) {
      return;
    }
    const transfer = updateQueueProgress(context.queueId, context.transferred, context.totalSize, context.startedAt, now);
    context.lastPublishedAt = now;
    context.lastPublishedProgress = transfer.progress;
    context.lastPublishedTransferred = transfer.transferred;
  };

  const streamRemoteFileToLocal = async ({ queueId, remotePath, localPath, totalSize, startOffset = 0, startedAt = Date.now(), progressContext = null }) => {
    const auth = await resolveRemoteAuth();
    let offset = Number(startOffset) || 0;
    let truncate = offset === 0;
    const size = Number(totalSize) || 0;
    const ownProgressContext = progressContext || createProgressContext({ queueId, totalSize: size, transferred: offset, startedAt });
    if (!progressContext) touchProgress(ownProgressContext, { force: true });
    while (true) {
      const chunk = await readRemoteSftpFileChunkBase64({
        ...auth,
        path: remotePath,
        offset,
        length: SFTP_STREAM_CHUNK_BYTES,
        strictHostKey: auth.strictHostKey ?? true,
      });
      if (chunk.bytesRead === 0 && offset >= chunk.totalSize) {
        ownProgressContext.transferred = progressContext ? ownProgressContext.transferred : chunk.totalSize;
        ownProgressContext.totalSize = progressContext ? ownProgressContext.totalSize : chunk.totalSize;
        touchProgress(ownProgressContext, { force: true });
        break;
      }
      await writeLocalFileChunkBase64(localPath, offset, chunk.contentBase64, truncate);
      truncate = false;
      offset += chunk.bytesRead;
      if (progressContext) {
        ownProgressContext.transferred += Number(chunk.bytesRead) || 0;
      } else {
        ownProgressContext.transferred = offset;
        ownProgressContext.totalSize = chunk.totalSize || size;
      }
      touchProgress(ownProgressContext, { force: Boolean(chunk.done) });
      if (chunk.done) break;
    }
  };

  const streamLocalFileToRemote = async ({ queueId, localPath, remotePath, totalSize, startOffset = 0, startedAt = Date.now(), progressContext = null }) => {
    const auth = await resolveRemoteAuth();
    let offset = Number(startOffset) || 0;
    let truncate = offset === 0;
    const size = Number(totalSize) || 0;
    const ownProgressContext = progressContext || createProgressContext({ queueId, totalSize: size, transferred: offset, startedAt });
    if (!progressContext) touchProgress(ownProgressContext, { force: true });
    while (true) {
      const chunk = await readLocalFileChunkBase64(localPath, offset, SFTP_STREAM_CHUNK_BYTES);
      if (chunk.bytesRead === 0 && offset >= chunk.totalSize) {
        ownProgressContext.transferred = progressContext ? ownProgressContext.transferred : chunk.totalSize;
        ownProgressContext.totalSize = progressContext ? ownProgressContext.totalSize : chunk.totalSize;
        touchProgress(ownProgressContext, { force: true });
        break;
      }
      await writeRemoteSftpFileChunkBase64({
        ...auth,
        path: remotePath,
        offset,
        contentBase64: chunk.contentBase64,
        truncate,
        strictHostKey: auth.strictHostKey ?? true,
      });
      truncate = false;
      offset += chunk.bytesRead;
      if (progressContext) {
        ownProgressContext.transferred += Number(chunk.bytesRead) || 0;
      } else {
        ownProgressContext.transferred = offset;
        ownProgressContext.totalSize = chunk.totalSize || size;
      }
      touchProgress(ownProgressContext, { force: Boolean(chunk.done) });
      if (chunk.done) break;
    }
  };

  const loadRemote = async (path = remoteListing?.path || ".") => {
    if (!isTauriRuntime()) {
      setToast("真实远端 SFTP 仅在桌面端可用");
      setTimeout(() => setToast(""), 2200);
      return;
    }
    setRemoteLoading(true);
    setRemoteError("");
    try {
      const auth = await resolveRemoteAuth();
      const open = (trustUnknownHostKey = auth.trustUnknownHostKey ?? false) => listRemoteSftpDir({
        ...auth,
        path,
        strictHostKey: auth.strictHostKey ?? true,
        trustUnknownHostKey,
      });
      let listing;
      try {
        listing = await open(shouldTrustUnknownHostKeyByDefault(auth));
      } catch (err) {
        if (!isUnknownHostKeyError(err)) throw err;
        const accepted = window.confirm(buildUnknownHostKeyPrompt(host, err));
        if (!accepted) throw err;
        listing = await open(true);
        setRemoteAuth(current => markAuthTrustedForUnknownHostKey(current || auth));
      }
      setRemoteListing(listing);
      setRemoteSel(null);
      setRSel(null);
      setToast(`✓ 已读取真实远端 ${listing.path}`);
      setTimeout(() => setToast(""), 1800);
    } catch (err) {
      const message = formatConnectionError(err);
      setRemoteError(message);
      setToast(message);
      setTimeout(() => setToast(""), 2600);
      if (shouldResetCachedSshAuth(err)) {
        setRemoteAuth(null);
      }
    } finally {
      setRemoteLoading(false);
    }
  };

  const ensureRealRemoteDir = async (auth, parent, name) => {
    const listing = await listRemoteSftpDir({
      ...auth,
      path: parent,
      strictHostKey: auth.strictHostKey ?? true,
    });
    const existing = (listing?.entries || []).find(entry => entry.name === name);
    if (existing) {
      if (existing.kind !== "dir") throw new Error(`${name} 已作为文件存在于真实远端目录`);
      return listing;
    }
    return createRemoteSftpDir({
      ...auth,
      parent,
      name,
      strictHostKey: auth.strictHostKey ?? true,
    });
  };

  const uploadLocalDirectoryToRemote = async ({ queueId, localPath, remoteParent, name, rootExists }) => {
    const auth = await resolveRemoteAuth();
    const rootRemote = joinRemotePath(remoteParent, name);
    if (!rootExists) {
      await createRemoteSftpDir({
        ...auth,
        parent: remoteParent,
        name,
        strictHostKey: auth.strictHostKey ?? true,
      });
    }

    const files = [];
    const collectChildren = async (localDirPath, remoteDirPath) => {
      const listing = await listLocalDir(localDirPath);
      const remoteListing = await listRemoteSftpDir({
        ...auth,
        path: remoteDirPath,
        strictHostKey: auth.strictHostKey ?? true,
      });
      for (const entry of listing.entries) {
        if (entry.kind === "dir") {
          await ensureRealRemoteDir(auth, remoteDirPath, entry.name);
          await collectChildren(entry.path, joinRemotePath(remoteDirPath, entry.name));
        } else {
          const remotePath = joinRemotePath(remoteDirPath, entry.name);
          const existing = (remoteListing.entries || []).find(candidate => candidate.name === entry.name);
          const childPlan = planRecursiveSftpFileTransfer({
            direction: "up",
            sourceEntry: entry,
            existingTarget: existing,
          });
          if (!childPlan.ok) {
            throw new Error(childPlan.reason);
          }
          files.push(buildRecursiveSftpWorkFile({
            plan: childPlan,
            localPath: entry.path,
            remotePath,
            size: Number(entry.size) || 0,
          }));
        }
      }
    };

    await collectChildren(localPath, rootRemote);
    const summary = summarizeRecursiveSftpWorkFiles(files);
    const progressContext = createProgressContext({ queueId, totalSize: summary.totalSize, transferred: summary.transferred });
    touchProgress(progressContext, { force: true });

    for (const file of files) {
      if (file.skip) {
        touchProgress(progressContext, { force: true });
        continue;
      }
      if (file.size === 0) {
        await writeRemoteSftpFileBase64({
          ...auth,
          path: file.remotePath,
          contentBase64: "",
          strictHostKey: auth.strictHostKey ?? true,
        });
        touchProgress(progressContext, { force: true });
      } else {
        await streamLocalFileToRemote({
          queueId,
          localPath: file.localPath,
          remotePath: file.remotePath,
          totalSize: file.size,
          startOffset: file.resumeOffset,
          progressContext,
        });
      }
    }
    return listRemoteSftpDir({
      ...auth,
      path: remoteParent,
      strictHostKey: auth.strictHostKey ?? true,
    });
  };

  const downloadRemoteDirectoryToLocal = async ({ queueId, remotePath, localParent, name }) => {
    const ensureLocalDir = async (parent, dirName) => {
      const listing = await listLocalDir(parent);
      const existing = (listing?.entries || []).find(entry => entry.name === dirName);
      if (existing) {
        if (existing.kind !== "dir") throw new Error(`${dirName} 已作为文件存在于本地目录`);
        return listing;
      }
      return createLocalDir(parent, dirName);
    };

    await ensureLocalDir(localParent, name);
    const rootLocal = joinLocalPath(localParent, name);

    const files = [];
    const collectChildren = async (remoteDirPath, localDirPath) => {
      const auth = await resolveRemoteAuth();
      const listing = await listRemoteSftpDir({
        ...auth,
        path: remoteDirPath,
        strictHostKey: auth.strictHostKey ?? true,
      });
      for (const entry of listing.entries) {
        if (entry.kind === "dir") {
          await ensureLocalDir(localDirPath, entry.name);
          await collectChildren(entry.path, joinLocalPath(localDirPath, entry.name));
        } else if (entry.kind === "file") {
          const localListing = await listLocalDir(localDirPath);
          const existing = (localListing.entries || []).find(candidate => candidate.name === entry.name);
          const childPlan = planRecursiveSftpFileTransfer({
            direction: "down",
            sourceEntry: entry,
            existingTarget: existing,
          });
          if (!childPlan.ok) {
            throw new Error(childPlan.reason);
          }
          files.push({
            ...buildRecursiveSftpWorkFile({
              plan: childPlan,
              remotePath: entry.path,
              localPath: joinLocalPath(localDirPath, entry.name),
              size: Number(entry.size) || 0,
            }),
            localParent: localDirPath,
            name: entry.name,
            exists: Boolean(existing),
          });
        } else {
          throw new Error(describeUnsupportedTransferEntry(entry, "远端条目"));
        }
      }
    };

    await collectChildren(remotePath, rootLocal);
    const summary = summarizeRecursiveSftpWorkFiles(files);
    const progressContext = createProgressContext({ queueId, totalSize: summary.totalSize, transferred: summary.transferred });
    touchProgress(progressContext, { force: true });

    for (const file of files) {
      if (file.skip) {
        touchProgress(progressContext, { force: true });
        continue;
      }
      if (file.size === 0) {
        if (!file.exists) await createLocalFile(file.localParent, file.name, 0);
        touchProgress(progressContext, { force: true });
      } else {
        await streamRemoteFileToLocal({
          queueId,
          remotePath: file.remotePath,
          localPath: file.localPath,
          totalSize: file.size,
          startOffset: file.resumeOffset,
          progressContext,
        });
      }
    }
    return listLocalDir(localParent);
  };

  /* 推进传输进度;完成时把文件写入目标侧 */
  useEffect(() => {
    if (!queue.some(q => q.status === "run")) return;
    const t = setInterval(() => {
      setQueue(prev => prev.map(q => {
        if (q.status !== "run") return q;
        const p = Math.min(q.progress + 6 + Math.random() * 14, 100);
        if (p >= 100) {
          if (q.dir === "up" && !q.localSourcePath) {
            setRemoteFS(fs => q.entry?.type === "dir"
              ? copyTreeEntry(fs, q.toPath, q.name, q.entry, "06-13 现在")
              : copyTreeFile(fs, q.toPath, q.name, q.size, "06-13 现在"));
          } else if (!q.localTargetPath) {
            setLocalFS(fs => q.entry?.type === "dir"
              ? copyTreeEntry(fs, q.toPath, q.name, q.entry, "06-13 现在")
              : copyTreeFile(fs, q.toPath, q.name, q.size, "06-13 现在"));
          }
          return {
            ...q,
            progress: 100,
            transferred: q.totalSize ?? q.size ?? 0,
            status: "done",
            materialized: q.dir === "up" ? !q.localSourcePath : !q.localTargetPath,
          };
        }
        return { ...q, progress: p, transferred: Math.round((q.totalSize ?? q.size ?? 0) * (p / 100)) };
      }));
    }, 280);
    return () => clearInterval(t);
  }, [queue]);

  useEffect(() => {
    const pending = queue.filter(q => q.status === "stream" && !q.materializing);
    if (!pending.length) return;
    setQueue(items => items.map(item => pending.some(q => q.id === item.id) ? { ...item, materializing: true } : item));

    const runStreaming = async () => {
      for (const item of pending) {
        try {
          if (item.localTargetPath && item.remoteSourcePath) {
            let listing;
            if (item.sourceKind === "dir") {
              listing = await downloadRemoteDirectoryToLocal({
                queueId: item.id,
                remotePath: item.remoteSourcePath,
                localParent: item.localTargetPath,
                name: item.name,
              });
            } else {
              if (item.size === 0) {
                await createLocalFile(item.localTargetPath, item.name, 0);
                updateQueueProgress(item.id, 0, 0);
              } else {
                await streamRemoteFileToLocal({
                  queueId: item.id,
                  remotePath: item.remoteSourcePath,
                  localPath: joinLocalPath(item.localTargetPath, item.name),
                  totalSize: item.size,
                  startOffset: item.resumeOffset || 0,
                  startedAt: item.startedAt,
                });
              }
              listing = await listLocalDir(item.localTargetPath);
            }
            setQueue(items => items.map(q => q.id === item.id ? { ...q, progress: 100, status: "done", materialized: true, materializing: false } : q));
            if (localListing?.path === item.localTargetPath) {
              setLocalListing(listing);
              setLocalSel(null);
            }
            setToast(`✓ ${item.name} 已下载到本地`);
            setTimeout(() => setToast(""), 1800);
          } else if (item.localSourcePath && item.remoteTargetPath) {
            let listing;
            if (item.sourceKind === "dir") {
              listing = await uploadLocalDirectoryToRemote({
                queueId: item.id,
                localPath: item.localSourcePath,
                remoteParent: item.remoteTargetPath,
                name: item.name,
                rootExists: item.rootExists,
              });
            } else {
              const auth = await resolveRemoteAuth();
              const remotePath = joinRemotePath(item.remoteTargetPath, item.name);
              if (item.size === 0) {
                await writeRemoteSftpFileBase64({
                  ...auth,
                  path: remotePath,
                  contentBase64: "",
                  strictHostKey: auth.strictHostKey ?? true,
                });
                updateQueueProgress(item.id, 0, 0);
              } else {
                await streamLocalFileToRemote({
                  queueId: item.id,
                  localPath: item.localSourcePath,
                  remotePath,
                  totalSize: item.size,
                  startOffset: item.resumeOffset || 0,
                  startedAt: item.startedAt,
                });
              }
              listing = await listRemoteSftpDir({
                ...auth,
                path: item.remoteTargetPath,
                strictHostKey: auth.strictHostKey ?? true,
              });
            }
            setRemoteListing(listing);
            setRemoteSel(null);
            setQueue(items => items.map(q => q.id === item.id ? { ...q, progress: 100, status: "done", materialized: true, materializing: false } : q));
            setToast(`✓ ${item.name} 已上传到远端`);
            setTimeout(() => setToast(""), 1800);
          }
        } catch (err) {
          const message = formatConnectionError(err);
          setQueue(items => items.map(q => q.id === item.id ? { ...q, status: "failed", materializing: false, error: message } : q));
          setToast(message);
          setTimeout(() => setToast(""), 2400);
          if (shouldResetCachedSshAuth(err)) {
            setRemoteAuth(null);
          }
        }
      }
    };

    runStreaming();
  }, [queue, localListing?.path]);

  useEffect(() => {
    const pending = queue.filter(q => q.status === "done" && q.localTargetPath && !q.materialized && !q.materializing);
    if (!pending.length) return;
    setQueue(items => items.map(item => pending.some(q => q.id === item.id) ? { ...item, materializing: true } : item));

    const materialize = async () => {
      for (const item of pending) {
        try {
          let targetContent = item.localTargetContent;
          let listing;
          if (item.remoteSourcePath) {
            if (item.sourceKind === "dir") {
              listing = await downloadRemoteDirectoryToLocal({
                remotePath: item.remoteSourcePath,
                localParent: item.localTargetPath,
                name: item.name,
              });
            } else {
              const auth = await resolveRemoteAuth();
              const contentBase64 = await readRemoteSftpFileBase64({
                ...auth,
                path: item.remoteSourcePath,
                strictHostKey: auth.strictHostKey ?? true,
              });
              listing = await writeLocalFileBase64(item.localTargetPath, item.name, contentBase64);
            }
          } else {
            listing = await createLocalFile(item.localTargetPath, item.name, item.size);
          }
          if (!item.remoteSourcePath && targetContent != null) {
            await writeLocalText(joinLocalPath(item.localTargetPath, item.name), targetContent);
          }
          setQueue(items => items.map(q => q.id === item.id ? { ...q, materialized: true, materializing: false } : q));
          if (localListing?.path === item.localTargetPath) {
            setLocalListing(targetContent == null || item.remoteSourcePath ? listing : await listLocalDir(item.localTargetPath));
            setLocalSel(null);
          }
          setToast(`✓ ${item.name} 已下载到本地`);
          setTimeout(() => setToast(""), 1800);
        } catch (err) {
          const message = formatConnectionError(err);
          setQueue(items => items.map(q => q.id === item.id ? { ...q, status: "failed", materializing: false, error: message } : q));
          setToast(message);
          setTimeout(() => setToast(""), 2400);
          if (shouldResetCachedSshAuth(err)) {
            setRemoteAuth(null);
          }
        }
      }
    };

    materialize();
  }, [queue, localListing?.path]);

  useEffect(() => {
    const pending = queue.filter(q => q.status === "done" && q.localSourcePath && !q.materialized && !q.materializing);
    if (!pending.length) return;
    setQueue(items => items.map(item => pending.some(q => q.id === item.id) ? { ...item, materializing: true } : item));

    const materialize = async () => {
      for (const item of pending) {
        try {
          if (item.remoteTargetPath) {
            const listing = item.sourceKind === "dir"
              ? await uploadLocalDirectoryToRemote({
                localPath: item.localSourcePath,
                remoteParent: item.remoteTargetPath,
                name: item.name,
                rootExists: item.rootExists,
              })
              : await (async () => {
                const contentBase64 = await readLocalFileBase64(item.localSourcePath);
                const auth = await resolveRemoteAuth();
                return writeRemoteSftpFileBase64({
                  ...auth,
                  path: joinRemotePath(item.remoteTargetPath, item.name),
                  contentBase64,
                  strictHostKey: auth.strictHostKey ?? true,
                });
              })();
            setRemoteListing(listing);
            setRemoteSel(null);
          } else if (item.sourceEditable) {
            const content = await readLocalText(item.localSourcePath);
            setRemoteFS(fs => writeTreeText(fs, item.toPath, item.name, content, "06-13 现在"));
          } else {
            setRemoteFS(fs => copyTreeFile(fs, item.toPath, item.name, item.size, "06-13 现在"));
          }
          setQueue(items => items.map(q => q.id === item.id ? { ...q, materialized: true, materializing: false } : q));
          setToast(`✓ ${item.name} 已上传到远端`);
          setTimeout(() => setToast(""), 1800);
        } catch (err) {
          const message = formatConnectionError(err);
          setQueue(items => items.map(q => q.id === item.id ? { ...q, status: "failed", materializing: false, error: message } : q));
          setToast(message);
          setTimeout(() => setToast(""), 2400);
          if (shouldResetCachedSshAuth(err)) {
            setRemoteAuth(null);
          }
        }
      }
    };

    materialize();
  }, [queue]);

  const transfer = dir => {
    const realLocal = Boolean(localListing);
    const realRemote = Boolean(remoteListing);
    const mockLocalEntry = !realLocal && lSel ? getTreeEntry(localFS, lPath, lSel) : null;
    const mockRemoteEntry = !realRemote && rSel ? getTreeEntry(remoteFS, rPath, rSel) : null;
    const availability = getSftpTransferAvailability({
      direction: dir,
      localEntry: localSel,
      remoteEntry: remoteSel,
      mockLocalEntry,
      mockRemoteEntry,
      localListing,
      remoteListing,
    });
    if (!availability.ready) {
      setToast(availability.reason);
      setTimeout(() => setToast(""), 2400);
      return;
    }
    const sel = dir === "up"
      ? (realLocal ? localSel?.name : lSel)
      : (realRemote ? remoteSel?.name : rSel);
    const fs = dir === "up" ? localFS : remoteFS;
    const path = dir === "up" ? lPath : rPath;
    if (!sel) return;
    const meta = realRemote && dir === "down" ? remoteSel : dir === "up" && realLocal ? localSel : getTreeEntry(fs, path, sel);
    if (realRemote && dir === "down") {
      const plan = planRealSftpFileTransfer({
        direction: "down",
        localListing,
        remoteEntry: remoteSel,
      });
      if (!plan.ok) {
        setToast(plan.reason);
        setTimeout(() => setToast(""), 2600);
        return;
      }
      const startedAt = Date.now();
      setQueue(q => [...q, buildStreamingTransferQueueItem({ id: startedAt, direction: dir, plan, startedAt })]);
      return;
    }
    if (realRemote && dir === "up") {
      const plan = planRealSftpFileTransfer({
        direction: "up",
        localEntry: localSel,
        localListing,
        remoteListing,
      });
      if (!plan.ok) {
        setToast(plan.reason);
        setTimeout(() => setToast(""), 2600);
        return;
      }
      if (plan.existsRemote && !plan.resumeOffset && !plan.skip) {
        if (!window.confirm(buildSftpRemoteOverwriteConfirmation(plan))) return;
      }
      const startedAt = Date.now();
      setQueue(q => [...q, buildStreamingTransferQueueItem({ id: startedAt, direction: dir, plan, startedAt })]);
      return;
    }
    const kind = meta.type || meta.kind;
    if (kind !== "file" && kind !== "dir") {
      setToast(`${sel} 不是可传输的文件或目录`);
      setTimeout(() => setToast(""), 2200);
      return;
    }
    if (kind === "dir" && realLocal) {
      setToast("真实本地目录上传需要先连接真实远端 SFTP");
      setTimeout(() => setToast(""), 2400);
      return;
    }
    if (kind === "dir" && getTreeEntry(dir === "up" ? remoteFS : localFS, dir === "up" ? rPath : lPath, sel)) {
      setToast(`${sel} 已存在于目标目录`);
      setTimeout(() => setToast(""), 2200);
      return;
    }
    const remoteTextContent = dir === "down" && realLocal && isEditableTextFileName(sel)
      ? readTreeText(remoteFS, rPath, sel, remoteTextFallback(sel))
      : null;
    const size = remoteTextContent == null ? treeEntrySize(meta) : new TextEncoder().encode(remoteTextContent).length;
    const startedAt = Date.now();
    setQueue(q => [...q, {
      id: startedAt,
      name: sel,
      size,
      totalSize: size,
      dir,
      toPath: dir === "up" ? rPath : lPath,
      entry: !realLocal ? meta : null,
      localTargetPath: dir === "down" && realLocal ? localListing.path : null,
      localTargetContent: remoteTextContent,
      localSourcePath: dir === "up" && realLocal ? localSel.path : null,
      sourceEditable: dir === "up" && realLocal ? Boolean(localSel.editable) : false,
      transferred: 0,
      startedAt,
      progress: 0,
      status: "run",
    }]);
  };
  const createLocalFolder = async () => {
    if (!localListing) return;
    const requestedName = window.prompt(buildSftpNewFolderPromptLabel({ side: "local", mode: "real", path: localListing.path }));
    if (requestedName == null) return;
    try {
      const name = normalizeTreeEntryName(requestedName);
      const listing = await createLocalDir(localListing.path, name);
      setLocalListing(listing);
      setToast(`✓ 已创建 ${name}`);
      setTimeout(() => setToast(""), 1800);
    } catch (err) {
      const failure = buildSftpLocalFolderCreateErrorState(err);
      setToast(failure.message);
      setTimeout(() => setToast(""), failure.timeoutMs);
    }
  };
  const createMockLocalFolder = () => {
    const requestedName = window.prompt(buildSftpNewFolderPromptLabel({ side: "local", mode: "preview", pathSegments: lPath }));
    if (requestedName == null) return;
    try {
      const name = normalizeTreeEntryName(requestedName);
      setLocalFS(fs => createTreeDir(fs, lPath, name, "06-13 现在"));
      setToast(`✓ 已创建本地目录 ${name}`);
      setTimeout(() => setToast(""), 1800);
    } catch (err) {
      setToast(err?.message || String(err));
      setTimeout(() => setToast(""), 2200);
    }
  };
  const createRemoteFolder = () => {
    const requestedName = window.prompt(buildSftpNewFolderPromptLabel({ side: "remote", mode: "preview", pathSegments: rPath }));
    if (requestedName == null) return;
    try {
      const name = normalizeTreeEntryName(requestedName);
      setRemoteFS(fs => createTreeDir(fs, rPath, name, "06-13 现在"));
      setToast(`✓ 已创建远端目录 ${name}`);
      setTimeout(() => setToast(""), 1800);
    } catch (err) {
      setToast(err?.message || String(err));
      setTimeout(() => setToast(""), 2200);
    }
  };
  const createRealRemoteFolder = async () => {
    if (!remoteListing) return;
    const requestedName = window.prompt(buildSftpNewFolderPromptLabel({ side: "remote", mode: "real", path: remoteListing.path }));
    if (requestedName == null) return;
    try {
      const name = normalizeTreeEntryName(requestedName);
      const auth = await resolveRemoteAuth();
      const listing = await createRemoteSftpDir({
        ...auth,
        parent: remoteListing.path,
        name,
        strictHostKey: auth.strictHostKey ?? true,
      });
      setRemoteListing(listing);
      setRemoteSel(null);
      setToast(`✓ 已创建真实远端目录 ${name}`);
      setTimeout(() => setToast(""), 1800);
    } catch (err) {
      const message = formatConnectionError(err);
      setToast(message);
      setTimeout(() => setToast(""), 2600);
      if (shouldResetCachedSshAuth(err)) {
        setRemoteAuth(null);
      }
    }
  };
  const resetRemoteTree = () => {
    setRemoteFS(JSON.parse(JSON.stringify(REMOTE_FS)));
    setRSel(null);
    setToast("远端演示目录已刷新");
    setTimeout(() => setToast(""), 1600);
  };
  const resetLocalTree = () => {
    setLocalFS(JSON.parse(JSON.stringify(LOCAL_FS)));
    setLSel(null);
    setToast("本地演示目录已刷新");
    setTimeout(() => setToast(""), 1600);
  };
  const openRemoteEditor = (name) => {
    try {
      setEditing(buildSftpEditorState({
        side: "remote",
        name,
        path: rPath.slice(),
        content: readTreeText(remoteFS, rPath, name, remoteTextFallback(name)),
      }));
    } catch (err) {
      setToast(err?.message || String(err));
      setTimeout(() => setToast(""), 2200);
    }
  };
  const openLocalEditor = async (entry) => {
    try {
      setToast("正在读取本地文件…");
      const content = await readLocalText(entry.path);
      setEditing(buildSftpEditorState({
        side: "local",
        name: entry.name,
        path: entry.path,
        content,
      }));
      setToast("");
    } catch (err) {
      setToast(err?.message || String(err));
      setTimeout(() => setToast(""), 2400);
    }
  };
  const openRealRemoteEditor = async (entry) => {
    try {
      setToast("正在读取远端文件…");
      const auth = await resolveRemoteAuth();
      const content = await readRemoteSftpText({
        ...auth,
        path: entry.path,
        strictHostKey: auth.strictHostKey ?? true,
      });
      setEditing(buildSftpEditorState({
        side: "remote-real",
        name: entry.name,
        path: entry.path,
        content,
      }));
      setToast("");
    } catch (err) {
      const message = formatConnectionError(err);
      setToast(message);
      setTimeout(() => setToast(""), 2600);
      if (shouldResetCachedSshAuth(err)) {
        setRemoteAuth(null);
      }
    }
  };
  const saveEdit = async () => {
    if (!editing || editing.saving || !hasSftpEditorUnsavedChanges(editing)) return;
    const currentEdit = editing;
    setEditing({ ...currentEdit, saving: true });
    try {
      if (currentEdit.side === "local") {
        await writeLocalText(currentEdit.path, currentEdit.content);
        if (localListing) {
          const listing = await listLocalDir(localListing.path);
          setLocalListing(listing);
          setLocalSel(null);
        }
        setToast(`✓ ${currentEdit.name} 已保存到本地`);
      } else if (currentEdit.side === "remote-real") {
        const auth = await resolveRemoteAuth();
        const listing = await writeRemoteSftpText({
          ...auth,
          path: currentEdit.path,
          content: currentEdit.content,
          strictHostKey: auth.strictHostKey ?? true,
        });
        setRemoteListing(listing);
        setRemoteSel(null);
        setToast(`✓ ${currentEdit.name} 已写回真实远端`);
      } else {
        setRemoteFS(fs => writeTreeText(fs, currentEdit.path, currentEdit.name, currentEdit.content, "06-13 现在"));
        setToast(`✓ ${currentEdit.name} 已保存并上传`);
      }
      setEditing(null);
      setTimeout(() => setToast(""), 2200);
    } catch (err) {
      setEditing(editor => editor ? { ...editor, saving: false } : editor);
      setToast(err?.message || String(err));
      setTimeout(() => setToast(""), 2200);
    }
  };
  const closeEditor = () => {
    if (editing?.saving) return;
    if (hasSftpEditorUnsavedChanges(editing) && !window.confirm(buildSftpEditorCloseConfirmation(editing))) return;
    setEditing(null);
  };

  const queueSummary = buildTransferQueueSummary(queue);
  const toastMessage = buildSftpToastMessage(toast);
  const remoteConnectionControl = buildSftpRemoteConnectionControl({ connected: Boolean(remoteListing), loading: remoteLoading });
  const mockLocalEntry = !localListing && lSel ? getTreeEntry(localFS, lPath, lSel) : null;
  const mockRemoteEntry = !remoteListing && rSel ? getTreeEntry(remoteFS, rPath, rSel) : null;
  const uploadAvailability = getSftpTransferAvailability({
    direction: "up",
    localEntry: localSel,
    remoteEntry: remoteSel,
    mockLocalEntry,
    mockRemoteEntry,
    localListing,
    remoteListing,
  });
  const downloadAvailability = getSftpTransferAvailability({
    direction: "down",
    localEntry: localSel,
    remoteEntry: remoteSel,
    mockLocalEntry,
    mockRemoteEntry,
    localListing,
    remoteListing,
  });
  const uploadButton = buildSftpDirectionButtonDisplay({ direction: "up", availability: uploadAvailability, realRemote: Boolean(remoteListing) });
  const downloadButton = buildSftpDirectionButtonDisplay({ direction: "down", availability: downloadAvailability, realRemote: Boolean(remoteListing) });
  const sftpRouteSummary = summarizeConnectionPath({ chain: host.chain, jumpHosts: host.jumpHosts, name: host.name, proxy: host.proxy });
  const sftpRouteTitle = describeConnectionPath({ chain: host.chain, jumpHosts: host.jumpHosts, name: host.name, proxy: host.proxy });
  const editorDisplay = buildSftpEditorDisplay(editing);
  const pageDisplay = buildSftpPageDisplay({
    hostName: host.name,
    routeSummary: sftpRouteSummary,
    routeTitle: sftpRouteTitle,
    queueSummary,
    editorSaving: editorDisplay.saving,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "16px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button onClick={onBack} style={{ ...ghostBtn(), padding: "5px 12px" }}>{pageDisplay.backLabel}</button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{pageDisplay.pageTitle}</h1>
        <span style={{ fontFamily: T.mono, fontSize: 13, color: T.amber }}>{pageDisplay.hostName}</span>
        <Chain chain={host.chain} jumpHosts={host.jumpHosts} name={host.name} proxy={host.proxy} compact />
        <span title={pageDisplay.routeBadgeTitle} style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, border: `1px solid ${T.line}`, borderRadius: 99, padding: "2px 7px", whiteSpace: "nowrap" }}>{pageDisplay.routeBadgeText}</span>
        <button disabled={remoteConnectionControl.disabled} onClick={() => loadRemote(".")} style={{ ...ghostBtn(), padding: "5px 12px", color: messageToneColor({ tone: remoteConnectionControl.tone }, T.amber), borderColor: messageToneColor({ tone: remoteConnectionControl.borderTone }, T.amber), opacity: remoteConnectionControl.opacity }}>
          {remoteConnectionControl.text}
        </button>
        {toastMessage.text && <span style={{ marginLeft: "auto", fontSize: 12, color: messageToneColor(toastMessage, T.amber), fontFamily: T.mono }}>{toastMessage.text}</span>}
      </div>

      <div style={{ flex: 1, display: "flex", gap: 0, minHeight: 0 }}>
        {localListing ? (
          <LocalFilePane
            listing={localListing}
            loading={localLoading}
            error={localError}
            selected={localSel}
            setSelected={setLocalSel}
            onOpen={loadLocal}
            onUp={() => loadLocal(localListing.parent)}
            onRefresh={() => loadLocal(localListing.path)}
            onCreateDir={createLocalFolder}
            onEdit={openLocalEditor}
          />
        ) : (
          <FilePane title="💻 本地" root="~/work" fs={localFS} path={lPath} setPath={setLPath} sel={lSel} setSel={setLSel} editable={false}
            onRefresh={resetLocalTree}
            onCreateDir={createMockLocalFolder} />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "0 12px" }}>
          <button onClick={() => transfer("up")} disabled={uploadButton.disabled} title={uploadButton.title}
            style={{ ...ghostBtn(), padding: "10px 12px", fontSize: 16, color: messageToneColor({ tone: uploadButton.tone }, T.faint), borderColor: messageToneColor({ tone: uploadButton.borderTone }, T.line), opacity: uploadButton.opacity }}>{uploadButton.text}</button>
          <button onClick={() => transfer("down")} disabled={downloadButton.disabled} title={downloadButton.title}
            style={{ ...ghostBtn(), padding: "10px 12px", fontSize: 16, color: messageToneColor({ tone: downloadButton.tone }, T.faint), borderColor: messageToneColor({ tone: downloadButton.borderTone }, T.line), opacity: downloadButton.opacity }}>{downloadButton.text}</button>
        </div>
        {remoteListing ? (
          <RemoteListingPane
            host={host}
            listing={remoteListing}
            loading={remoteLoading}
            error={remoteError}
            selected={remoteSel}
            setSelected={setRemoteSel}
            onOpen={loadRemote}
            onUp={() => loadRemote(remoteListing.parent)}
            onRefresh={() => loadRemote(remoteListing.path)}
            onCreateDir={createRealRemoteFolder}
            onMock={() => { setRemoteListing(null); setRemoteAuth(null); setRemoteSel(null); setRemoteError(""); }}
            onEdit={openRealRemoteEditor}
          />
        ) : (
          <FilePane title={`☁ ${host.name}`} root="/var/www" fs={remoteFS} path={rPath} setPath={setRPath} sel={rSel} setSel={setRSel} editable
            onRefresh={resetRemoteTree}
            onCreateDir={createRemoteFolder}
            onEdit={openRemoteEditor} />
        )}
      </div>

      {/* 传输队列 */}
      <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 14, padding: "10px 4px 14px", maxHeight: 150, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: queue.length ? 8 : 0 }}>
          <span style={{ fontSize: 10, color: T.faint, letterSpacing: 2 }}>{pageDisplay.queueTitle}</span>
          {queueSummary.visible && <span style={{ fontSize: 11, color: messageToneColor(queueSummary), fontFamily: T.mono }}>{queueSummary.text}</span>}
          {pageDisplay.clearCompletedVisible && <button disabled={pageDisplay.clearCompletedDisabled} onClick={() => setQueue(clearCompletedTransferQueue)} style={{ ...ghostBtn(), padding: "2px 9px", marginLeft: "auto", opacity: pageDisplay.clearCompletedOpacity, cursor: pageDisplay.clearCompletedCursor }}>{pageDisplay.clearCompletedText}</button>}
        </div>
        {!queue.length && <div style={{ fontSize: 11, color: T.faint, padding: "4px 0" }}>{pageDisplay.queueEmptyText}</div>}
        {queue.map(q => {
          const display = buildTransferQueueDisplay(q, { formatSize: fmtSize });
          const statusColor = display.statusTone === "error"
            ? T.red
            : display.statusTone === "success"
              ? T.green
              : display.statusTone === "active"
                ? T.amber
                : T.dim;
          return (
            <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: display.dir === "up" ? T.amber : T.blue, width: 38 }}>{display.directionLabel}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, width: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</span>
              <div style={{ flex: 1, minWidth: 80, height: 5, borderRadius: 99, background: T.line, overflow: "hidden" }}>
                <div style={{ width: `${display.progress}%`, height: "100%", borderRadius: 99, background: statusColor, transition: "width .28s linear" }} />
              </div>
              <span title={display.metrics} style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, width: 150, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display.metrics}</span>
              <span title={q.error || ""} style={{ fontFamily: T.mono, fontSize: 11, color: statusColor, width: 76, textAlign: "right" }}>
                {display.statusLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* 在线编辑器 */}
      {editing && (
        <div onClick={closeEditor} style={{ position: "fixed", inset: 0, background: "rgba(5,7,10,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "fadeIn .15s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.55)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 13 }}>{pageDisplay.editorTitle}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.amber }}>{editorDisplay.titlePath}</span>
              <span style={{ fontSize: 10, color: T.faint, marginLeft: "auto" }}>{editorDisplay.saveHint}</span>
            </div>
            <textarea value={editing.content} disabled={editorDisplay.textareaDisabled} onChange={e => setEditing({ ...editing, content: e.target.value })} spellCheck={false}
              style={{ width: "100%", height: 280, boxSizing: "border-box", resize: "vertical", background: T.bg, color: T.text, border: "none", outline: "none", padding: 16, fontFamily: T.mono, fontSize: 12.5, lineHeight: 1.8, opacity: editorDisplay.textareaDisabled ? 0.7 : 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.line}` }}>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: messageToneColor(editorDisplay, T.faint) }}>{editorDisplay.statusText}</span>
              <button onClick={closeEditor} disabled={pageDisplay.editorCancelDisabled} style={{ ...ghostBtn(), padding: "7px 16px", marginLeft: "auto", opacity: pageDisplay.editorCancelOpacity }}>{pageDisplay.editorCancelText}</button>
              <button onClick={saveEdit} disabled={editorDisplay.saveDisabled}
                style={{ background: T.amber, border: "none", borderRadius: 8, padding: "7px 18px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: editorDisplay.saveDisabled ? "not-allowed" : "pointer", fontFamily: T.sans, opacity: editorDisplay.saveDisabled ? 0.55 : 1 }}>{editorDisplay.saveButtonText}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= 主应用 ================= */
export default function App() {
  const storage = typeof window === "undefined" ? null : window.localStorage;
  const [appearance, setAppearance] = useState(() => {
    const loaded = loadAppearance(storage, APPEARANCE_DEFAULTS);
    applyAppearanceTokens(loaded);
    return loaded;
  });
  const [hosts, setHosts] = useState(() => loadHosts(storage, HOSTS));
  const [snippets, setSnippets] = useState(() => loadSnippets(typeof window === "undefined" ? null : window.localStorage));
  const [commandHistory, setCommandHistory] = useState(() => loadCommandHistory(storage));
  const [totpProfiles, setTotpProfiles] = useState(() => loadTotpProfiles(storage));
  const [group, setGroup] = useState(ALL_HOSTS_GROUP);
  const [palette, setPalette] = useState(false);
  const [view, setView] = useState({ page: "hosts" });
  const [hover, setHover] = useState(null);
  const [focusedHost, setFocusedHost] = useState(null);
  const [importStatus, setImportStatus] = useState(buildStatusMessage(""));
  const [probeStatus, setProbeStatus] = useState(buildStatusMessage(""));
  const [probing, setProbing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(buildStatusMessage("本地配置已加载"));
  const [syncDeviceId] = useState(() => getOrCreateConfigSyncDeviceId(storage));
  const [agentStatus, setAgentStatus] = useState({
    available: false,
    socket: null,
    identityCount: 0,
    status: "checking",
    message: "正在检测密钥代理…",
  });
  const [showAddHost, setShowAddHost] = useState(false);
  const [editingHost, setEditingHost] = useState(null);
  const [hostForm, setHostForm] = useState(EMPTY_HOST_FORM);
  const [hostFormMessage, setHostFormMessage] = useState("");
  const fileInputRef = useRef(null);
  const configSyncInputRef = useRef(null);
  const knownSshHosts = useMemo(() => [...hosts, ...BASTIONS], [hosts]);
  const updateAppearance = (patch) => {
    setAppearance(current => {
      const next = normalizeAppearance({ ...current, ...patch }, APPEARANCE_DEFAULTS);
      applyAppearanceTokens(next);
      return next;
    });
  };
  const setTheme = (name) => updateAppearance({ themeName: name });
  const setAccent = (accent) => updateAppearance({ accent });
  const setTermSize = (termSize) => updateAppearance({ termSize });
  const setTermLigatures = (termLigatures) => updateAppearance({ termLigatures });
  const resetAppearanceToDefaults = () => {
    const next = resetAppearance(APPEARANCE_DEFAULTS);
    applyAppearanceTokens(next);
    setAppearance(next);
  };

  useEffect(() => {
    const fn = e => {
      const action = getGlobalShortcutAction(e, { page: view.page });
      if (action === "palette") {
        e.preventDefault();
        setPalette(p => !p);
      } else if (action === "snippets") {
        e.preventDefault();
        setView({ page: "snippets" });
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [view.page]);

  useEffect(() => {
    saveSnippets(storage, snippets);
  }, [snippets]);

  useEffect(() => {
    saveHosts(storage, hosts);
  }, [hosts]);

  useEffect(() => {
    saveAppearance(storage, appearance, APPEARANCE_DEFAULTS);
  }, [appearance]);

  useEffect(() => {
    saveCommandHistory(storage, commandHistory);
  }, [commandHistory]);
  useEffect(() => {
    saveTotpProfiles(storage, totpProfiles);
  }, [totpProfiles]);

  useEffect(() => {
    let alive = true;
    getSshAgentStatus()
      .then(status => {
        if (alive) setAgentStatus(status);
      })
      .catch(err => {
        if (!alive) return;
        setAgentStatus({
          available: false,
          socket: null,
          identityCount: 0,
          status: "error",
          message: err?.message || String(err),
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    return getHostGroupOptions(hosts, GROUPS);
  }, [hosts]);
  const selectedGroup = resolveSelectedHostGroup(group, groups);

  useEffect(() => {
    if (selectedGroup !== group) setGroup(selectedGroup);
  }, [group, selectedGroup]);

  const importSshConfigText = (text, source = "") => {
    const imported = parseSshConfig(text);
    if (!imported.length) {
      setImportStatus(buildStatusMessage("未发现可导入的 Host 条目", "neutral"));
      return;
    }

    const merged = mergeImportedHosts(hosts, imported);
    const added = merged.length - hosts.length;
    setHosts(merged);
    setGroup("SSH Config");
    const prefix = source ? `${source}: ` : "";
    setImportStatus(buildStatusMessage(added > 0 ? `${prefix}已导入 ${added} 台主机` : `${prefix}配置已读取,没有新增主机`));
  };

  const importFiles = async (files) => {
    const selection = getReadableSelectedFile(files, {
      emptyMessage: "请选择 SSH config 文件",
      unreadableMessage: "无法读取所选 SSH config 文件",
    });
    if (!selection.ok) {
      setImportStatus(buildStatusMessage(selection.reason, "error"));
      resetFileInput(fileInputRef.current);
      return;
    }
    const file = selection.file;
    try {
      importSshConfigText(await file.text(), file.name);
    } catch (err) {
      setImportStatus(buildStatusMessage(`导入失败: ${err?.message || String(err)}`, "error"));
    } finally {
      resetFileInput(fileInputRef.current);
    }
  };
  const importDefaultSshConfig = async () => {
    if (!isTauriRuntime()) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const config = await readDefaultSshConfig();
      if (!config) {
        setImportStatus(buildStatusMessage("未找到 ~/.ssh/config,请选择文件导入", "neutral"));
        fileInputRef.current?.click();
        return;
      }
      importSshConfigText(config.content, config.path);
    } catch (err) {
      setImportStatus(buildStatusMessage(`导入失败: ${err?.message || String(err)}`, "error"));
    }
  };
  const exportConfigSnapshot = () => {
    try {
      const snapshot = buildConfigSnapshot({
        hosts,
        appearance,
        snippets,
        totpProfiles,
        commandHistory,
      }, { appearanceDefaults: APPEARANCE_DEFAULTS, deviceId: syncDeviceId });
      downloadTextFile(makeConfigSnapshotFileName(), serializeConfigSnapshot(snapshot));
      setSyncStatus(buildStatusMessage(`已导出 · ${shortSyncHash(snapshot.sync.contentHash)}`));
    } catch (err) {
      setSyncStatus(buildStatusMessage(`导出失败: ${err?.message || String(err)}`, "error"));
    }
  };
  const importConfigSnapshotFiles = async (files) => {
    const selection = getReadableSelectedFile(files, {
      emptyMessage: "请选择 RELAY 配置快照文件",
      unreadableMessage: "无法读取所选 RELAY 配置快照文件",
    });
    if (!selection.ok) {
      setSyncStatus(buildStatusMessage(selection.reason, "error"));
      resetFileInput(configSyncInputRef.current);
      return;
    }
    const file = selection.file;
    try {
      const envelope = parseConfigSnapshotEnvelope(await file.text(), { appearanceDefaults: APPEARANCE_DEFAULTS });
      const next = envelope.data;
      const summary = buildConfigSnapshotImportSummary({
        hosts,
        snippets,
        totpProfiles,
        commandHistory,
      }, envelope, { localDeviceId: syncDeviceId });
      if (!window.confirm(formatConfigSnapshotImportConfirmation(summary))) {
        setSyncStatus(buildStatusMessage("导入已取消", "neutral"));
        return;
      }
      applyAppearanceTokens(next.appearance);
      setHosts(next.hosts);
      setAppearance(next.appearance);
      setSnippets(next.snippets);
      setTotpProfiles(next.totpProfiles || []);
      setCommandHistory(next.commandHistory);
      setGroup(ALL_HOSTS_GROUP);
      setView({ page: "hosts" });
      const origin = envelope.sync.sourceDeviceId === syncDeviceId ? "本机快照" : "外部快照";
      setSyncStatus(buildStatusMessage(`已导入 ${origin} · ${shortSyncHash(envelope.sync.contentHash)}`));
    } catch (err) {
      setSyncStatus(buildStatusMessage(`导入失败: ${err?.message || String(err)}`, "error"));
    } finally {
      resetFileInput(configSyncInputRef.current);
    }
  };

  const shown = useMemo(() => sortHostsForDisplay(filterHostsByGroup(hosts, selectedGroup)), [hosts, selectedGroup]);
  const goHome = () => setView({ page: "hosts" });
  const handleAddSnippet = (input) => setSnippets(current => addSnippet(current, input));
  const handleUpdateSnippet = (id, input) => setSnippets(current => updateSnippet(current, id, input));
  const handleDeleteSnippet = (id) => setSnippets(current => removeSnippet(current, id));
  const openHostSession = (host) => {
    setPalette(false);
    if (canOpenHostSession(host)) setView({ page: "session", host });
  };
  const openHostSftp = (host) => {
    setPalette(false);
    if (canOpenHostSftp(host)) setView({ page: "sftp", host });
  };
  const copyHostCommand = async (host) => {
    try {
      await navigator.clipboard.writeText(buildSshCommand({ host, chain: host.chain, jumpHosts: host.jumpHosts, proxy: host.proxy, forwards: host.forwards || [] }));
      return true;
    } catch {
      return false;
    }
  };
  const handleSaveHostConfig = (nextHost) => {
    const nextHosts = updateHostConfig(hosts, nextHost.id, nextHost);
    const savedHost = nextHosts.find(h => h.id === nextHost.id) || nextHost;
    setHosts(nextHosts);
    setView({ page: "config", host: savedHost });
  };
  const handleCommandRun = (command) => setCommandHistory(history => recordCommand(history, command));
  const handleClearCommandHistory = () => setCommandHistory(clearCommandHistory());
  const handleToggleFavorite = (hostId) => setHosts(current => toggleHostFavorite(current, hostId));
  const closeHostForm = () => {
    setShowAddHost(false);
    setEditingHost(null);
    setHostForm(EMPTY_HOST_FORM);
    setHostFormMessage("");
  };
  const openAddHost = () => {
    setEditingHost(null);
    setHostForm(EMPTY_HOST_FORM);
    setHostFormMessage("");
    setShowAddHost(true);
  };
  const openEditHost = (host) => {
    setEditingHost(host);
    setHostForm({
      name: host.name || "",
      host: host.host || "",
      user: host.user || "",
      port: String(host.port || 22),
      group: host.group || "手动添加",
      tags: Array.isArray(host.tags) ? host.tags.join(", ") : "",
      identityFile: host.identityFile || "",
    });
    setHostFormMessage("");
    setShowAddHost(true);
  };
  const handleRemoveHost = (host) => {
    if (!window.confirm(buildHostDeleteConfirmation(host))) return;
    setHosts(current => removeHost(current, host.id));
    if (view.host?.id === host.id) setView({ page: "hosts" });
  };
  const submitHost = () => {
    try {
      const next = editingHost
        ? updateHostProfile(hosts, editingHost.id, hostForm)
        : addHost(hosts, hostForm);
      const savedHost = editingHost
        ? next.find(h => h.id === editingHost.id)
        : next.at(-1);
      setHosts(next);
      setGroup(savedHost?.group || hostForm.group || "手动添加");
      if (editingHost && view.host?.id === editingHost.id && savedHost) {
        setView(current => ({ ...current, host: savedHost }));
      }
      closeHostForm();
    } catch (err) {
      setHostFormMessage(err?.message || String(err));
    }
  };
  const refreshHostStatus = async () => {
    if (!hosts.length) return;
    setProbing(true);
    setProbeStatus(buildStatusMessage("探测中", "pending"));
    try {
      const results = await probeHosts({
        targets: hosts.map(h => ({ id: h.id, host: h.host, port: Number(h.port) || 22 })),
        timeoutMs: 1200,
      });
      setHosts(current => mergeHostProbeResults(current, results));
      setProbeStatus(buildHostProbeSummary(results));
    } catch (err) {
      setProbeStatus(buildStatusMessage(`探测失败: ${err?.message || String(err)}`, "error"));
    } finally {
      setProbing(false);
    }
  };
  const paletteShortcut = formatMetaShortcut("K");
  const snippetShortcut = formatMetaShortcut(";");
  const sidebarDisplay = buildHostSidebarDisplay({ snippetShortcut });
  const agentDisplay = buildSshAgentStatusDisplay(agentStatus);
  const topBarDisplay = buildHostListTopBarDisplay({
    paletteShortcut,
    syncStatus,
    agentDisplay,
  });
  const agentColor = messageToneColor({ tone: topBarDisplay.agentTone }, T.amber);
  const hostListSummary = buildHostListSummary(shown);
  const importDropzoneDisplay = buildSshConfigImportDropzoneDisplay(importStatus);
  const hostListEmptyState = buildHostListEmptyState({
    visibleHosts: shown,
    allHosts: hosts,
    selectedGroup,
  });
  const hostListToolbarDisplay = buildHostListToolbarDisplay({ probing });
  const hostFormDisplay = buildHostFormDisplay({
    editing: Boolean(editingHost),
    message: hostFormMessage,
  });

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, color: T.text, fontFamily: T.sans, transition: "background .25s, color .25s" }}>
      <style>{`
        @keyframes pulse { 0% { transform: scale(.6); opacity: .8 } 100% { transform: scale(1.6); opacity: 0 } }
        @keyframes blink { 50% { opacity: 0 } }
        @keyframes fadeIn { from { opacity: 0 } }
        @keyframes rise { from { opacity: 0; transform: translateY(4px) } }
        ::-webkit-scrollbar { width: 8px; height: 8px } ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 4px }
        button:focus-visible, input:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px }
        ${buildReducedMotionCss()}
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {[T.red, T.amber, T.green].map((c, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 99, background: c, opacity: .85 }} />)}
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: 1, color: T.dim }}>{topBarDisplay.brandText}<span style={{ color: T.amber }}>›</span> {topBarDisplay.brandSuffix}</span>
        <button onClick={() => setPalette(true)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, background: T.panelHi, border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 14px", color: T.faint, fontSize: 13, cursor: "pointer", minWidth: 240, fontFamily: T.sans }}>
          <span>{topBarDisplay.searchPlaceholder}</span>
          <kbd style={{ ...kbdStyle(), marginLeft: "auto" }}>{topBarDisplay.paletteShortcut}</kbd>
        </button>
        {topBarDisplay.syncVisible && <span style={{ fontSize: 11, fontFamily: T.mono, color: messageToneColor({ tone: topBarDisplay.syncTone }) }}>{topBarDisplay.syncPrefix} {topBarDisplay.syncText}</span>}
        <button onClick={exportConfigSnapshot} style={{ ...ghostBtn(), padding: "5px 10px", fontSize: 11 }}>{topBarDisplay.exportLabel}</button>
        <button onClick={() => configSyncInputRef.current?.click()} style={{ ...ghostBtn(), padding: "5px 10px", fontSize: 11 }}>{topBarDisplay.importLabel}</button>
        <input ref={configSyncInputRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={e => importConfigSnapshotFiles(e.target.files)} />
        {topBarDisplay.agentVisible && <span title={topBarDisplay.agentTitle} style={{ fontSize: 11, fontFamily: T.mono, color: agentColor }}>{topBarDisplay.agentPrefix} {topBarDisplay.agentLabel}</span>}
      </div>

      {view.page === "session" ? (
        <Session host={view.host} knownHosts={knownSshHosts} totpProfiles={totpProfiles} snippets={snippets} commandHistory={commandHistory} onCommandRun={handleCommandRun} onClearCommandHistory={handleClearCommandHistory} onBack={goHome} onSftp={() => setView({ page: "sftp", host: view.host })} />
      ) : view.page === "local" ? (
        <LocalTerminal onBack={goHome} />
      ) : view.page === "config" ? (
        <ConfigView host={view.host} knownHosts={knownSshHosts} totpProfiles={totpProfiles} onBack={goHome} onSave={handleSaveHostConfig} />
      ) : view.page === "sftp" ? (
        <SftpView host={view.host} knownHosts={knownSshHosts} totpProfiles={totpProfiles} onBack={goHome} />
      ) : view.page === "theme" ? (
        <ThemeView onBack={goHome} appearance={appearance} setTheme={setTheme} setAccent={setAccent} setTermSize={setTermSize} setTermLigatures={setTermLigatures} onResetAppearance={resetAppearanceToDefaults} />
      ) : view.page === "snippets" ? (
        <SnippetsView onBack={goHome} snippets={snippets} onAdd={handleAddSnippet} onUpdate={handleUpdateSnippet} onDelete={handleDeleteSnippet} />
      ) : view.page === "vault" ? (
        <VaultView onBack={goHome} hosts={hosts} knownHosts={knownSshHosts} totpProfiles={totpProfiles} setTotpProfiles={setTotpProfiles} />
      ) : (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ width: 200, borderRight: `1px solid ${T.line}`, padding: 14, display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: 2, padding: "4px 10px 8px" }}>{sidebarDisplay.groupSectionLabel}</div>
            {groups.map(g => {
              const display = buildHostGroupNavItemDisplay({
                group: g,
                selectedGroup,
                count: countHostsInGroup(hosts, g),
              });
              return (
                <button key={g} onClick={() => setGroup(g)} style={{
                  display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8,
                  border: "none", cursor: "pointer", fontSize: 13, fontFamily: T.sans,
                  background: display.selected ? T.amberSoft : "transparent", color: messageToneColor({ tone: display.tone }, T.dim),
                }}>
                  <span>{display.label}</span><span style={{ fontFamily: T.mono, fontSize: 11, opacity: .7 }}>{display.count}</span>
                </button>
              );
            })}
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: 2, padding: "16px 10px 8px" }}>{sidebarDisplay.toolSectionLabel}</div>
            {sidebarDisplay.tools.map(n => (
              <button key={n.id} onClick={() => setView({ page: n.id })} style={{
                textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 13, fontFamily: T.sans, background: "transparent", color: T.dim,
              }}>{n.label}</button>
            ))}
            <button
              onClick={importDefaultSshConfig}
              onDragOver={e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; }}
              onDrop={e => { e.preventDefault(); importFiles(e.dataTransfer.files); }}
              style={{ marginTop: "auto", padding: 12, borderRadius: 10, border: `1px dashed ${T.line}`, fontSize: 11, color: T.faint, lineHeight: 1.7, background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: T.sans }}
            >
              {importDropzoneDisplay.prefix} <span style={{ color: T.dim, fontFamily: T.mono }}>{importDropzoneDisplay.pathLabel}</span> {importDropzoneDisplay.suffix}
              {importDropzoneDisplay.statusVisible && <div style={{ marginTop: 8, color: messageToneColor({ tone: importDropzoneDisplay.statusTone }), fontFamily: T.mono }}>{importDropzoneDisplay.statusText}</div>}
            </button>
            <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={e => importFiles(e.target.files)} />
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{selectedGroup}</h1>
              <span style={{ fontSize: 12, color: messageToneColor(hostListSummary, T.faint), fontFamily: T.mono }}>{hostListSummary.text}</span>
              <button onClick={openAddHost} style={{ ...ghostBtn(), padding: "5px 12px", marginLeft: "auto", color: T.amber, borderColor: T.amber }}>{hostListToolbarDisplay.addHostLabel}</button>
              <button disabled={hostListToolbarDisplay.refreshStatusDisabled} onClick={refreshHostStatus} style={{ ...ghostBtn(), padding: "5px 12px", opacity: hostListToolbarDisplay.refreshStatusOpacity }}>{hostListToolbarDisplay.refreshStatusLabel}</button>
              {probeStatus.text && <span title={probeStatus.title || ""} style={{ fontSize: 12, color: messageToneColor(probeStatus), fontFamily: T.mono }}>{probeStatus.text}</span>}
            </div>
            {hostListEmptyState.visible && (
              <div style={{ minHeight: 260, border: `1px dashed ${T.line}`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: T.dim, textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 16, color: T.text, fontWeight: 600 }}>{hostListEmptyState.title}</div>
                <div style={{ fontSize: 12, color: T.faint }}>{hostListEmptyState.description}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button onClick={openAddHost} style={{ ...ghostBtn(), padding: "6px 14px", color: T.amber, borderColor: T.amber }}>{hostListEmptyState.primaryActionLabel}</button>
                  <button onClick={() => hostListEmptyState.secondaryAction === "import" ? importDefaultSshConfig() : setGroup(ALL_HOSTS_GROUP)} style={{ ...ghostBtn(), padding: "6px 14px" }}>{hostListEmptyState.secondaryActionLabel}</button>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
              {shown.map(h => {
                const isHover = hover === h.id;
                const actionsVisible = areHostCardActionsVisible({
                  hovered: isHover,
                  focusWithin: focusedHost === h.id,
                });
                const last = getLatestSparklineValue(h.lat);
                const cardDisplay = buildHostCardDisplay(h, {
                  hovered: isHover,
                  actionsVisible,
                  latestLatency: last,
                });
                const tags = getVisibleHostTags(h.tags);
                return (
                  <div
                    key={h.id}
                    onMouseEnter={() => setHover(h.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocusCapture={() => setFocusedHost(h.id)}
                    onBlurCapture={e => {
                      if (!e.currentTarget.contains(e.relatedTarget)) {
                        setFocusedHost(current => current === h.id ? null : current);
                      }
                    }}
                    style={{
                      background: T.panel, border: `1px solid ${messageToneColor({ tone: cardDisplay.borderTone }, T.line)}`, borderRadius: 14,
                      padding: 16, transition: "border-color .15s, transform .15s",
                      transform: cardDisplay.transform,
                      opacity: cardDisplay.opacity,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Pulse status={h.status} />
                      <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600 }}>{h.name}</span>
                      <button onClick={e => { e.stopPropagation(); handleToggleFavorite(h.id); }} title={cardDisplay.favoriteTitle} style={{ background: "transparent", border: "none", color: messageToneColor({ tone: cardDisplay.favoriteTone }, T.faint), fontSize: 13, cursor: "pointer", padding: 0 }}>{cardDisplay.favoriteIcon}</button>
                      <div style={{ marginLeft: "auto", textAlign: "right" }}>
                        <Spark data={h.lat} color={messageToneColor({ tone: cardDisplay.latencyTone }, T.green)} />
                        {cardDisplay.latencyLabel && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.faint }}>{cardDisplay.latencyLabel}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: T.dim, fontFamily: T.mono, margin: "8px 0 12px" }}>{formatUserHostPort(h)}</div>
                    <Chain chain={h.chain} jumpHosts={h.jumpHosts} name={h.name} proxy={h.proxy} />
                    <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
                      {tags.visible.map(t => <span key={t} style={{ fontSize: 10, color: T.faint, border: `1px solid ${T.line}`, padding: "2px 8px", borderRadius: 99 }}>{t}</span>)}
                      {tags.hiddenCount > 0 && <span style={{ fontSize: 10, color: T.dim, border: `1px solid ${T.line}`, padding: "2px 8px", borderRadius: 99 }}>+{tags.hiddenCount}</span>}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6, opacity: actionsVisible ? 1 : 0, pointerEvents: getHostCardActionPointerEvents(actionsVisible), transition: "opacity .15s" }}>
                        <button tabIndex={getHostCardActionTabIndex({ visible: actionsVisible })} onClick={() => openEditHost(h)} style={{ ...ghostBtn(), padding: "4px 10px" }} title={hostListToolbarDisplay.editHostTitle}>✎</button>
                        <button tabIndex={getHostCardActionTabIndex({ visible: actionsVisible })} onClick={() => setView({ page: "config", host: h })} style={{ ...ghostBtn(), padding: "4px 10px" }} title={hostListToolbarDisplay.configHostTitle}>⚙</button>
                        <button tabIndex={getHostCardActionTabIndex({ visible: actionsVisible, disabled: !cardDisplay.canSftp })} disabled={!cardDisplay.canSftp} onClick={() => cardDisplay.canSftp && setView({ page: "sftp", host: h })} style={{ ...ghostBtn(), padding: "4px 10px", opacity: cardDisplay.canSftp ? 1 : cardDisplay.actionDisabledOpacity, cursor: cardDisplay.canSftp ? "pointer" : "not-allowed" }} title={cardDisplay.sftpTitle}>⇅</button>
                        <button tabIndex={getHostCardActionTabIndex({ visible: actionsVisible })} onClick={() => handleRemoveHost(h)} style={{ ...ghostBtn(), padding: "4px 10px", color: T.red }} title={hostListToolbarDisplay.deleteHostTitle}>×</button>
                        <button onClick={() => cardDisplay.canConnect && setView({ page: "session", host: h })} disabled={!cardDisplay.canConnect}
                          tabIndex={getHostCardActionTabIndex({ visible: actionsVisible, disabled: !cardDisplay.canConnect })}
                          style={{ background: T.amber, border: "none", borderRadius: 8, padding: "4px 14px", color: T.onAccent, fontSize: 12, fontWeight: 600, cursor: cardDisplay.connectCursor, fontFamily: T.sans, opacity: cardDisplay.connectOpacity }}
                          title={cardDisplay.connectTitle}>
                          {hostListToolbarDisplay.connectLabel}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showAddHost && (
        <div onClick={closeHostForm} style={{ position: "fixed", inset: 0, background: "rgba(5,7,10,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "fadeIn .15s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "94vw", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.55)" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600 }}>{hostFormDisplay.title}</div>
            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {hostFormDisplay.fields.map(field => (
                <div key={field.key} style={{ gridColumn: field.gridColumn || undefined }}>
                  <label style={lbl()}>{field.label}</label>
                  <input style={fieldStyle()} value={hostForm[field.key] || ""} onChange={e => setHostForm({ ...hostForm, [field.key]: e.target.value })} placeholder={field.placeholder} />
                </div>
              ))}
              {hostFormDisplay.errorVisible && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: T.red }}>{hostFormDisplay.errorText}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.line}`, justifyContent: "flex-end" }}>
              <button onClick={closeHostForm} style={{ ...ghostBtn(), padding: "7px 16px" }}>{hostFormDisplay.cancelLabel}</button>
              <button onClick={submitHost} style={{ background: T.amber, border: "none", borderRadius: 8, padding: "7px 18px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>{hostFormDisplay.submitLabel}</button>
            </div>
          </div>
        </div>
      )}

      {palette && <Palette hosts={hosts} onClose={() => setPalette(false)} onConnect={openHostSession} onOpenSftp={openHostSftp} onCopyCommand={copyHostCommand} />}
    </div>
  );
}
