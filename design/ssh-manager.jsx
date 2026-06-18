import { useState, useEffect, useRef, useMemo } from "react";

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
  mono: "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  sans: "-apple-system, 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
};

/* 动态样式(随主题取值) */
const kbdStyle = () => ({ fontFamily: "inherit", fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.line}`, color: T.dim, background: T.panelHi });
const ghostBtn = () => ({ background: "transparent", border: `1px solid ${T.line}`, borderRadius: 8, color: T.dim, fontSize: 12, cursor: "pointer", fontFamily: T.sans });
const fieldStyle = () => ({ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", width: "100%", boxSizing: "border-box" });
const miniBtn = () => ({ width: 18, height: 18, borderRadius: 99, border: `1px solid ${T.line}`, background: T.panelHi, color: T.dim, fontSize: 11, lineHeight: "16px", cursor: "pointer", padding: 0 });
const lbl = () => ({ display: "block", fontSize: 11, color: T.faint, marginBottom: 6 });

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
  { name: "bastion-sh", desc: "上海堡垒机 · 2FA", type: "堡垒机" },
  { name: "bastion-bj", desc: "北京堡垒机 · 2FA", type: "堡垒机" },
  { name: "relay-db", desc: "数据库网段中继", type: "中继" },
  { name: "relay-hk", desc: "香港出口中继", type: "中继" },
];

const GROUPS = ["全部主机", "生产环境", "预发布", "算力集群", "运维"];

const SNIPPETS = [
  { name: "磁盘占用", cmd: "df -h", tag: "巡检" },
  { name: "内存概况", cmd: "free -m", tag: "巡检" },
  { name: "端口监听", cmd: "ss -tlnp", tag: "网络" },
  { name: "重启 Nginx", cmd: "sudo systemctl restart nginx", tag: "服务", danger: true },
  { name: "实时系统日志", cmd: "tail -f /var/log/syslog", tag: "日志" },
  { name: "容器列表", cmd: "docker ps -a", tag: "容器" },
];

const COMPLETIONS = { "do": "cker ps -a", "df": " -h", "ta": "il -f /var/log/nginx/access.log", "sy": "stemctl status nginx", "fr": "ee -m" };

const VAULT = [
  { name: "id_ed25519_work", type: "ED25519 密钥", fp: "SHA256:kF3x…9Qa", used: 5 },
  { name: "id_rsa_legacy", type: "RSA 4096 密钥", fp: "SHA256:m2Lp…X7c", used: 1 },
  { name: "prod-2fa", type: "TOTP 动态口令", fp: "绑定 bastion-sh", used: 5 },
];

const TERM_LINES = [
  { t: "$", c: "ssh deploy@prod-web-01  # 经由 bastion-sh", d: 0 },
  { t: ">", c: "已建立加密通道 · ed25519 · chacha20-poly1305", d: 600 },
  { t: ">", c: "指纹 SHA256:kF3x…9Qa 与已知主机一致 ✓", d: 1100 },
  { t: "#", c: "Welcome to Ubuntu 24.04 LTS · 负载 0.42 · 内存 31%", d: 1700 },
  { t: "$", c: "tail -f /var/log/nginx/access.log", d: 2600 },
  { t: " ", c: '203.0.113.7 - "GET /api/v2/orders HTTP/2" 200 1.2ms', d: 3300 },
  { t: " ", c: '198.51.100.23 - "POST /api/v2/pay HTTP/2" 201 8.4ms', d: 3900 },
];

/* ================= 基础组件 ================= */
function Spark({ data, color, w = 64, h = 18 }) {
  if (!data.length) return <span style={{ color: T.faint, fontSize: 11 }}>—</span>;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

function Pulse({ status }) {
  const c = status === "online" ? T.green : status === "busy" ? T.amber : T.faint;
  return (
    <span style={{ position: "relative", width: 8, height: 8, display: "inline-block", flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: c }} />
      {status !== "offline" && <span style={{ position: "absolute", inset: -3, borderRadius: 99, border: `1px solid ${c}`, opacity: 0.5, animation: "pulse 2s ease-out infinite" }} />}
    </span>
  );
}

function Chain({ chain, name, compact }) {
  const hops = [...chain, name];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono }}>本机</span>
      {hops.map((h, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={T.line} strokeWidth="1" strokeDasharray="2 3" /></svg>
          <span style={{
            fontSize: 10, fontFamily: T.mono, padding: "2px 7px", borderRadius: 99,
            border: `1px solid ${i === hops.length - 1 ? T.amber : T.line}`,
            color: i === hops.length - 1 ? T.amber : T.dim,
            background: i === hops.length - 1 ? T.amberSoft : "transparent",
          }}>{h}</span>
        </span>
      ))}
      {!compact && chain.length > 0 && <span style={{ fontSize: 10, color: T.faint }}>· {chain.length} 跳</span>}
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
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 24px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={onBack} style={{ ...ghostBtn(), padding: "5px 12px" }}>← 返回</button>
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
function Palette({ onClose, onConnect }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), []);
  const results = useMemo(() => {
    const s = q.toLowerCase();
    return HOSTS.filter(h => !s || h.name.includes(s) || h.host.includes(s) || h.tags.some(t => t.includes(s))).slice(0, 5);
  }, [q]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,7,10,0.6)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "center", paddingTop: "14vh", zIndex: 50, animation: "fadeIn .15s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "fit-content", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${T.line}` }}>
          <span style={{ color: T.amber, fontFamily: T.mono, fontSize: 14 }}>›_</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="输入主机名、IP 或标签,回车直接连接…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.text, fontSize: 15, fontFamily: T.sans }}
            onKeyDown={e => { if (e.key === "Enter" && results[0]) { onConnect(results[0]); } if (e.key === "Escape") onClose(); }}
          />
          <kbd style={kbdStyle()}>esc</kbd>
        </div>
        <div style={{ padding: 6 }}>
          {results.map((h, i) => (
            <button key={h.id} onClick={() => onConnect(h)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
              padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              background: i === 0 ? T.panelHi : "transparent", color: T.text, fontFamily: T.sans,
            }}>
              <Pulse status={h.status} />
              <span style={{ fontFamily: T.mono, fontSize: 13 }}>{h.name}</span>
              <span style={{ fontSize: 12, color: T.faint, fontFamily: T.mono }}>{h.user}@{h.host}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: T.dim }}>{i === 0 ? "↵ 连接" : ""}</span>
            </button>
          ))}
          {!results.length && <div style={{ padding: 20, textAlign: "center", color: T.faint, fontSize: 13 }}>没有匹配的主机 — 输入 user@host 可直接发起新连接</div>}
        </div>
        <div style={{ display: "flex", gap: 14, padding: "10px 18px", borderTop: `1px solid ${T.line}`, fontSize: 11, color: T.faint }}>
          <span><kbd style={kbdStyle()}>↵</kbd> 连接</span>
          <span><kbd style={kbdStyle()}>⌘C</kbd> 复制 ssh 命令</span>
          <span><kbd style={kbdStyle()}>⌘F</kbd> SFTP 打开</span>
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

function ThemeView({ onBack, themeName, setTheme, rerender }) {
  const ACCENTS = ["#E8A33D", "#4CC38A", "#5B9DD9", "#C586D9", "#E5534B"];
  return (
    <PageShell title="主题与外观" onBack={onBack}
      action={<span style={{ marginLeft: "auto", fontSize: 11, fontFamily: T.mono, color: T.green }}>⟳ 配置已同步到云端</span>}>

      <SectionCard title="主题方案" sub="点击即时生效,跟随配置同步到所有设备。终端配色与界面联动。">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {Object.entries(THEMES).map(([name, th]) => {
            const on = themeName === name;
            return (
              <button key={name} onClick={() => setTheme(name)} style={{
                textAlign: "left", padding: 10, borderRadius: 14, cursor: "pointer", fontFamily: T.sans,
                border: `2px solid ${on ? T.amber : T.line}`, background: T.panelHi, transition: "border-color .15s",
              }}>
                <ThemePreview th={th} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "0 2px" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{name}</span>
                  {on && <span style={{ fontSize: 10, color: T.amber, fontFamily: T.mono }}>● 使用中</span>}
                </div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 3, padding: "0 2px" }}>{th.desc}</div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="强调色" sub="独立于主题方案,影响按钮、链路终点与光标。">
        <div style={{ display: "flex", gap: 12 }}>
          {ACCENTS.map(c => (
            <button key={c} onClick={() => { T.amber = c; T.amberSoft = c + "22"; rerender(); }} style={{
              width: 34, height: 34, borderRadius: 99, background: c, cursor: "pointer",
              border: T.amber === c ? `3px solid ${T.text}` : `3px solid transparent`, outline: `1px solid ${T.line}`,
            }} title={c} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="终端排版" sub="字号与字体即时预览,等宽字体支持连字。">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={lbl()}>终端字号 · {T.termSize}px</label>
            <input type="range" min="11" max="18" value={T.termSize} onChange={e => { T.termSize = +e.target.value; rerender(); }} style={{ width: "100%", accentColor: T.amber }} />
          </div>
          <div style={{ flex: 2, minWidth: 260, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 16px", fontFamily: T.mono, fontSize: T.termSize, color: T.text }}>
            <span style={{ color: T.amber }}>❯</span> echo "字号实时预览 => != 0x2A"
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}

/* ================= 命令片段库 ================= */
function SnippetsView({ onBack }) {
  return (
    <PageShell title="命令片段" onBack={onBack}
      action={<button style={{ marginLeft: "auto", background: T.amber, border: "none", borderRadius: 8, padding: "7px 16px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>＋ 新建片段</button>}>
      <SectionCard title="片段库" sub="一次保存,所有会话可用。会话内通过 ⌘; 或片段抽屉快速插入;危险命令执行前需确认。">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SNIPPETS.map(s => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: T.panelHi }}>
              <span style={{ fontSize: 10, fontFamily: T.mono, padding: "3px 8px", borderRadius: 99, border: `1px solid ${s.danger ? T.red : T.line}`, color: s.danger ? T.red : T.dim }}>{s.danger ? "⚠ " : ""}{s.tag}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
              <code style={{ fontFamily: T.mono, fontSize: 12, color: T.dim, marginLeft: "auto" }}>{s.cmd}</code>
              <button style={{ ...ghostBtn(), padding: "4px 10px" }}>⧉</button>
            </div>
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}

/* ================= 凭据保险库 ================= */
function VaultView({ onBack }) {
  return (
    <PageShell title="凭据保险库" onBack={onBack}
      action={<span style={{ marginLeft: "auto", fontSize: 11, fontFamily: T.mono, color: T.green }}>🔒 本地加密 · 主密码已解锁</span>}>
      <SectionCard title="密钥与口令" sub="私钥永不出库:签名在本地代理完成,跳板与目标只见到公钥。支持 TOTP 自动填充。">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {VAULT.map(v => (
            <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: T.panelHi }}>
              <span style={{ fontFamily: T.mono, fontSize: 13 }}>{v.name}</span>
              <span style={{ fontSize: 11, color: T.faint }}>{v.type}</span>
              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.mono, marginLeft: "auto" }}>{v.fp}</span>
              <span style={{ fontSize: 10, color: T.faint }}>{v.used} 台主机使用</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}

/* ================= 连接配置(链路/代理/转发) ================= */
function ConfigView({ host, onBack }) {
  const [chain, setChain] = useState(host.chain.slice());
  const [showAdd, setShowAdd] = useState(false);
  const [proxy, setProxy] = useState({ type: "none", host: "127.0.0.1", port: "1080", auth: false, cmd: "connect -S %h:%p" });
  const [forwards, setForwards] = useState([
    { id: 1, type: "L", lport: "5432", rhost: "10.2.2.5", rport: "5432", on: true },
    { id: 2, type: "D", lport: "1086", rhost: "", rport: "", on: false },
  ]);
  const [testStep, setTestStep] = useState(-2);
  const [testLat, setTestLat] = useState([]);

  const nodes = useMemo(() => {
    const n = [{ kind: "local", label: "本机" }];
    if (proxy.type !== "none") n.push({ kind: "proxy", label: proxy.type === "cmd" ? "ProxyCommand" : `${proxy.type.toUpperCase()} 代理`, sub: proxy.type === "cmd" ? proxy.cmd : `${proxy.host}:${proxy.port}` });
    chain.forEach((c, i) => {
      const b = BASTIONS.find(x => x.name === c);
      n.push({ kind: "hop", label: c, sub: b ? b.type : "跳板", idx: i });
    });
    n.push({ kind: "target", label: host.name, sub: `${host.user}@${host.host}` });
    return n;
  }, [chain, proxy, host]);

  const runTest = () => {
    setTestLat([]); setTestStep(-1);
    let step = 0;
    const total = nodes.length - 1;
    const tick = () => {
      setTestStep(step);
      setTestLat(p => [...p, 8 + Math.floor(Math.random() * 28)]);
      step += 1;
      if (step <= total) setTimeout(tick, 550);
    };
    setTimeout(tick, 350);
  };

  const move = (i, dir) => {
    const c = chain.slice(); const j = i + dir;
    if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]];
    setChain(c); setTestStep(-2);
  };

  const sshPreview = useMemo(() => {
    const parts = ["ssh"];
    if (proxy.type === "socks5") parts.push(`-o ProxyCommand='nc -X 5 -x ${proxy.host}:${proxy.port} %h %p'`);
    if (proxy.type === "http") parts.push(`-o ProxyCommand='nc -X connect -x ${proxy.host}:${proxy.port} %h %p'`);
    if (proxy.type === "cmd") parts.push(`-o ProxyCommand='${proxy.cmd}'`);
    if (chain.length) parts.push(`-J ${chain.join(",")}`);
    forwards.filter(f => f.on).forEach(f => {
      if (f.type === "L") parts.push(`-L ${f.lport}:${f.rhost}:${f.rport}`);
      if (f.type === "R") parts.push(`-R ${f.rport}:localhost:${f.lport}`);
      if (f.type === "D") parts.push(`-D ${f.lport}`);
    });
    parts.push(`${host.user}@${host.host}`);
    return parts.join(" \\\n    ");
  }, [chain, proxy, forwards, host]);

  const proxyOpts = [
    { v: "none", l: "直连", d: "不经过代理" },
    { v: "socks5", l: "SOCKS5", d: "适合科学出口 / 内网穿透" },
    { v: "http", l: "HTTP CONNECT", d: "企业网关常见" },
    { v: "cmd", l: "ProxyCommand", d: "完全自定义命令" },
  ];
  const fwdMeta = { L: { name: "本地转发", c: T.green }, R: { name: "远程转发", c: T.blue }, D: { name: "动态 SOCKS", c: T.amber } };

  return (
    <PageShell title="连接配置" accentWord={host.name} onBack={onBack}
      action={<button style={{ marginLeft: "auto", background: T.amber, border: "none", borderRadius: 8, padding: "7px 18px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>保存</button>}>

      <SectionCard title="连接链路编排" sub="从本机到目标的完整路径。可视化拼装代理、堡垒机与中继,顺序即连接顺序。">
        <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap", rowGap: 18 }}>
          {nodes.map((n, i) => {
            const lit = testStep >= i;
            const isLast = i === nodes.length - 1;
            const border = n.kind === "target" ? T.amber : n.kind === "proxy" ? T.blue : lit && testStep > -2 ? T.green : T.line;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{
                  position: "relative", minWidth: n.kind === "local" ? 64 : 116, padding: "10px 12px",
                  border: `1px solid ${border}`, borderRadius: 12, textAlign: "center",
                  background: n.kind === "target" ? T.amberSoft : n.kind === "proxy" ? T.blueSoft : T.panelHi,
                  transition: "border-color .3s",
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 12, color: n.kind === "target" ? T.amber : n.kind === "proxy" ? T.blue : T.text }}>{n.label}</div>
                  {n.sub && <div style={{ fontSize: 10, color: T.faint, marginTop: 3, fontFamily: T.mono }}>{n.sub}</div>}
                  {n.kind === "hop" && (
                    <div style={{ position: "absolute", top: -10, right: -6, display: "flex", gap: 3 }}>
                      <button onClick={() => move(n.idx, -1)} title="左移" style={miniBtn()}>‹</button>
                      <button onClick={() => move(n.idx, 1)} title="右移" style={miniBtn()}>›</button>
                      <button onClick={() => { setChain(chain.filter((_, x) => x !== n.idx)); setTestStep(-2); }} title="移除" style={{ ...miniBtn(), color: T.red }}>×</button>
                    </div>
                  )}
                </div>
                {!isLast && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 44 }}>
                    <svg width="44" height="10">
                      <line x1="2" y1="5" x2="42" y2="5" stroke={testStep > i ? T.green : T.line} strokeWidth="1.5" strokeDasharray={testStep > i ? "0" : "3 4"} style={{ transition: "stroke .3s" }} />
                      <polygon points="42,5 36,2 36,8" fill={testStep > i ? T.green : T.line} />
                    </svg>
                    {testLat[i] != null && <span style={{ fontSize: 9, fontFamily: T.mono, color: T.green }}>{testLat[i]}ms</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center", position: "relative" }}>
          <button onClick={() => setShowAdd(s => !s)} style={{ ...ghostBtn(), padding: "6px 14px", color: T.amber, borderColor: T.amber }}>＋ 插入跳板 / 中继</button>
          <button onClick={runTest} style={{ ...ghostBtn(), padding: "6px 14px" }}>⚡ 测试链路</button>
          {testStep >= nodes.length - 1 && <span style={{ fontSize: 12, color: T.green, fontFamily: T.mono }}>✓ 全链路可达 · 共 {testLat.reduce((a, b) => a + b, 0)}ms</span>}
          {showAdd && (
            <div style={{ position: "absolute", top: 40, left: 0, zIndex: 10, background: T.panelHi, border: `1px solid ${T.line}`, borderRadius: 12, padding: 6, width: 280, boxShadow: "0 16px 48px rgba(0,0,0,0.4)" }}>
              {BASTIONS.map(b => (
                <button key={b.name} disabled={chain.includes(b.name)}
                  onClick={() => { setChain([...chain, b.name]); setShowAdd(false); setTestStep(-2); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: chain.includes(b.name) ? "not-allowed" : "pointer", opacity: chain.includes(b.name) ? 0.4 : 1, textAlign: "left" }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, padding: "2px 7px", borderRadius: 99, border: `1px solid ${T.line}`, color: b.type === "堡垒机" ? T.amber : T.blue }}>{b.type}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text }}>{b.name}</span>
                  <span style={{ fontSize: 11, color: T.faint, marginLeft: "auto" }}>{b.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="出口代理" sub="第一跳之前经过的代理。链路图中会以蓝色节点显示。">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
          {proxyOpts.map(o => {
            const on = proxy.type === o.v;
            return (
              <button key={o.v} onClick={() => setProxy({ ...proxy, type: o.v })} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: "pointer", fontFamily: T.sans,
                border: `1px solid ${on ? T.blue : T.line}`, background: on ? T.blueSoft : T.panelHi,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: on ? T.blue : T.text }}>{o.l}</div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{o.d}</div>
              </button>
            );
          })}
        </div>
        {(proxy.type === "socks5" || proxy.type === "http") && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label style={lbl()}>代理地址</label>
              <input style={fieldStyle()} value={proxy.host} onChange={e => setProxy({ ...proxy, host: e.target.value })} />
            </div>
            <div style={{ width: 100 }}>
              <label style={lbl()}>端口</label>
              <input style={fieldStyle()} value={proxy.port} onChange={e => setProxy({ ...proxy, port: e.target.value })} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.dim, marginTop: 18, cursor: "pointer" }}>
              <input type="checkbox" checked={proxy.auth} onChange={e => setProxy({ ...proxy, auth: e.target.checked })} style={{ accentColor: T.amber }} />
              需要用户名密码认证
            </label>
          </div>
        )}
        {proxy.type === "cmd" && (
          <div>
            <label style={lbl()}>自定义命令(%h %p 为目标占位符)</label>
            <input style={fieldStyle()} value={proxy.cmd} onChange={e => setProxy({ ...proxy, cmd: e.target.value })} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="端口转发与隧道" sub="本地转发 -L · 远程转发 -R · 动态 SOCKS -D。可随会话自动建立。">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {forwards.map(f => {
            const m = fwdMeta[f.type];
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: T.panelHi, opacity: f.on ? 1 : 0.55 }}>
                <span style={{ fontSize: 10, fontFamily: T.mono, padding: "3px 8px", borderRadius: 99, border: `1px solid ${m.c}`, color: m.c, flexShrink: 0 }}>-{f.type} {m.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: T.mono, fontSize: 12, flex: 1, flexWrap: "wrap" }}>
                  <span style={{ color: T.text }}>localhost:{f.lport}</span>
                  <svg width="34" height="10"><line x1="2" y1="5" x2="30" y2="5" stroke={m.c} strokeWidth="1.2" /><polygon points={f.type === "R" ? "2,5 8,2 8,8" : "32,5 26,2 26,8"} fill={m.c} /></svg>
                  <span style={{ color: T.dim }}>{f.type === "D" ? "任意目标(SOCKS5)" : `${f.rhost}:${f.rport}`}</span>
                  {f.on && <span style={{ fontSize: 10, color: T.green }}>● 活跃</span>}
                </div>
                <button onClick={() => setForwards(forwards.map(x => x.id === f.id ? { ...x, on: !x.on } : x))} style={{ ...ghostBtn(), padding: "4px 12px", color: f.on ? T.green : T.faint }}>{f.on ? "已启用" : "已停用"}</button>
                <button onClick={() => setForwards(forwards.filter(x => x.id !== f.id))} style={{ ...ghostBtn(), padding: "4px 10px", color: T.red }}>×</button>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8 }}>
            {["L", "R", "D"].map(t => (
              <button key={t} onClick={() => setForwards([...forwards, { id: Date.now() + Math.random(), type: t, lport: "8080", rhost: "127.0.0.1", rport: "80", on: false }])}
                style={{ ...ghostBtn(), padding: "6px 14px" }}>＋ {fwdMeta[t].name}</button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="等效 SSH 命令" sub="所有配置实时编译为标准 OpenSSH 命令,可直接复制到任何终端使用。">
        <pre style={{ margin: 0, padding: 16, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, fontFamily: T.mono, fontSize: 12, lineHeight: 1.8, color: T.green, overflowX: "auto", whiteSpace: "pre-wrap" }}>{sshPreview}</pre>
        <button style={{ ...ghostBtn(), padding: "6px 14px", marginTop: 12 }}>⧉ 复制命令</button>
      </SectionCard>
    </PageShell>
  );
}

/* ================= 监控面板(FinalShell 式) ================= */
function Meter({ label, value, color, suffix = "%" }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
        <span style={{ color: T.dim }}>{label}</span>
        <span style={{ fontFamily: T.mono, color }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: T.line, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width .8s ease" }} />
      </div>
    </div>
  );
}

function MonitorPanel() {
  const [cpu, setCpu] = useState([32, 35, 30, 38, 34]);
  const [net, setNet] = useState([4, 6, 5, 8, 7]);
  const [mem] = useState(31);
  useEffect(() => {
    const t = setInterval(() => {
      setCpu(p => [...p.slice(-19), 25 + Math.floor(Math.random() * 30)]);
      setNet(p => [...p.slice(-19), 3 + Math.floor(Math.random() * 12)]);
    }, 1200);
    return () => clearInterval(t);
  }, []);
  const c = cpu.at(-1), n = net.at(-1);
  return (
    <div style={{ width: 210, flexShrink: 0, borderLeft: `1px solid ${T.line}`, padding: 16, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
      <div style={{ fontSize: 10, color: T.faint, letterSpacing: 2 }}>实时监控</div>
      <Meter label="CPU" value={c} color={c > 70 ? T.red : T.green} />
      <Meter label="内存" value={mem} color={T.blue} />
      <Meter label="磁盘 /" value={58} color={T.amber} />
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
          <span style={{ color: T.dim }}>网络</span>
          <span style={{ fontFamily: T.mono, color: T.green }}>↓{n} MB/s</span>
        </div>
        <Spark data={net} color={T.green} w={176} h={32} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: T.dim, marginBottom: 6 }}>CPU 趋势</div>
        <Spark data={cpu} color={T.amber} w={176} h={32} />
      </div>
      <div style={{ marginTop: "auto", fontSize: 10, color: T.faint, lineHeight: 1.8, fontFamily: T.mono }}>
        负载 0.42 · 进程 183<br />运行 47 天 · Ubuntu 24.04
      </div>
    </div>
  );
}

/* ================= 会话视图 ================= */
function Session({ host, onBack, onSftp }) {
  const [lines, setLines] = useState([]);
  const [broadcast, setBroadcast] = useState(false);
  const [showSnip, setShowSnip] = useState(false);
  const [showMon, setShowMon] = useState(true);
  const [input, setInput] = useState("");
  const [trz, setTrz] = useState(null);   // 活跃的 trzsz 传输 {name,size,dir,progress}
  const [drag, setDrag] = useState(false);
  const termRef = useRef(null);

  useEffect(() => {
    const timers = TERM_LINES.map(l => setTimeout(() => setLines(p => [...p, l]), l.d));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => { termRef.current?.scrollTo(0, 1e9); }, [lines, trz]);

  /* trzsz 进度推进 */
  useEffect(() => {
    if (!trz) return;
    const t = setInterval(() => {
      setTrz(p => {
        if (!p) return p;
        const np = Math.min(p.progress + 5 + Math.random() * 12, 100);
        if (np >= 100) {
          setLines(ls => [...ls, { t: ">", c: `${p.dir === "up" ? "上传" : "下载"}完成:${p.name}(${fmtSize(p.size)})— trzsz 校验通过 ✓` }]);
          return null;
        }
        return { ...p, progress: np };
      });
    }, 300);
    return () => clearInterval(t);
  }, [trz ? trz.name : null]);

  const startTrz = (name, size, dir) => {
    setLines(ls => [...ls, { t: "$", c: dir === "up" ? "trz" : `tsz ${name}` },
      { t: ">", c: `trzsz 协商成功 · 二进制模式 · 压缩传输${host.chain.length ? " · 经 " + host.chain.join(" → ") : ""}` }]);
    setTrz({ name, size, dir, progress: 0 });
  };

  const onDrop = e => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    startTrz(f ? f.name : "app-v2.4.tar.gz", f ? f.size || 18874368 : 18874368, "up");
  };

  const runCommand = () => {
    const cmd = input.trim();
    if (!cmd) return;
    if (cmd === "trz" || cmd.startsWith("trz ")) { setInput(""); startTrz("dist.tar.gz", 12 * 1024 * 1024, "up"); return; }
    if (cmd.startsWith("tsz ")) { setInput(""); startTrz(cmd.slice(4).trim() || "access.log", 240 * 1024 * 1024, "down"); return; }
    setLines(ls => [...ls, { t: "$", c: cmd }]); setInput("");
  };

  const comp = useMemo(() => {
    const k = Object.keys(COMPLETIONS).find(k => input && input.toLowerCase().startsWith(k) && input.length <= k.length + 1);
    return k ? COMPLETIONS[k] : "";
  }, [input]);

  const barW = 26;
  const filled = trz ? Math.round(trz.progress / 100 * barW) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ ...ghostBtn(), padding: "4px 10px" }}>← 主机列表</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 8, background: T.panelHi, border: `1px solid ${T.line}` }}>
          <Pulse status="online" />
          <span style={{ fontFamily: T.mono, fontSize: 12 }}>{host.name}</span>
          <span style={{ fontSize: 11, color: T.green, fontFamily: T.mono }}>23ms</span>
        </div>
        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.green, border: `1px solid ${T.line}`, borderRadius: 99, padding: "3px 9px" }}>trz/tsz 就绪</span>
        <button style={{ ...ghostBtn(), padding: "5px 10px" }}>＋ 拆分</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowSnip(s => !s)} style={{ ...ghostBtn(), padding: "5px 12px", color: showSnip ? T.amber : T.dim, borderColor: showSnip ? T.amber : T.line }}>⌘; 片段</button>
          <button onClick={() => setBroadcast(b => !b)} style={{ ...ghostBtn(), padding: "5px 12px", color: broadcast ? T.amber : T.dim, borderColor: broadcast ? T.amber : T.line }}>⌁ 广播 {broadcast ? "开" : "关"}</button>
          <button onClick={() => setShowMon(m => !m)} style={{ ...ghostBtn(), padding: "5px 12px", color: showMon ? T.green : T.dim }}>📈 监控</button>
          <button onClick={onSftp} style={{ ...ghostBtn(), padding: "5px 12px" }}>⇅ SFTP</button>
        </div>
      </div>

      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Chain chain={host.chain} name={host.name} compact />
        <span style={{ fontSize: 11, color: T.faint, fontFamily: T.mono }}>拖文件到终端 = trz 上传 · 输入 tsz 文件名 = 下载</span>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div ref={termRef}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          style={{ flex: 1, position: "relative", padding: "18px 22px", fontFamily: T.mono, fontSize: T.termSize, lineHeight: 1.9, overflowY: "auto", background: T.bg }}>
          {lines.map((l, i) => (
            <div key={i} style={{ animation: "rise .25s ease both" }}>
              <span style={{ color: l.t === "$" ? T.amber : l.t === ">" ? T.blue : T.faint, marginRight: 10 }}>{l.t}</span>
              <span style={{ color: l.t === ">" ? T.dim : T.text }}>{l.c}</span>
            </div>
          ))}
          {trz && (
            <div style={{ color: T.text }}>
              <span style={{ color: trz.dir === "up" ? T.amber : T.blue }}>{trz.dir === "up" ? "⇡" : "⇣"}</span>{" "}
              {trz.name} [<span style={{ color: T.green }}>{"█".repeat(filled)}</span>{"░".repeat(barW - filled)}]{" "}
              <span style={{ color: T.green }}>{Math.floor(trz.progress)}%</span>{" "}
              <span style={{ color: T.dim }}>{fmtSize(trz.size * trz.progress / 100)} / {fmtSize(trz.size)} · {(4 + Math.random() * 3).toFixed(1)}MB/s</span>
            </div>
          )}
          {!trz && <span style={{ display: "inline-block", width: 8, height: 16, background: T.amber, verticalAlign: "middle", animation: "blink 1.1s step-end infinite" }} />}
          {drag && (
            <div style={{ position: "sticky", inset: 0, top: 0, height: "100%", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", background: T.amberSoft, border: `2px dashed ${T.amber}`, borderRadius: 14, pointerEvents: "none" }}>
              <div style={{ textAlign: "center", fontFamily: T.sans }}>
                <div style={{ fontSize: 26 }}>⇡</div>
                <div style={{ fontSize: 14, color: T.amber, fontWeight: 600, marginTop: 6 }}>释放文件,经 trz 上传到当前目录</div>
                <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>兼容 tmux · 支持目录与断点续传</div>
              </div>
            </div>
          )}
        </div>
        {showMon && <MonitorPanel />}
      </div>

      {showSnip && (
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderTop: `1px solid ${T.line}`, overflowX: "auto", animation: "rise .2s ease" }}>
          {SNIPPETS.map(s => (
            <button key={s.name} onClick={() => { setInput(s.cmd); setShowSnip(false); }}
              style={{ ...ghostBtn(), padding: "6px 12px", whiteSpace: "nowrap", color: s.danger ? T.red : T.dim, borderColor: s.danger ? T.red : T.line }}>
              {s.danger ? "⚠ " : ""}{s.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: 14, borderTop: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.panelHi, border: `1px solid ${broadcast ? T.amber : T.line}`, borderRadius: 10, padding: "10px 14px" }}>
          <span style={{ color: broadcast ? T.amber : T.faint, fontFamily: T.mono, fontSize: 12 }}>{broadcast ? "⌁ 全部" : "❯"}</span>
          <div style={{ flex: 1, position: "relative", fontFamily: T.mono, fontSize: 13 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Tab" && comp) { e.preventDefault(); setInput(input + comp); }
                if (e.key === "Enter") runCommand();
              }}
              placeholder={broadcast ? "命令将同时发送到所有活跃会话…" : "试试输入 trz 或 tsz access.log,Tab 接受补全…"}
              style={{ width: "100%", background: "none", border: "none", outline: "none", color: T.text, fontFamily: T.mono, fontSize: 13 }} />
            {comp && (
              <span style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", color: "transparent", whiteSpace: "pre" }}>
                {input}<span style={{ color: T.faint }}>{comp}</span>
              </span>
            )}
          </div>
          {comp && <kbd style={kbdStyle()}>Tab ⇥</kbd>}
        </div>
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

const EDITABLE = /\.(conf|md|html|env|sh|css|js|log|txt|ya?ml|json)$|^\.env$/;
const fmtSize = b => b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + " MB" : b >= 1024 ? (b / 1024).toFixed(0) + " KB" : b + " B";
const lsAt = (tree, path) => path.reduce((n, p) => n[p].children, tree);
const fileIcon = (name, type) => type === "dir" ? "📁" : /\.(tar|gz|zip)/.test(name) ? "📦" : /\.(log)$/.test(name) ? "📜" : /\.(sh)$/.test(name) ? "⚙️" : "📄";

function FilePane({ title, root, fs, path, setPath, sel, setSel, onEdit, editable }) {
  const entries = Object.entries(lsAt(fs, path)).sort((a, b) => (a[1].type === "dir" ? 0 : 1) - (b[1].type === "dir" ? 0 : 1));
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 11, color: T.faint, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {root}{path.length ? "/" + path.join("/") : ""}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => setPath(path.slice(0, -1))} disabled={!path.length} style={{ ...ghostBtn(), padding: "3px 9px", opacity: path.length ? 1 : 0.4 }}>↑ 上级</button>
          <button style={{ ...ghostBtn(), padding: "3px 9px" }} title="刷新">⟳</button>
          <button style={{ ...ghostBtn(), padding: "3px 9px" }} title="新建文件夹">＋</button>
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
              {editable && meta.type === "file" && EDITABLE.test(name) && on && (
                <button onClick={e => { e.stopPropagation(); onEdit(name); }} style={{ ...ghostBtn(), padding: "2px 9px", color: T.amber, borderColor: T.amber, flexShrink: 0 }}>✎ 编辑</button>
              )}
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 58, textAlign: "right", flexShrink: 0 }}>{meta.type === "dir" ? "—" : fmtSize(meta.size)}</span>
              <span style={{ fontSize: 10, color: T.faint, fontFamily: T.mono, width: 72, textAlign: "right", flexShrink: 0 }}>{meta.mtime}</span>
            </div>
          );
        })}
        {!entries.length && <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: T.faint }}>空目录 — 从另一侧传输文件,或拖入本窗口</div>}
      </div>
    </div>
  );
}

function SftpView({ host, onBack }) {
  const [localFS, setLocalFS] = useState(() => JSON.parse(JSON.stringify(LOCAL_FS)));
  const [remoteFS, setRemoteFS] = useState(() => JSON.parse(JSON.stringify(REMOTE_FS)));
  const [lPath, setLPath] = useState([]);
  const [rPath, setRPath] = useState([]);
  const [lSel, setLSel] = useState(null);
  const [rSel, setRSel] = useState(null);
  const [queue, setQueue] = useState([]);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");

  /* 推进传输进度;完成时把文件写入目标侧 */
  useEffect(() => {
    if (!queue.some(q => q.status === "run")) return;
    const t = setInterval(() => {
      setQueue(prev => prev.map(q => {
        if (q.status !== "run") return q;
        const p = Math.min(q.progress + 6 + Math.random() * 14, 100);
        if (p >= 100) {
          const apply = (setFS, fs, path) => {
            const c = JSON.parse(JSON.stringify(fs));
            lsAt(c, path)[q.name] = { type: "file", size: q.size, mtime: "06-13 现在" };
            setFS(c);
          };
          if (q.dir === "up") apply(setRemoteFS, remoteFS, q.toPath); else apply(setLocalFS, localFS, q.toPath);
          return { ...q, progress: 100, status: "done" };
        }
        return { ...q, progress: p };
      }));
    }, 280);
    return () => clearInterval(t);
  }, [queue, remoteFS, localFS]);

  const transfer = dir => {
    const sel = dir === "up" ? lSel : rSel;
    const fs = dir === "up" ? localFS : remoteFS;
    const path = dir === "up" ? lPath : rPath;
    if (!sel) return;
    const meta = lsAt(fs, path)[sel];
    if (meta.type !== "file") { setToast("目录传输请使用打包上传(开发中)"); setTimeout(() => setToast(""), 2000); return; }
    setQueue(q => [...q, { id: Date.now(), name: sel, size: meta.size, dir, toPath: dir === "up" ? rPath : lPath, progress: 0, status: "run" }]);
  };

  const active = queue.filter(q => q.status === "run").length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "16px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button onClick={onBack} style={{ ...ghostBtn(), padding: "5px 12px" }}>← 返回</button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>SFTP 文件传输</h1>
        <span style={{ fontFamily: T.mono, fontSize: 13, color: T.amber }}>{host.name}</span>
        <Chain chain={host.chain} name={host.name} compact />
        {toast && <span style={{ marginLeft: "auto", fontSize: 12, color: T.amber, fontFamily: T.mono }}>{toast}</span>}
      </div>

      <div style={{ flex: 1, display: "flex", gap: 0, minHeight: 0 }}>
        <FilePane title="💻 本地" root="~/work" fs={localFS} path={lPath} setPath={setLPath} sel={lSel} setSel={setLSel} editable={false} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "0 12px" }}>
          <button onClick={() => transfer("up")} disabled={!lSel} title="上传所选"
            style={{ ...ghostBtn(), padding: "10px 12px", fontSize: 16, color: lSel ? T.amber : T.faint, borderColor: lSel ? T.amber : T.line, opacity: lSel ? 1 : 0.5 }}>→</button>
          <button onClick={() => transfer("down")} disabled={!rSel} title="下载所选"
            style={{ ...ghostBtn(), padding: "10px 12px", fontSize: 16, color: rSel ? T.amber : T.faint, borderColor: rSel ? T.amber : T.line, opacity: rSel ? 1 : 0.5 }}>←</button>
        </div>
        <FilePane title={`☁ ${host.name}`} root="/var/www" fs={remoteFS} path={rPath} setPath={setRPath} sel={rSel} setSel={setRSel} editable
          onEdit={name => setEditing({ name, content: name === "nginx.conf" ? "server {\n    listen 80;\n    server_name example.com;\n\n    location /api/ {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_set_header Host $host;\n    }\n}" : `# ${name}\n# 远程文件在线编辑 — 保存后经 SFTP 直接写回\n` })} />
      </div>

      {/* 传输队列 */}
      <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 14, padding: "10px 4px 14px", maxHeight: 150, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: queue.length ? 8 : 0 }}>
          <span style={{ fontSize: 10, color: T.faint, letterSpacing: 2 }}>传输队列</span>
          {active > 0 && <span style={{ fontSize: 11, color: T.amber, fontFamily: T.mono }}>{active} 个进行中</span>}
          {queue.length > 0 && active === 0 && <span style={{ fontSize: 11, color: T.green, fontFamily: T.mono }}>✓ 全部完成</span>}
          {queue.length > 0 && <button onClick={() => setQueue(q => q.filter(x => x.status === "run"))} style={{ ...ghostBtn(), padding: "2px 9px", marginLeft: "auto" }}>清除已完成</button>}
        </div>
        {!queue.length && <div style={{ fontSize: 11, color: T.faint, padding: "4px 0" }}>选中文件后点击 → 或 ← 传输;断点续传自动启用</div>}
        {queue.map(q => (
          <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: q.dir === "up" ? T.amber : T.blue, width: 38 }}>{q.dir === "up" ? "↑ 上传" : "↓ 下载"}</span>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, width: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</span>
            <div style={{ flex: 1, height: 5, borderRadius: 99, background: T.line, overflow: "hidden" }}>
              <div style={{ width: `${q.progress}%`, height: "100%", borderRadius: 99, background: q.status === "done" ? T.green : T.amber, transition: "width .28s linear" }} />
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: q.status === "done" ? T.green : T.dim, width: 76, textAlign: "right" }}>
              {q.status === "done" ? "✓ 完成" : `${Math.floor(q.progress)}% · ${(q.size / 1024 / 1024 * 0.4 + 1).toFixed(1)}MB/s`}
            </span>
          </div>
        ))}
      </div>

      {/* 在线编辑器 */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,7,10,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "fadeIn .15s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.55)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 13 }}>✎ 在线编辑</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.amber }}>/var/www/{editing.name}</span>
              <span style={{ fontSize: 10, color: T.faint, marginLeft: "auto" }}>保存后经 SFTP 直接写回远端</span>
            </div>
            <textarea value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} spellCheck={false}
              style={{ width: "100%", height: 280, boxSizing: "border-box", resize: "vertical", background: T.bg, color: T.text, border: "none", outline: "none", padding: 16, fontFamily: T.mono, fontSize: 12.5, lineHeight: 1.8 }} />
            <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.line}`, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ ...ghostBtn(), padding: "7px 16px" }}>取消</button>
              <button onClick={() => { setEditing(null); setToast(`✓ ${editing.name} 已保存并上传`); setTimeout(() => setToast(""), 2200); }}
                style={{ background: T.amber, border: "none", borderRadius: 8, padding: "7px 18px", color: T.onAccent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.sans }}>保存并上传</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= 主应用 ================= */
export default function App() {
  const [group, setGroup] = useState("全部主机");
  const [palette, setPalette] = useState(false);
  const [view, setView] = useState({ page: "hosts" });
  const [hover, setHover] = useState(null);
  const [themeName, setThemeName] = useState("琥珀夜航");
  const [, force] = useState(0);
  const rerender = () => force(x => x + 1);

  const setTheme = (name) => {
    Object.assign(T, THEMES[name]);
    setThemeName(name);
  };

  useEffect(() => {
    const fn = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const shown = HOSTS.filter(h => group === "全部主机" || h.group === group);
  const goHome = () => setView({ page: "hosts" });
  const NAV = [
    { id: "snippets", label: "⌘; 命令片段" },
    { id: "vault", label: "🔑 凭据保险库" },
    { id: "theme", label: "🎨 主题与外观" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, color: T.text, fontFamily: T.sans, transition: "background .25s, color .25s" }}>
      <style>{`
        @keyframes pulse { 0% { transform: scale(.6); opacity: .8 } 100% { transform: scale(1.6); opacity: 0 } }
        @keyframes blink { 50% { opacity: 0 } }
        @keyframes fadeIn { from { opacity: 0 } }
        @keyframes rise { from { opacity: 0; transform: translateY(4px) } }
        ::-webkit-scrollbar { width: 8px; height: 8px } ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 4px }
        button:focus-visible, input:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {[T.red, T.amber, T.green].map((c, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 99, background: c, opacity: .85 }} />)}
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: 1, color: T.dim }}>RELAY<span style={{ color: T.amber }}>›</span> SSH 控制台</span>
        <button onClick={() => setPalette(true)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, background: T.panelHi, border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 14px", color: T.faint, fontSize: 13, cursor: "pointer", minWidth: 240, fontFamily: T.sans }}>
          <span>搜索或快速连接…</span>
          <kbd style={{ ...kbdStyle(), marginLeft: "auto" }}>⌘K</kbd>
        </button>
        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.green }}>⟳ 已同步</span>
        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.green }}>● 密钥代理就绪</span>
      </div>

      {view.page === "session" ? (
        <Session host={view.host} onBack={goHome} onSftp={() => setView({ page: "sftp", host: view.host })} />
      ) : view.page === "config" ? (
        <ConfigView host={view.host} onBack={goHome} />
      ) : view.page === "sftp" ? (
        <SftpView host={view.host} onBack={goHome} />
      ) : view.page === "theme" ? (
        <ThemeView onBack={goHome} themeName={themeName} setTheme={setTheme} rerender={rerender} />
      ) : view.page === "snippets" ? (
        <SnippetsView onBack={goHome} />
      ) : view.page === "vault" ? (
        <VaultView onBack={goHome} />
      ) : (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ width: 200, borderRight: `1px solid ${T.line}`, padding: 14, display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: 2, padding: "4px 10px 8px" }}>分组</div>
            {GROUPS.map(g => {
              const n = g === "全部主机" ? HOSTS.length : HOSTS.filter(h => h.group === g).length;
              const on = group === g;
              return (
                <button key={g} onClick={() => setGroup(g)} style={{
                  display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8,
                  border: "none", cursor: "pointer", fontSize: 13, fontFamily: T.sans,
                  background: on ? T.amberSoft : "transparent", color: on ? T.amber : T.dim,
                }}>
                  <span>{g}</span><span style={{ fontFamily: T.mono, fontSize: 11, opacity: .7 }}>{n}</span>
                </button>
              );
            })}
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: 2, padding: "16px 10px 8px" }}>工具</div>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setView({ page: n.id })} style={{
                textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 13, fontFamily: T.sans, background: "transparent", color: T.dim,
              }}>{n.label}</button>
            ))}
            <div style={{ marginTop: "auto", padding: 12, borderRadius: 10, border: `1px dashed ${T.line}`, fontSize: 11, color: T.faint, lineHeight: 1.7 }}>
              拖入 <span style={{ color: T.dim, fontFamily: T.mono }}>~/.ssh/config</span> 即可一键导入全部主机
            </div>
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{group}</h1>
              <span style={{ fontSize: 12, color: T.faint, fontFamily: T.mono }}>{shown.filter(h => h.status !== "offline").length} 在线 / {shown.length} 台</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
              {shown.map(h => {
                const isHover = hover === h.id;
                const last = h.lat.at(-1);
                return (
                  <div key={h.id} onMouseEnter={() => setHover(h.id)} onMouseLeave={() => setHover(null)}
                    style={{
                      background: T.panel, border: `1px solid ${isHover ? T.amber : T.line}`, borderRadius: 14,
                      padding: 16, transition: "border-color .15s, transform .15s",
                      transform: isHover ? "translateY(-2px)" : "none",
                      opacity: h.status === "offline" ? 0.55 : 1,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Pulse status={h.status} />
                      <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600 }}>{h.name}</span>
                      {h.fav && <span style={{ color: T.amber, fontSize: 12 }}>★</span>}
                      <div style={{ marginLeft: "auto", textAlign: "right" }}>
                        <Spark data={h.lat} color={last > 40 ? T.amber : T.green} />
                        {last && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.faint }}>{last}ms</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: T.dim, fontFamily: T.mono, margin: "8px 0 12px" }}>{h.user}@{h.host}</div>
                    <Chain chain={h.chain} name={h.name} />
                    <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
                      {h.tags.map(t => <span key={t} style={{ fontSize: 10, color: T.faint, border: `1px solid ${T.line}`, padding: "2px 8px", borderRadius: 99 }}>{t}</span>)}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6, opacity: isHover ? 1 : 0, transition: "opacity .15s" }}>
                        <button onClick={() => setView({ page: "config", host: h })} style={{ ...ghostBtn(), padding: "4px 10px" }} title="链路 / 代理 / 转发配置">⚙</button>
                        <button onClick={() => setView({ page: "sftp", host: h })} style={{ ...ghostBtn(), padding: "4px 10px" }} title="SFTP 文件">⇅</button>
                        <button onClick={() => h.status !== "offline" && setView({ page: "session", host: h })} disabled={h.status === "offline"}
                          style={{ background: T.amber, border: "none", borderRadius: 8, padding: "4px 14px", color: T.onAccent, fontSize: 12, fontWeight: 600, cursor: h.status === "offline" ? "not-allowed" : "pointer", fontFamily: T.sans }}>
                          连接
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

      {palette && <Palette onClose={() => setPalette(false)} onConnect={h => { setPalette(false); if (h.status !== "offline") setView({ page: "session", host: h }); }} />}
    </div>
  );
}
