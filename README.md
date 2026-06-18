# RELAY SSH Manager

RELAY is a Tauri 2 + React desktop SSH manager built from the design documents in `design/`.
The current implementation preserves the `design/ssh-manager.jsx` prototype as the main UI and adds a real Tauri application shell, Linux packaging, xterm.js integration helpers, and Rust command endpoints for the M0 executable milestone.

## Current Scope

- React UI matching the supplied prototype: hosts, command palette, connection config, session split/broadcast controls, local terminal, SFTP, themes, snippets, and vault views.
- Shared SSH command preview logic with `IdentityFile` output and copy-safe shell quoting, editable forwarding rule helpers, session auto-forward request mapping, terminal search helpers for xterm and preview output, terminal renderer status badges, command palette quick-connect and keyboard navigation helpers, command-palette offline action guards, host action availability guards for offline cards, keyboard-safe host-card hover actions, reduced-motion CSS guards, dangerous command detection, OpenSSH config import parser, persistent host profile store, credential usage matching for configured `IdentityFile` keys, non-sensitive configuration snapshot import/export, persistent appearance preferences, persistent command history completion, mock SFTP file-tree operations, real SFTP file transfer planning, trzsz filter bridge with desktop file picker/save IO, route-labeled trzsz transfer status text, and persistent command snippet model with category filtering and unit tests.
- Tauri 2 desktop shell with Linux executable, deb, rpm, and AppImage output.
- Rust backend command surface for health, SSH agent status detection, shared binary Channel frame aggregation, local PTY, real `russh` shell sessions, known_hosts server-key verification, shared SOCKS5/HTTP CONNECT/ProxyCommand/jump-host transport for terminal/SFTP/forwarding SSH sessions, default OpenSSH config reading with recursive `Include` expansion, TCP-backed host status probing, TCP/proxy-backed connection-path tests, proxy validation, SSH-backed local `-L` forwarding, SSH-backed remote `-R` forwarding, SSH-backed dynamic SOCKS `-D` forwarding, Linux monitor sampling, local filesystem browsing/editing and base64/chunked file commands for the SFTP view, real `russh-sftp` remote directory listing plus directory creation and text/base64/chunked file read/write, SSH public-key vault scanning, private-key presence checks, Unix private-key permission repair, and OS keychain-backed secret read/write/delete commands for SSH passwords, private-key passphrases, and TOTP seeds.
- xterm.js helper with WebGL-first renderer loading, explicit Canvas fallback status, fit/search/weblinks addons, RELAY theme mapping, and dynamic loading from the Tauri session view.

Real SSH shell sessions are available through the Tauri `ssh_open` / `ssh_write` / `ssh_resize` / `ssh_close` commands using `russh`, password or private-key authentication, PTY allocation, and binary Channel output. The session opener now carries saved SOCKS5/HTTP CONNECT/ProxyCommand configuration and saved `chain` / explicit `jumpHosts` from the host profile into the Rust transport layer, performs proxy handshakes or starts the ProxyCommand process bridge first, and can recursively authenticate jump hosts, open `direct-tcpip` channels through each hop, keep the jump sessions alive, and give the final stream to `russh::client::connect_stream`; the same shared transport is reused by real SFTP sessions and SSH-backed `-L` / `-R` / `-D` forwarding control connections. The session page now dynamically loads xterm.js in the desktop runtime, attaches it to the `russh` Channel stream, forwards terminal input and resize events, exposes `Ctrl/Command+F` search over xterm SearchAddon results, and falls back to the animated preview terminal in the browser with preview-line search feedback. The split control opens a second same-host SSH shell/xterm pane with its own resize, lifecycle, search target, and trzsz bridge, while broadcast mode sends the smart input command to both panes when split is active and keeps the input copy honest before a split exists. SSH session input and output now pass through a `trzsz` `TrzszFilter` bridge: server output is scanned for transfer handshakes, terminal input is gated while transfers run, terminal width is forwarded for progress rendering, and dropping files onto a connected terminal calls `uploadFiles` instead of the earlier pending placeholder. In Tauri desktop sessions, the `trzsz` bridge now injects native upload/save chooser hooks for typed `trz` / `tsz` prompts and drag upload flows, while the File System Access API polyfill backs those prompts with native file/folder dialogs, local path metadata, lazy chunked base64 reads, chunked writes, seek, and truncate support; protocol-level `trzsz` resume remains constrained by the public `trzsz.js` API. SSH sessions now verify the server public key against OpenSSH `known_hosts` by default: known keys connect, unknown keys surface a SHA256 fingerprint for user confirmation before being recorded, and changed keys fail without overwriting the existing entry. `IdentityFile ~/.ssh/...` paths from imported OpenSSH configs are expanded on the Rust side before loading private keys, and `ssh_open` now validates the private key locally before opening the network connection: missing keys, non-file paths, and Unix permissions open to group/other fail with an actionable `chmod 600` message. The desktop import entry can read the default `~/.ssh/config` through the Rust `read_default_ssh_config` command before falling back to manual file selection; drag-and-drop config import remains available. Hosts can also be created and edited manually from the host list with validation, duplicate prevention, tags, groups, ports, optional `IdentityFile`, and preservation of saved chain/proxy/forwarding settings, then persist through the same host profile store. Host cards now support persisted favorite toggling and delete confirmation. The session input records executed commands into a persistent local history, and Tab ghost completion now prefers that history before falling back to built-in common commands. Dangerous shell commands are detected before they are sent to a preview or real SSH session; recursive deletes, service stops/restarts, power commands, disk formatting/raw writes, and container/cluster deletes turn the input red and require confirmation before history recording or remote write. The host list can refresh real online/offline state through the Rust `probe_hosts` command, which TCP-probes each host/port, updates latency sparklines, and keeps offline hosts disabled. SSH-backed local `-L` forwarding, SSH-backed remote `-R` forwarding, and SSH-backed dynamic SOCKS `-D` listeners are available through `start_forward` / `stop_forward` / `list_forwards` with a managed listener registry and bidirectional TCP relay; the config page now lets users edit each forwarding rule's ports and target fields inline before starting it, and the session page automatically starts saved enabled forwarding rules after the main SSH connection succeeds, shows a per-session forwarding badge, and stops those auto-started listeners when the session closes. The `-L` runtime path authenticates to the selected host, listens locally, opens a real SSH `direct-tcpip` channel for each accepted connection, and relays bytes to the configured target as seen from the remote SSH server. The `-D` runtime path authenticates to the selected host, listens locally as a SOCKS5 proxy, opens a real SSH `direct-tcpip` channel for each SOCKS CONNECT target, and returns SOCKS failure replies when channel opening fails. The `-R` runtime path authenticates to the selected host, requests a real `tcpip-forward` listener over SSH, relays each server-opened `forwarded-tcpip` channel to the configured local target, and cancels the remote listener on stop. The connection-chain tester now calls the Rust backend, validates proxy/node input, performs a real TCP probe for directly reachable endpoints, performs real no-auth SOCKS5 or HTTP CONNECT handshakes from the configured proxy node to the next hop, and starts ProxyCommand probes against SSH-like targets by waiting for target data before marking deeper SSH-channel-only segments as `unchecked`. The host list can import concrete `Host` entries from OpenSSH config files, including `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`, and `ProxyCommand`; imported hosts and saved chain/proxy/forwarding edits persist in local storage, with runtime-only listener state stripped before saving. Theme, accent color, terminal font size, snippets, host profiles, TOTP profile metadata, and local command history also persist in local storage and can be exported/imported as a versioned RELAY JSON configuration snapshot; the snapshot builder uses an explicit whitelist so passwords, private-key passphrases, TOTP seeds, generated codes, and OS keychain secrets are never written into the file. The equivalent SSH command preview can be copied from the config page, includes saved `IdentityFile` as `-i`, and command palette copy uses saved host configuration. The command palette supports host/tag search, `user@host[:port]` temporary hosts, SSH command copy, and SFTP-open shortcuts. Command snippets can be created, deleted, copied, persisted in local storage, inserted from the session drawer, marked as dangerous, and confirmed at send time. The session monitor prefers the active SSH `sessionId` and asks the existing `russh` session task to open a lightweight monitor `exec` channel, so normal in-session sampling does not re-authenticate or rebuild the proxy/jump chain; when no reusable session exists, it falls back to the same resolved SSH auth/proxy/jump-host context and remote sampler command. The sampler reads target Linux `/proc`, `/etc/os-release`, and `df -P /` data for CPU, memory, disk, network, load, uptime, OS, and process count; local sampling remains as the desktop fallback path. The SFTP view can browse the real local filesystem inside Tauri, create local folders, navigate local/remote paths through clickable breadcrumbs, materialize completed remote text downloads into the selected local directory with contents preserved, edit real local text files in the same online editor with save-back, upload real local text files into the remote pane with their contents preserved for immediate online editing, and recursively transfer directories between the mock local and remote trees for preview workflows. The browser preview SFTP panes also expose matching local and remote refresh/new-folder controls, so the left local tree can be reset or extended just like the right remote tree. The SFTP page can now also open a real `russh-sftp` subsystem for the selected host, authenticate with the same password/private-key request shape, honor strict known_hosts confirmation, browse remote directories with parent navigation and metadata, create real remote directories, read editable remote text files up to 1 MiB, save editor changes back through SFTP with truncation, download selected remote files and directories into the current real local directory through the transfer queue, upload selected local files into the current real remote directory with overwrite confirmation, and recursively transfer selected directories by creating/merging directories and streaming child files. Real local and remote file transfer now uses chunked base64 IPC with 1 MiB chunks, queue progress derived from actual transferred bytes, file-level resume when the existing target file is smaller than the source, and directory-wide aggregate progress/throughput after recursive pre-scan; progress publication is throttled by percentage or time thresholds so chunk-heavy transfers do not force a React state update for every chunk, while completion and explicit materialization steps still publish immediately. Whole-file base64 commands remain available for small compatibility paths and text editing. The vault now requires a local master-password unlock gate before showing key and TOTP controls; the gate stores only a salted SHA-256 verification record in localStorage, while SSH/TOTP secrets remain in the OS keychain and are still excluded from exported snapshots. After unlock, the vault scans `~/.ssh/*.pub` public keys, computes OpenSSH-compatible `SHA256:` fingerprints without reading private-key contents, derives the matching private-key path, reports missing/private-key-permission status, and can repair too-open Unix private-key permissions to `0600` through an explicit user action. SSH password and private-key passphrase prompts now first consult the OS keychain through Tauri commands, then optionally save user-entered secrets back to the system keychain for later terminal, SFTP, forwarding, and jump-host authentication. TOTP seeds are stored under separate OS keychain entries, and the vault can generate, copy, and delete current RFC 6238 6-8 digit codes without exposing the seed in local storage or exported snapshots. Terminal, SFTP, forwarding, and jump-host authentication now share a keyboard-interactive fallback: when the server requests password and/or recognized OTP verification prompts, RELAY responds with the current keychain-backed password/TOTP code and refuses unknown challenge questions instead of guessing.

File import controls are reset after success or failure, so selecting the same corrected SSH config or RELAY snapshot again reliably re-runs the import.

Top-bar config sync, OpenSSH config import, and host-status probe feedback now share explicit success/error/pending/neutral status objects instead of parsing localized status text prefixes to choose colors.

Browser-preview guards for desktop-only bridge commands now share localized errors for real SSH sessions, local PTY, port forwarding, real SFTP, local filesystem access, private-key permission repair, system keychain, and TOTP keychain storage.

Runtime SSH and local PTY terminals pause direct xterm writes while the desktop WebView is hidden, buffer incoming Channel bytes in the terminal wrapper, and flush them in order when the window becomes visible again. Hidden-window buffers are bounded to the latest output; if a long-running command exceeds the cap, RELAY drops the oldest buffered chunks and writes a localized notice before replaying the retained output so inactive terminal memory cannot grow without limit.

Runtime SSH and local PTY terminal status lines now use localized connection, trusted-host-key, startup, and error text. Browser-preview bridge fallbacks also localize SSH Agent status, connection-path probe messages, offline host probe reasons, and monitor OS labels.

Top-bar SSH Agent status now uses a shared display model for ready, empty, missing, preview, checking, error, and unknown states. The model clamps identity counts, trims tooltip messages and `SSH_AUTH_SOCK`, and exposes success/pending/error tones so the shell header no longer rebuilds agent labels and colors from raw backend status strings.

Terminal search results now carry explicit success/neutral/error tones from the shared search helper. Session and local PTY search bars no longer inspect localized text such as "未找到" to decide coloring: matches render as success, empty searches stay neutral, and unsupported xterm search or not-found results render as errors.

Terminal search bar chrome now also renders from shared display metadata for the search label, placeholder, split-pane selector, case-sensitive label, navigation titles/icons, close title/icon, and normalized status tone. Session SSH search and local PTY search keep their existing handlers while sharing the same tested display contract.

Local terminal page chrome now uses shared display metadata for the back action, shell label, search button text/active state, and browser-preview terminal lines. The desktop PTY open/write/resize lifecycle is unchanged while the design-required local terminal copy is covered by focused unit tests.

Session connection badges now share one display model for main SSH, split SSH, and local PTY states. The model normalizes connected/error/connecting/preview modes, trims tooltip errors, and exposes explicit success/pending/error tones so header badges no longer rebuild labels and colors from raw mode strings.

Local PTY lifecycle IPC now uses the same camelCase request shape as SSH session IPC for open/write/resize/close, including nested resize requests, so xterm fit events keep the desktop shell size synchronized without relying on mixed `session_id` / `sessionId` payloads.

Local PTY backend sessions are removed from the registry both when the frontend explicitly closes the terminal and when the spawned shell exits naturally, preventing stale local terminal sessions from accumulating after short-lived shell commands.

The host list summary now reports explicit `online` hosts separately from connectable `busy` hosts, matching the prototype's `X online / Y total` status while still allowing busy hosts to open SSH or SFTP sessions. Host status dots keep the prototype semantics as well: online hosts use the green expanding pulse, busy hosts use a static amber dot, and offline hosts use a muted static dot.

Host list display ordering now treats the persisted favorite star as a real priority: favorite hosts appear first, then online, busy, offline, and unknown-status hosts, while hosts with the same priority keep their original stable order inside the selected group.

Command-palette host matches reuse the same favorite/status priority before applying the result limit, so keyboard-first quick connect surfaces starred and currently reachable hosts before lower-priority matches.

Command-palette quick-connect resolution now checks the full saved host list before adding a temporary `user@host[:port]` row. If a saved profile has the same user, host, and port, that profile is promoted to the top of the palette results even when normal match limiting would have hidden it; bracketed saved IPv6 hosts are normalized before this comparison, and sparse imported records without ids are deduplicated by object identity.

Host cards use the same target formatter as command palette matches and SSH command copy, so non-default ports stay visible and IPv6 hosts are bracketed consistently in the `user@host[:port]` line.

Host list group navigation and the page-level online summary now use shared display models. Group rows normalize blank labels, clamp malformed counts, expose selected/neutral tones before rendering, and the main host list summary derives the `N 在线 / M 台` text from the already filtered visible hosts.

Host cards now use a shared display model for hover transform, focused/hovered border tone, offline opacity, favorite star text, latency color/label, and disabled SFTP/connect action titles. The card no longer rebuilds these states directly from raw host flags while rendering.

Host card and monitor sparklines share a stable point generator that drops missing latency samples, preserves valid `0ms` values, and renders single-point or flat histories as horizontal lines instead of producing invalid SVG coordinates.

Host deletion now uses the same explicit confirmation pattern as other destructive actions: the prompt shows the concrete `user@host[:port]` target, brackets IPv6 addresses, and warns when saved jump-chain or forwarding-rule configuration will be removed with the host profile.

Manual host profiles now normalize configured `IdentityFile` values, including imported array-like values and legacy/runtime `privateKeyPath` aliases, and duplicate checks canonicalize name, user, host, and port casing so edits cannot create case-only duplicates.

Manual and persisted host profiles now normalize bracketed IPv6 address input before storage and duplicate checks: users may type `[2001:db8::1]`, but RELAY stores `2001:db8::1`, treats bracketed and unbracketed forms as the same host, and leaves display components responsible for adding brackets where `user@[addr]:port` is needed.

Manual host add/edit validation now returns localized form errors for duplicate profiles, missing name/address/user fields, and invalid ports before writing to the host store.

OpenSSH config import now resolves effective options across global defaults and matching `Host` sections, so concrete aliases inherit leading global defaults plus later `Host *` / wildcard defaults for `User`, `Port`, `IdentityFile`, `ProxyJump`, and `ProxyCommand` while earlier concrete values stay authoritative and negated patterns are honored. Conditional `Match` blocks are treated as runtime-only OpenSSH logic and no longer leak directives into the previous imported host.

OpenSSH config drag-and-drop and file-picker imports now validate that a readable file was actually selected before parsing. Empty drops, text/link drags without files, and unreadable directory-like selections produce localized import status messages instead of silently doing nothing or surfacing a generic runtime error.

OpenSSH `HostName` token placeholders are expanded during import for concrete hosts and structured `ProxyJump` aliases, so `%h`, `%n`, `%r`, `%p`, and `%%` resolve to the imported alias/user/port context while `ProxyCommand` placeholders remain untouched for OpenSSH/runtime substitution.

The desktop default `~/.ssh/config` import now expands OpenSSH `Include` directives before parsing, including `~` paths, paths relative to the current config file, and `*` / `?` glob patterns, while avoiding recursive include cycles.

Default `~/.ssh/config` Include expansion now also respects backslash-escaped spaces and literal `#` characters without stripping ordinary path backslashes, so included files under spaced directories, hash-named files, and Windows-style include paths keep their intended path text.

Imported OpenSSH `LocalForward`, `RemoteForward`, and `DynamicForward` directives now become enabled GUI forwarding rules, including common split syntax, compact `listen:host:port` forms, bind-address prefixes, and bracketed IPv6 targets, so existing tunnel definitions survive config import and can auto-start with sessions. Forwarding directives are additive across every matching `Host` section, so host-specific and wildcard tunnel rules import together without losing later defaults. `ClearAllForwardings yes` is honored during import and suppresses matched forwarding directives, preventing RELAY from auto-enabling tunnels that the OpenSSH profile explicitly clears.

Remote forwarding rules now preserve their local target host across the config editor, session auto-start requests, compact rule descriptions, and equivalent SSH command preview. `-R` output renders `remotePort:targetHost:targetPort` instead of assuming every target is `localhost`, with loopback used only as the explicit fallback.

Forwarding rule validation now rejects unsupported rule types before preview toggles, desktop starts, or session auto-start can dispatch them, and the config page renders corrupted rule types as removable errors instead of falling through to the local `-L` starter. Persisted forwarding rules now also share a normalizer across host storage, config-row rendering, session auto-start signatures, and runtime start requests: blank ids get stable fallbacks, lowercase/space-padded types and ports are trimmed, dynamic SOCKS rules drop irrelevant target fields, and runtime-only fields are stripped before localStorage or snapshot export.

Forwarding rule validation errors are localized before they reach the config page or session auto-start path, including unsupported rule types, invalid local/remote/target ports, and missing local-forward targets.

Forwarding config rows now use a shared display model for type badges, colors, compact descriptions, active/runtime labels, opacity, and start/stop/delete button states. Corrupted unsupported rule types render as red removable rows instead of inheriting the local-forward visual path or offering a start action.

Forwarding registry snapshots now derive each rule's `active` flag from the underlying runtime task instead of the original start record, so `list_forwards` stops reporting a listener as active after its background task has already exited.

Forwarding runtime write-back uses the same normalized rule type as validation and start requests, so lower-case or space-padded imported `-R` rules keep their assigned remote bind port in `rport` instead of being written back as a local listener port after startup.

Session auto-forward badges now use a shared display model for preview, waiting, starting, partial-failure, and ready states. The badge clamps malformed started/total counts, joins per-rule errors into the tooltip, and exposes explicit success/pending/error tones so the session header does not rebuild forwarding labels and colors from raw state strings.

Forwarding rule deletion now requires an explicit confirmation that includes the normalized rule description. If the rule is currently enabled or has a desktop runtime listener id, the confirmation warns that RELAY will stop the active listener before removing the rule.

OpenSSH config import also accepts `Keyword=value` directives, including optional spaces around `=`, so generated configs using `HostName=...`, `Port = ...`, or quoted `ProxyCommand=...` values import correctly.

OpenSSH config import now also honors backslash-escaped spaces, quotes, literal `#` characters, and backslashes while preserving ordinary Windows-style paths, so `IdentityFile ~/.ssh/prod\ key`, escaped ProxyCommand arguments, and `C:\Users\...\id_ed25519` import as usable runtime values.

OpenSSH `ProxyCommand none` is treated as an explicit disabled proxy command during import, so a direct host does not accidentally inherit or execute a literal `none` command.

Imported `ProxyJump` chains now keep structured `jumpHosts` alongside the visual chain labels, preserving `user@host:port` details and matching jump-host `HostName`, `User`, `Port`, `IdentityFile`, and `ProxyCommand` options for real SSH/SFTP/forwarding authentication.

OpenSSH config import now keeps target-level `ProxyJump` mutually exclusive with target-level `ProxyCommand`: a host with a concrete jump chain imports the structured `jumpHosts` route and drops the competing target proxy command, while `ProxyCommand` defined on the jump-host aliases themselves is still preserved as per-hop proxy metadata.

Imported OpenSSH hosts now use the same case-insensitive `name/user/host/port` duplicate key as manual host profiles, preventing case-only aliases from being added twice across existing hosts or within one config file.

OpenSSH config import now also normalizes bracketed IPv6 `HostName` values for target hosts and structured `ProxyJump` aliases before storing or deduplicating imported records. Existing `2001:db8::1` profiles and imported `[2001:db8::1]` aliases are treated as the same endpoint, while display surfaces still add brackets where OpenSSH-style `user@[addr]:port` text is needed.

Active session monitor polling uses `ssh_sample_monitor(sessionId)` so the running SSH connection task opens the sampler `exec` channel; `sample_remote_monitor` remains available for non-session remote sampling.

Monitor panel samples are normalized before rendering: percent meters are clamped to 0-100, missing fields fall back to the previous valid sample, network rates stay non-negative, and CPU/network histories remain bounded so bad sampler output cannot produce invalid meter widths or sparklines.

Monitor panel rendering now also goes through a shared display model for the panel title, meter rows, CPU threshold color, network rate labels, CPU/network sparkline data, and footer system information. The session sidebar consumes the model instead of rebuilding labels and latest-history values directly in React.

Configuration sync snapshots carry a stable local device id, normalized item counts, and a deterministic content hash. Imports validate the hash after normalization, preserve backward compatibility with older snapshot files that lack sync metadata, and label imported snapshots as local or external in the top bar without exporting secrets.

Configuration sync now treats top-level host `privateKeyPath` aliases the same way as saved host profiles and jump hosts: the raw alias field is stripped from snapshots, but the normalized path is retained as `IdentityFile` so older/runtime host records do not lose key-based authentication after export/import.

Configuration snapshot imports now show a replacement impact summary before writing local state, including local-to-incoming counts for hosts, snippets, TOTP profiles, and command history. Imports that would remove existing local entries include an explicit removal warning and can be canceled before any local RELAY configuration is replaced.

Configuration snapshot imports now validate that a readable RELAY JSON file was selected before parsing, so empty selections and unreadable directory-like objects report localized sync status instead of doing nothing. Snapshot parsing and integrity failures still surface localized errors for invalid JSON, non-RELAY files, unsupported schema versions, missing data, and checksum mismatches.

Configuration snapshot command-history and snippet sync now drops sensitive-looking shell entries before export or import, including common `PASSWORD=...`, `TOKEN=...`, API-key assignments, `Authorization: Bearer/Basic ...` headers, `sshpass -p`, `docker login -p`, and inline MySQL `-psecret` forms. Local command history and local snippets remain available in RELAY, but these entries are not written into portable config files. The same detector now protects custom `ProxyCommand` values in host and jump-host proxy profiles: safe commands such as `ssh -W %h:%p bastion` remain available, while commands with embedded credentials are disabled before local profile persistence or config snapshot sync.

The local host profile store now uses the same non-sensitive whitelist as configuration snapshots for host and jump-host records, stripping runtime passwords, private-key passphrases, raw private-key path aliases, and TOTP codes before writing profiles to localStorage while keeping normalized `IdentityFile`, proxy, forwarding, and structured jump-host metadata. Jump-host metadata now shares one profile normalizer across config editing, persistence, configuration snapshots, and runtime auth: bad entries without usable host/user are skipped, bracketed IPv6 addresses are stored without brackets, ports fall back safely to 22, `IdentityFile` / TOTP profile bindings are trimmed, nested proxy metadata is sanitized, and SSH/SFTP/forwarding auth only receives runtime secrets from providers or current in-memory prompts.

Persisted host profiles are normalized after localStorage or snapshot import: sparse legacy records get safe default port, group, status, favorite, tags, chain, and latency history values, while records that still lack a usable name, host, or user after trimming are filtered before they can reach the host list UI. Stored latency history is capped to the latest eight valid samples, matching live probe updates and keeping host-card sparklines bounded even after importing oversized profiles. Host tags are trimmed and de-duplicated before persistence, and host cards render only the first few tags with a `+N` overflow marker so imported tag-heavy profiles do not stretch the card grid or produce duplicate React keys.

Host status probe results are normalized before they update the host list: only `online` / `offline` states are accepted, malformed statuses fall back to offline, latency samples are rounded to safe positive milliseconds, bad samples are ignored, and sparkline history stays bounded to the latest eight valid points.

Host-status refresh feedback now uses the same probe-result model for its summary badge. The helper normalizes malformed statuses before counting online/offline hosts, builds a per-host tooltip with probe errors, and exposes success/pending/error/neutral tones so the host list does not count raw backend statuses directly.

Host group navigation now uses one normalized model for sidebar options, counts, selection fallback, and card filtering: default prototype groups stay visible, imported or manually entered groups are trimmed and de-duplicated, and a removed/invalid selected group falls back to all hosts before rendering the list title or summary.

Unknown `known_hosts` server-key errors now share one front-end trust prompt model across SSH sessions, manual forwarding starts, session auto-forward starts, and SFTP remote browsing. Changed-key errors still bypass the trust retry path, while first-seen keys get the same confirmation wording in every entry point and the prompt target is parsed from the backend error when available, so a jump-host key prompt names the actual hop that produced the unknown fingerprint rather than only the final host. IPv6 unknown-key targets are bracketed in the prompt heading even when the backend reports the raw `{host}:{port}` form. Resolved `accept-new` host-key policy is honored on the first SSH, SFTP, manual-forward, and session auto-forward attempt instead of being overwritten by an initial strict retry. After a user accepts an unknown key during SFTP browsing, the resolved SFTP auth cache is marked as trusted so subsequent read, write, upload, download, mkdir, and refresh operations in the same view keep using the accepted retry context.

Private-key permission failures now share a front-end connection-error normalizer across SSH sessions, manual forwarding starts, session auto-forward starts, and real SFTP operations. RELAY backend errors and OpenSSH `UNPROTECTED PRIVATE KEY FILE` diagnostics are detected, the affected key path is extracted when possible, and the UI adds an explicit local `chmod 600 ...` action while SFTP clears cached auth on authentication/private-key failures. Common SSH authentication failures such as `Permission denied (publickey)`, missing credentials, password rejection, keyboard-interactive rejection, and unreadable private keys now get localized guidance before the raw backend/OpenSSH error text.

Real SFTP online-editor save failures now use the same connection-error state as remote browsing and transfers: authentication/private-key failures get localized guidance and clear the cached SFTP auth before the next retry, while ordinary filesystem write errors keep their direct message.

The connection-chain editor now supports dragging bastion/relay nodes directly in the visual path to reorder hops; keyboard-sized left/right controls remain available, and every reorder clears stale path-test results until the chain is tested again. Hop action buttons now also expose shared edge-state metadata, so the first hop cannot be moved left, the last hop cannot be moved right, and disabled controls show explicit boundary tooltips instead of relying on no-op clicks.

OpenSSH config import now preserves `StrictHostKeyChecking` for target hosts and structured `ProxyJump` hops. Imported `accept-new` entries keep strict changed-key protection while trusting first-seen keys, and imported `no` / `off` / `false` entries disable strict host-key checking across terminal, SFTP, forwarding, monitor, config-sync, and equivalent SSH command preview paths.

OpenSSH config import now preserves `ConnectTimeout` for target hosts and structured `ProxyJump` hops. Imported timeout values are normalized to RELAY's bounded millisecond model, persisted in host profiles and configuration snapshots, reused by terminal, SFTP, forwarding, monitor, and per-hop jump-chain SSH connections, and rendered back into the equivalent OpenSSH command preview as `-o ConnectTimeout=N` for target hosts.

OpenSSH config import now preserves `ServerAliveInterval` and `ServerAliveCountMax` for target hosts and structured `ProxyJump` hops. Imported keepalive settings are normalized, persisted in host profiles and configuration snapshots, sent through terminal, SFTP, forwarding, monitor, and jump-chain SSH requests, mapped to `russh` client keepalive configuration, and rendered in equivalent OpenSSH command previews for target hosts.

Connection-chain probe result badges now localize backend `ok` / `failed` / `unchecked` states as Chinese node labels while preserving the raw enum values for Tauri IPC and tests.

Connection-chain segment rendering now uses shared display metadata for node status labels, arrow colors, latency text, tooltips, and failed/unchecked edge badges. The config page no longer compares raw probe status strings directly while drawing the visual path, keeping localized labels and success/pending/error tones centralized with the probe summary logic.

Connection config page chrome now uses shared display metadata for the page title, save action, chain section copy, insert/test controls, hop move/remove tooltips, jump-host authentication labels, proxy/forwarding section titles, and equivalent SSH command section text. The config page keeps its existing save/probe/forwarding handlers while the design-required copy is covered by focused unit tests.

The SFTP transfer queue keeps failed transfers visible when clearing completed work, protects active/materializing items from cleanup, and disables the cleanup action when there is nothing completed to remove. Queue header summaries now use the same shared transfer model as row rendering: active, failed, completed, and empty queues return explicit text, counts, clear-button availability, and success/pending/error/neutral tones before React paints the footer. Queue row rendering normalizes direction, progress, transferred bytes, total size, metrics text, and status labels before writing CSS widths or percentage labels, so stale or malformed transfer records cannot produce invalid progress bars or inconsistent queue states. Real SFTP upload/download stream queue items are now also built through a shared helper, keeping resume offsets, initial progress, transferred bytes, target paths, and stream status consistent between upload and download flows.

SFTP transfer queue progress bars now use the same row display tone as their status labels. Failed, completed, active/materializing, and neutral rows no longer derive bar color from raw queue `status` strings after the display model has already normalized the item.

The SFTP upload/download direction buttons now use a shared transfer availability model instead of simple selection checks, so they stay disabled for unsupported symlinks, stale selections, and real-local directory transfers that require a real remote SFTP connection while still allowing preview directory transfers.

SFTP upload/download direction buttons now also use a shared display model for arrow text, tooltips, disabled state, opacity, and text/border tones. The buttons consume the existing transfer availability result instead of rebuilding ready/error titles and colors in the page component.

SFTP file panes now use shared chrome display metadata for preview, real local, and real remote toolbars. Pane titles, parent navigation text, refresh/create-folder tooltips and icons, edit labels, demo-return controls, and preview empty-state copy are normalized before React renders the two-column file manager.

SFTP new-folder actions now share a single path-segment name normalizer across preview local, preview remote, real local, and real remote panes. Prompt labels include the pane type and parent directory context, prompted names are trimmed before creation, and empty names, `.` / `..`, or values containing path separators are rejected before they reach mock tree state or desktop filesystem/SFTP commands.

Real local SFTP new-folder failures now use a local-filesystem error state, so a failed local `mkdir` never clears cached remote SFTP authentication just because a remote editor is open in the same view.

SFTP preview file-tree errors are localized before they reach toast messages: duplicate names, invalid path segments, wrong file/directory kinds, and unsupported entry copies now report Chinese messages consistent with the rest of the SFTP UI.

SFTP header toast messages now use a shared display helper before rendering. Existing success, refresh, pending-read, error, and empty messages are trimmed and mapped to explicit success/pending/error/neutral tones, so operation failures no longer render with the same amber color as ordinary progress feedback.

The real remote SFTP connection button now uses a shared display model for idle, loading, and connected states. The model provides button text, disabled state, opacity, and success/pending border/text tones so the header does not rebuild connection labels and colors from `remoteLoading` / `remoteListing` booleans.

SFTP page chrome now also uses shared display metadata for the back button, page title, host label fallback, file-route badge, queue title, empty transfer hint, clear-completed button state, and editor title/cancel action. Transfer execution, queue cleanup, and save handlers stay unchanged while the remaining design-required SFTP page copy is covered by focused unit tests.

Real local and real remote SFTP file panes now use a shared status-message model for loading, error, and empty directory states. The helper trims backend errors, localizes pending and empty text for local vs. remote panes, and exposes pending/error/neutral tones before React renders the message.

SFTP online-edit eligibility now uses one explicit text-file classifier for browser preview rows, real local listings, and real remote SFTP listings. Common config files such as `.env.local`, `.bashrc`, and uppercase extensions like `README.MD` are treated as editable text, while archive/binary-looking files remain hidden from the editor action.

The SFTP online editor now tracks the original loaded text for preview, real local, and real remote files. Closing the modal by backdrop or Cancel prompts before discarding unsaved edits, while unchanged buffers close immediately and successful saves still clear the editor without an extra prompt.

The SFTP online editor now also uses a shared display model for local, real-remote, and preview-remote save targets. The model centralizes the title path, save hint, button label, dirty/clean status, and saving lockout so duplicate save clicks cannot launch overlapping local or SFTP writes.

Real SFTP transfer planning now rejects selected symlink entries and same-named unsupported target entries with an explicit message instead of letting the upload/download action appear to do nothing or overwrite a non-regular target; recursive directory transfers reuse the same localized queue-visible reason when refusing to follow symlinks or unsupported entries inside a tree.

Real local filesystem listings now use non-following metadata for symlinks, so links are surfaced to the SFTP pane as `symlink` rows instead of being misclassified as their target file or directory. This lets the existing link badge and transfer refusal logic apply to local links as well as remote SFTP links.

Local SFTP text writes, chunked writes, truncate operations, base64 file creation, and placeholder file creation also reject existing non-regular targets, including live or broken symlinks, before opening the file. New-file creation uses no-overwrite semantics so broken links are not mistaken for empty destination slots.

Remote SFTP read and write commands now also validate server-reported file metadata before opening an existing path: directories, symlinks, sockets, and other non-regular targets are rejected when the server reports their type, while metadata responses without permission bits remain compatible and fall through to the actual SFTP open/create operation.

Real SFTP single-file and directory transfers merge into existing same-named target directories where applicable, resume smaller partial files, skip already complete files, and reject file/directory type conflicts or larger pre-existing targets before streaming bytes. Recursive directory planning now keeps skipped equal-size files in the work summary and counts them as already transferred, so aggregate resume progress reflects bytes that are already present at the target instead of only the files that still need streaming.

Zero-byte real SFTP transfers now enter the queue at full byte progress while still staying in the streaming/materializing state until the local file creation or remote write completes, so empty files no longer look stuck at 0% before they finish.

SFTP local target path construction now preserves the platform-style separator from the current local directory. Windows drive roots and backslash paths stay backslash-based, while Unix and forward-slash paths keep `/`, so recursive downloads, queue metadata, and downloaded text materialization no longer produce mixed local paths such as `C:\Users\me/file.txt`.

Real SFTP uploads now use an explicit overwrite/merge confirmation whenever the selected local file or directory already exists in the real remote pane and cannot resume safely. The prompt names the local source path, concrete remote target path, and whether RELAY will replace a remote file or merge into an existing remote directory.

The shared connection path badge now includes saved SOCKS5/HTTP/ProxyCommand proxy nodes as well as jump hosts. The SFTP header uses the same full path and labels file traffic as direct, proxy-backed, or jump-backed so operators can see the route used for transfers before opening the remote pane.

Connection path badges, SFTP headers, and trzsz route tooltips now prefer structured `jumpHosts` when they match the visible chain, showing concrete `user@host:port` hop labels for imported `ProxyJump` routes while still falling back to current chain labels after local edits. Structured hop labels are formatted through the same jump-host profile normalizer used by auth/storage, so whitespace and bad ports are cleaned before display and unusable metadata falls back to the visible chain labels.

Connection path badges now keep long imported jump chains visually bounded: terminal headers, SFTP headers, and host cards show the first route nodes plus a `+N 跳` overflow pill while the tooltip, transfer labels, and underlying terminal/SFTP/trzsz connection data retain the complete path.

Connection path hop labels, proxy route nodes, and the config-page chain subtitles now share the same host address formatter as terminal connection messages, so whitespace-padded hosts and IPv6 endpoints render consistently as `user@[addr]:port` without duplicate bracket or ambiguous colon output. Backend host probes and direct connection-chain probes also normalize bracketed IPv6 inputs before TCP dialing while keeping bracketed `host:port` authorities in operator-facing errors.

The config-page connection-chain tester now derives one tested-route summary from the hop results: full success shows total measured latency, failed probes name the first unreachable endpoint with the verified segment count, and partial desktop-only checks show how many segments still require an authenticated SSH channel while preserving per-hop details in the tooltip.

Connection config saves now reconcile the visible chain with structured `jumpHosts`: matching imported routes keep their concrete host/user/port/key/TOTP metadata, edited routes resolve against known hosts, stale jump-host records are cleared, and the config page exposes per-hop host, user, port, `IdentityFile`, and TOTP binding fields so terminal, SFTP, forwarding, and SSH command preview do not keep using an old ProxyJump path after local chain changes.

Runtime `ProxyCommand` execution now expands `%h`, `%p`, and `%%` placeholders in a single OpenSSH-like pass, so literal percent escapes are preserved instead of being replaced twice. Before the rendered command is handed to the platform shell, RELAY also rejects target host values containing whitespace or shell-sensitive characters, preventing malformed host profiles from injecting extra shell syntax through `%h` while still allowing the user-authored ProxyCommand itself to run as configured.

SOCKS5 and HTTP CONNECT proxy profiles now expose optional username/password authentication fields in the config page. Proxy usernames are saved as non-sensitive profile metadata, route labels show authenticated proxy endpoints without exposing passwords, copied SSH commands warn when RELAY-managed proxy passwords are omitted, proxy passwords are read from or offered into the OS keychain under a separate `proxyPassword` secret kind, and the Rust transport performs SOCKS5 username/password authentication or HTTP Basic `Proxy-Authorization` during terminal, SFTP, forwarding, monitor, and connection-path probes without exporting proxy passwords in configuration snapshots. Proxy metadata is normalized before storage, route display, SSH command preview, keychain-secret discovery, and connection-time keychain prompts, so space-padded or mixed-case proxy kinds, bracketed IPv6 proxy hosts, invalid ports, HTTP/SOCKS default ports, and runtime password fields cannot leak inconsistent route/auth state; stored/runtime proxy hosts use bare IPv6 addresses while route labels, keychain labels, and copied OpenSSH `ProxyCommand` text add brackets where `host:port` needs them. Backend proxy handshakes also format IPv6 targets correctly: HTTP CONNECT sends bracketed authorities such as `[2001:db8::42]:2200`, and SOCKS5 sends IPv4/IPv6 literals with their native address types instead of mislabeling them as domain names.

The connection config proxy mode cards and conditional endpoint/auth/command fields now use shared display metadata derived from the same normalized proxy profile used by auth, storage, keychain, route labels, and SSH command generation. Mixed-case or `kind`-based proxy records therefore select the correct UI card and reveal the correct fields instead of relying on page-local string comparisons.

The config-page connection-chain proxy node now uses the same normalized proxy profile and endpoint formatter before drawing the blue proxy node or preparing chain-test payloads. Imported `kind`-based HTTP/SOCKS records, bracketed IPv6 proxy hosts, authenticated proxy labels, and sensitive rejected ProxyCommand values therefore stay consistent between the mode cards, node flow, route labels, and connection-chain probe requests.

The config-page forwarding rows now consume shared display metadata for source prefixes, editable port fields, arrow direction, target host/port fields, dynamic SOCKS labels, and create-rule buttons. Local, remote, dynamic SOCKS, mixed-case persisted types, and unsupported rule types therefore render from the same normalized forwarding model that validation, descriptions, delete confirmations, session auto-start, and SSH command preview already use.

The equivalent SSH command card now renders from shared preview metadata: command text, copy text, button label/title, disabled state, copy status tone, and RELAY warning-line count are derived beside the command builder. Empty commands no longer try to copy, while commands containing RELAY-managed password warnings are visually distinguished without duplicating status parsing in the config page.

The command palette chrome now renders from shared display metadata for its input placeholder, escape key label, empty-results copy, and footer shortcut hints. The same helper formats `⌘C` / `⌘F` on Apple platforms and `Ctrl+C` / `Ctrl+F` elsewhere, keeping the design-required keyboard guidance testable instead of hard-coded inside the palette component.

The host list now has a shared empty-state display model for the all-hosts-empty case and the current-group-empty case. Empty workspaces offer “新增主机” and SSH config import directly in the grid area, while empty filtered groups offer “新增主机” and “查看全部主机”, keeping the design-required host-list workflow visible instead of leaving the card grid blank.

The host-list toolbar and host-card action chrome now use shared display metadata for the add-host action, refresh/probing state, edit/config/delete tooltips, and connect button label. The host list keeps its existing create, probe, edit, delete, SFTP, and session handlers while the design-required action copy is covered by focused unit tests.

The manual host create/edit dialog now renders from shared form display metadata for its mode title, field labels, placeholders, full-width `IdentityFile` row, validation message visibility, and action button text. Manual host validation and persistence still live in the host profile store, while the host-list UI no longer duplicates form copy and layout decisions inline.

The host-list sidebar SSH config import card now renders from shared dropzone display metadata for its prompt text, `~/.ssh/config` path label, title, status text, and status tone. Click, drag-and-drop import, desktop default-config import, and manual file selection keep the same behavior while the design-required sidebar import guidance is covered by unit tests.

The host-list top bar now renders from shared display metadata for the RELAY brand label, quick-connect search placeholder, palette shortcut, config import/export labels, sync status visibility/tone, and SSH agent badge visibility/tone/title. Existing sync export/import and agent probing behavior stays unchanged while the design-required top-bar copy is covered outside the large page component.

The host-list sidebar section labels and tool navigation entries now render from shared display metadata. The local terminal, command snippets with the current shortcut hint, credential vault, and theme/appearance tools keep the same routing behavior while the design-required sidebar tool list is test-covered outside `App.jsx`.

Shared page-shell chrome now provides the common back action label used by Theme, Snippets, Vault, and Config pages. Those pages keep the same routing behavior while the shared shell copy is covered outside the large page component.

The session toolbar now renders its back label, host pill text, split toggle, search/snippet/broadcast/monitor/SFTP actions, shortcut labels, and trz/tsz transfer hint from shared display metadata. The existing SSH session, split-pane, search, snippet drawer, broadcast, monitor, and SFTP handlers stay unchanged while the design-required session tab bar copy is covered by focused unit tests.

Command snippets now reuse the same dangerous-command detector as the session input when they are created, edited, loaded, or imported from a config snapshot. Destructive snippets are automatically marked red and still require confirmation before sending. Existing snippets can be edited in place without changing their stable ids, duplicate names are rejected, deletion asks for confirmation with the exact command being removed, and long commands are constrained in the library row while copy/insert still use the complete command.

Dangerous recursive-delete and recursive-permission detection now catches absolute, home-directory, and parent-directory targets anywhere in the `rm -r/-R/--recursive` or `chmod/chown/chgrp -R/--recursive` argument list, including commands such as `rm -rf / --no-preserve-root`, `rm --recursive --force /srv/app`, and `chmod --recursive 777 /var/www`, while still allowing routine relative cleanups such as `rm -rf node_modules` or `chmod -R 755 node_modules`.

System power detection now also catches `systemctl reboot`, `systemctl poweroff`, `systemctl halt`, `systemctl suspend`, and related sleep/shutdown actions in addition to the direct `reboot` / `shutdown` / `poweroff` commands, while service restarts remain categorized separately.

Session snippet insertion now normalizes the inserted command before it reaches the smart input, ignores empty or malformed snippet commands, closes the drawer, and restores focus to the command input so keyboard-first users can press Enter immediately after choosing a snippet.

Session snippet drawer and command-history controls now expose shared display metadata for the empty filtered snippet state and the guarded clear-history button. The session keeps the same snippet insertion and history clearing behavior while the design-required drawer/input chrome is covered outside the page component.

Command snippet create/edit failures now use localized validation messages for missing names, missing commands, duplicate names, missing ids, and stale snippet targets before they reach the snippets page status line.

Command snippet save, copy, delete, and validation feedback now carries an explicit success/error tone instead of inferring severity from localized message text, so Chinese validation errors such as duplicate snippet names render as errors consistently.

Command snippet page feedback now renders through the shared message tone color mapper. Save, update, copy, delete, and validation messages all consume the explicit snippet status object instead of hard-coding success/error colors in the page component.

Command snippet library rows and session drawer buttons now share one display model for normalized name, trimmed command title, tag badge, danger marker, and success/error-neutral tones. The snippets page and in-session drawer no longer duplicate danger badge and border-color decisions.

Command snippet page chrome now also renders from shared display metadata for the page title, create button, section subtitle with the current shortcut, empty-state copy, row action titles/icons, and create/edit form labels. Snippet validation, storage, copy, delete, and dangerous-command detection behavior stays unchanged while the design-required text is covered by focused unit tests.

Snippet persistence and config sync now normalize snippets at list granularity: one malformed imported or stored snippet is skipped without discarding the rest of the user's valid snippet library, blank snippet ids are regenerated from the normalized name and command, duplicate snippet ids or case-insensitive names are collapsed to the first valid entry, and an entirely empty/invalid local store still falls back to the built-in defaults.

Dangerous-command detection also unwraps common `sh` / `bash` / `zsh` / `dash` `-c` command strings, using quote-aware shell segment splitting so wrapped commands with quoted `&&`, `||`, `;`, or newlines are inspected without flagging harmless quoted text in ordinary commands.

trzsz preview transfers now reuse the shared connection-path formatter for their negotiation, progress, and completion text. The terminal progress line labels whether the transfer is direct, proxy-backed, or routed through one or more jump hosts, with the full path available in the route tooltip.

Terminal drag-over guidance for trz uploads now only appears for uploadable file drag payloads. Text/link drags no longer show the amber upload overlay, and the drop path uses the same file-item predicate before calling the trzsz filter.

The terminal trz drag overlay now uses shared display metadata for visibility, icon, target label, and compatibility hint text, keeping the session pane renderer aligned with the rest of the trzsz status copy.

Real-terminal trz drag uploads now surface localized start, missing-file, completion, and error status text instead of leaking bridge-level English messages into the terminal.

The Tauri File System Access polyfill used by trzsz now localizes file-handle and writer errors for wrong file/directory kinds, closed writers, invalid seek/truncate values, unsupported writer operations, and missing truncate support.

The global motion stylesheet now honors `prefers-reduced-motion` across animations, transitions, and smooth scrolling, so pulse, rise, blink, hover lift, progress-width, and theme transitions are suppressed for users who request reduced motion.

The terminal wrapper now reports whether xterm is using the WebGL renderer or a Canvas fallback, and the SSH session, split session, and local PTY headers surface that renderer badge. WebGL remains the preferred path for heavy output, while Linux/WebKitGTK or unavailable-GPU cases are explicitly represented instead of silently swallowing the renderer downgrade.

Terminal renderer badge tooltips now use localized browser-preview, initialization, WebGL-enabled, and Canvas-fallback messages, including common WebGL-disabled reasons from the xterm addon path.

Paused terminal rendering now coalesces adjacent buffered byte or text writes before replaying them to xterm when the window becomes visible again. Hidden sessions still preserve output order, but recovery avoids flooding the renderer with every tiny chunk accumulated while the app was inactive.

The equivalent SSH command preview now applies POSIX shell quoting to ProxyCommand, IdentityFile, target, jump, and forwarding arguments when needed, so copied commands keep working when paths or custom proxy commands contain spaces or quotes. Active forwarding rules in the preview now reuse the shared forwarding normalizer and validator, so lower-case or space-padded rule types and fields render consistently with session auto-start while unsupported or invalid enabled rules are not emitted as broken OpenSSH flags.

Equivalent SSH command comments now localize the authenticated-proxy warning that copied OpenSSH commands omit RELAY-managed proxy passwords. The warning also covers authenticated SOCKS5/HTTP proxy metadata attached to structured jump hosts, so expanded per-hop `ProxyCommand=ssh ...` previews do not silently drop a keychain-backed proxy password without telling the operator.

Equivalent SSH command preview save/copy feedback now uses explicit success/error status objects instead of parsing localized text such as "复制失败" to choose colors, keeping config-page feedback aligned with the command palette and snippet library.

Config-page save status and equivalent-command copy status now render through the shared message tone color mapper. Both surfaces consume the status object's explicit tone instead of hard-coding green/red branches in the page, so future neutral or pending feedback can be displayed consistently without changing the JSX.

Equivalent SSH command preview and command-palette targets now format final IPv6 hosts consistently with bracketed addresses. Quick-connect also accepts unbracketed IPv6 literals when no inline port is supplied, fully compressed literals such as `::`, IPv4-mapped IPv6 literals such as `::ffff:192.0.2.10`, and scoped link-local forms such as `fe80::1%eth0` / `fe80::1%25eth0`; rows show non-default ports, so `ops@[2001:db8::1]:2200` remains visible as the same target that will be copied or connected.

Equivalent SSH command preview and command-palette copy now prefer structured `jumpHosts` when they match the visible chain, rendering `-J user@host:port` for imported `ProxyJump` routes while falling back to current chain labels after local chain edits. The preview now also formats structured jump hosts through the shared profile normalizer, so copied `-J` output stays aligned with runtime auth and route badges.

Equivalent SSH command preview now expands structured jump routes into nested `ProxyCommand=ssh ... -W %h:%p ...` commands when a copied route needs per-hop `IdentityFile`, `StrictHostKeyChecking`, `ConnectTimeout`, `ServerAlive*`, or an outer proxy before the first jump host. Plain jump chains still use compact `-J`, while expanded routes preserve the metadata that OpenSSH cannot attach to individual `-J` hops.

Terminal typography preferences now include a persisted monospace ligature toggle in addition to the 11-18 px font-size slider. The setting is normalized for older appearance records, included in configuration snapshots, reflected in the theme preview and browser preview terminal, and passed into xterm.js when desktop SSH or local PTY terminals are created. Appearance updates and saves now normalize theme, accent, font-size, and ligature values before applying or persisting them, so malformed runtime or imported values cannot leak into the active token set. xterm theme mapping now also fills missing or blank color tokens before terminal creation, so sparse or future theme records still produce a complete xterm palette and derive selection color from the current accent when needed.

The theme and appearance page can reset the full appearance profile back to normalized defaults in one action, restoring the default theme, accent color, terminal font size, and ligature setting before the same persistence/config-sync path saves it.

Theme and appearance controls now use shared display helpers for theme cards, accent swatches, and terminal typography preview labels. Theme selection badges, accent selected borders, ligature CSS, and preview text are derived before React renders the page instead of being rebuilt inline in the component.

Theme and appearance page chrome now also renders from shared display metadata for the page title, config-snapshot sync hint, reset action, and the theme/accent/typography section titles and subtitles. Appearance persistence, reset, theme switching, accent selection, font-size, and ligature behavior stays unchanged while the visible contract is unit tested outside `App.jsx`.

Host card hover actions now also reveal while keyboard focus is inside the card. Hidden card actions are removed from the tab order and pointer-event path, while disabled offline-only actions remain non-focusable even when the action strip is visible.

Vault key usage counts are derived from the current host profiles by matching configured `IdentityFile` values against scanned public/private key paths and key basenames, including structured jump-host `IdentityFile` entries selected by the current visible chain. Stale structured jump-host metadata no longer counts as active key usage after the route is edited; unresolved chain labels can still match known host profiles before usage is calculated.

The desktop vault now returns an empty credential list when `~/.ssh` is missing or contains no valid `.pub` files, leaving preview credentials confined to the browser mock bridge instead of mixing demo entries into the real key scan.

Vault credential scan results now share one display model for per-key badges and the page-level scan summary. Ready, permission-warning, missing-private-key, and unknown states return localized labels, trimmed tooltips, and explicit success/pending/error/neutral tones, so missing private keys surface as an error summary instead of being colored like a successful scan.

Vault credential section chrome and rows now also render from shared display metadata for the section title/subtitle, refresh button, empty state, normalized key name/kind/fingerprint/private-path text, host-usage count and tooltip, and repair/repairing button labels. Public-key scanning and private-key permission repair behavior stays unchanged while the visible contract is unit tested outside `App.jsx`.

The vault now derives manageable system-keychain secret entries from the current host, jump-host, and authenticated proxy configuration, so saved SSH passwords, private-key passphrases, and proxy passwords can be cleared without exposing their secret values. The vault page receives the same full known-host context as session/config/SFTP views, so key, TOTP, and keychain-secret usage can resolve visible chain labels through saved or built-in bastion profiles instead of relying only on raw structured jump-host records.

Vault keychain-secret section chrome and rows now render from shared display metadata for the section title/subtitle, desktop-vs-browser default message, empty state, normalized row label/kind/owner, concrete target, optional `IdentityFile`, and clear/clearing button text. Secret discovery, confirmation prompts, and OS keychain deletion behavior stay unchanged while the visible contract is unit tested outside `App.jsx`.

Vault keychain confirmations and TOTP setup fields now use localized labels for stored password content, issuer/account metadata, and Base32 keys while leaving internal field names unchanged.

Vault browser-preview credentials now use localized key kinds, status badges, messages, and TOTP binding labels while keeping backend status enums stable for storage and tests.

Vault unlock, credential scan/repair, system-keychain, and TOTP feedback now use explicit neutral/success/error status objects instead of parsing localized text such as "失败", "不", or "仅" to decide error coloring.

Resetting the Vault local unlock gate now requires an explicit confirmation that names the local unlock verification record in Chinese and clarifies that system-keychain SSH passwords, private-key passphrases, TOTP secrets, and host/jump/proxy/forwarding configuration are not deleted.

Vault unlock gate chrome now renders from shared display metadata for first-time setup, locked, and unlocked states, including the page title, lock badge, explanatory subtitle, master-password labels/placeholders, confirmation field visibility, submit/reset/lock buttons, and success/pending/neutral action tones. The salted SHA-256 verification record, reset confirmation, and unlock behavior stay unchanged while the visible contract is covered by focused unit tests.

Vault unlock gate failures now use localized messages for weak or missing master passwords, invalid local verification records, invalid random-salt values, and unavailable browser crypto support before they reach the unlock form.

Clearing a Vault keychain secret now requires an explicit confirmation that includes the concrete `user@host:port` target, owner host when different from the row label, optional `IdentityFile`, and a reminder that only the OS keychain secret is deleted while RELAY host/jump/proxy configuration remains.

Saving an entered SSH password, private-key passphrase, or authenticated proxy password to the OS keychain now uses the same explicit confirmation model: the prompt names the concrete `user@host:port` target, includes `IdentityFile` for passphrase storage, and reminds users that RELAY can reuse the secret for terminal, SFTP, forwarding, and jump-host authentication while configuration exports still exclude it.

Connection-time SSH password, private-key passphrase, and proxy-password input prompts now use the same target formatter before any optional keychain save step, so users see the concrete `user@host:port` target and `IdentityFile` context when entering a secret manually.

Shared SSH auth request validation now localizes missing host, missing user, and canceled password/no-`IdentityFile` errors before they reach terminal, SFTP, forwarding, or monitor connection surfaces.

System-keychain save failures for SSH passwords, private-key passphrases, and proxy passwords now reuse that target context as well, so an error alert identifies the affected `user@host:port` and optional `IdentityFile` instead of only showing the backend error text.

Vault TOTP profiles now show the same host-usage count model as SSH keys, matching explicit `totpProfileId` bindings plus issuer/account matches on target and current structured jump hosts selected by the visible chain.

TOTP profile persistence and config sync now normalize metadata at list granularity: malformed imported or stored profiles are skipped, duplicate ids are collapsed to the first valid profile, and TOTP seeds remain excluded from local metadata and exported snapshots. Vault TOTP profiles can be edited in place while preserving their stable ids and host bindings; leaving the Secret field blank keeps the existing system-keychain seed, while entering a new Base32 value rotates the keychain secret.

Vault TOTP Base32 seed submission now has an explicit shared form model: new profiles require a non-empty seed before any metadata/keychain write is attempted, existing profiles may leave the seed blank to keep the current keychain value, and the seed input is rendered as a password field with browser autocomplete disabled.

Vault TOTP section chrome now renders from shared display metadata for the section title/subtitle, default helper text, expand/collapse action, create/edit field labels and placeholders, row action labels, empty state, code placeholder, remaining-time text, and host-usage tooltip. TOTP seed storage, metadata normalization, generation, copy, deletion, and host-usage matching behavior stays unchanged while the visible contract is unit tested outside `App.jsx`.

Vault TOTP create/edit validation now returns localized errors for duplicate profiles, missing edit ids, stale edit targets, missing labels, and invalid profile ids before writing metadata or keychain seeds.

Vault TOTP deletion now uses an explicit confirmation with issuer/account context, current host usage, and a warning that the matching system-keychain TOTP seed will be removed with the local metadata.

When an `IdentityFile` is configured, SSH authentication first tries the local SSH agent (`SSH_AUTH_SOCK`) with the matching `.pub` sidecar or agent comment before falling back to loading the private key file directly, so agent-held keys can sign without exposing private-key material to the app process. The desktop top bar now calls `ssh_agent_status` and reflects whether the agent socket is missing, connected but empty, ready with loaded identities, or failing, with the socket/error detail available in the status tooltip.

The command palette is keyboard-first: `Ctrl/Command+K` opens it globally, including while a form or terminal input is focused; typing filters hosts or creates a `user@host[:port]` quick-connect target, arrow keys/Home/End move the active result, Enter connects, `Ctrl/Command+C` copies the SSH command, and `Ctrl/Command+F` opens SFTP for the selected target. Visible shortcut hints are platform-aware, showing `⌘` on Apple platforms and `Ctrl+` labels on Linux/Windows. Shortcut handling ignores already-consumed events, repeated keydown events, IME composition, and unintended Alt/Shift chords, and it falls back to physical keyboard codes for layout-sensitive chords such as `Ctrl/Command+;`. Palette search is tolerant of sparse imported host records and also indexes the formatted `user@host:port` display string, including bracketed IPv6 targets. Outside SSH sessions, `Ctrl/Command+;` opens the command snippets library from the global shell; inside sessions, the same shortcut is reserved for the snippet drawer, and the drawer reuses snippet category filters before inserting a command into the smart input.

Global shortcut detection now also requires the platform-native modifier: Apple platforms accept Command-only chords, while Linux and Windows accept Ctrl-only chords. Mixed Ctrl+Command states and accidental Windows/Meta-key chords are ignored so palette, SFTP, copy, and snippet shortcuts match the labels shown in the UI.

Tab command completion preserves leading whitespace in the session input: matching still ignores indentation, but the accepted suffix is computed from the trimmed command prefix so `  df` completes to `  df -h` instead of corrupting the command.

Browser-preview session input now plans `trz` and `tsz <file>` transfer demos through a shared parser before appending preview terminal lines. Quoted download names, options, empty `tsz` commands, and invalid preview sizes are covered by focused unit tests, while real desktop SSH sessions still hand typed commands directly to the `trzsz` filter path.

Command history persistence and config sync now trim stored commands, skip non-string or oversized records, and collapse exact duplicates before saving or using history as Tab-completion candidates, keeping the most recent valid command order stable. Session input exposes a guarded clear-history action with an explicit scope warning: clearing history removes only RELAY's local command history and Tab-completion source, then persists/exports an empty history without touching remote shell history, snippets, or host configuration.

Command-palette connect and SFTP actions now share the same offline guards as host cards. Offline results stay visible for search and SSH command copy, but Enter/click connect and `Ctrl/Command+F` show explicit blocked-action messages instead of failing silently.

Command-palette feedback and selected-row action hints now carry explicit success/error/neutral tones for copied commands and blocked offline actions, so localized messages such as "离线主机不可连接" render as errors without relying on fragile text matching.

Command-palette feedback and selected-row hints now render through the shared message tone color mapper. The palette consumes the explicit status objects from its action guards and copy feedback instead of hard-coding success/error color branches in the overlay component.

The sidebar includes a local terminal entry that opens the Tauri `pty_open` backend in desktop builds, wiring the system shell to xterm.js with input, resize, and shared 16 ms / 64 KiB binary frame aggregation for output forwarding; the browser preview shows a static PTY preview.

Split terminal sessions now keep an explicit active pane when broadcast mode is off. Clicking, focusing, or dropping a file on a pane makes that pane the command target, the input prompt labels whether commands will go to the primary or split session, and broadcast mode still overrides the active-pane target by sending to both panes.

## Run

```bash
npm install
npm run dev
```

Desktop development:

```bash
source "$HOME/.cargo/env"
npm run tauri:dev
```

## Test

```bash
npm test
source "$HOME/.cargo/env" && cargo check --manifest-path src-tauri/Cargo.toml
npm audit
```

## Build

```bash
source "$HOME/.cargo/env"
npm run tauri:build
```

Current Linux artifacts are generated at:

- `src-tauri/target/release/relay`
- `src-tauri/target/release/bundle/deb/RELAY_0.1.0_amd64.deb`
- `src-tauri/target/release/bundle/rpm/RELAY-0.1.0-1.x86_64.rpm`
- `src-tauri/target/release/bundle/appimage/RELAY_0.1.0_amd64.AppImage`

Release automation is available in `.github/workflows/release.yml`. It runs on `v*` tags or manual dispatch, verifies frontend/Rust tests on Linux, macOS, and Windows, builds the Tauri bundle on each platform, and uploads Linux AppImage/deb/rpm, macOS dmg/app, and Windows msi/nsis artifacts.

## Verified

- `npm test`: 44 test files, 365 tests passed.
- `cargo test`: 93 Rust unit tests passed.
- `npm run build`: Vite production build passed.
- `cargo check`: Rust backend passed.
- `npm audit`: 0 vulnerabilities.
- `npm run tauri:build`: Linux executable, deb, rpm, and AppImage generated.
