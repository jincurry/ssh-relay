# RELAY › 现代化 SSH 桌面管理工具 — 完整开发方案

> 版本 v1.0 · 技术栈 Tauri 2 + xterm.js + russh(纯 Rust)
> 本文档汇总了产品定位、竞品调研、技术架构、性能策略、功能模块、原型页面记录、设计系统、数据模型与开发计划,作为项目立项与研发的统一依据。

---

## 目录

1. [产品概述与定位](#1-产品概述与定位)
2. [竞品调研结论](#2-竞品调研结论)
3. [技术架构](#3-技术架构)
4. [性能策略](#4-性能策略)
5. [功能模块详述](#5-功能模块详述)
6. [原型页面记录](#6-原型页面记录)
7. [设计系统](#7-设计系统)
8. [数据模型](#8-数据模型)
9. [安全与凭据](#9-安全与凭据)
10. [项目结构与开发计划](#10-项目结构与开发计划)
11. [附录:关键技术决策与取舍](#11-附录关键技术决策与取舍)

---

## 1. 产品概述与定位

**RELAY** 是一款面向开发者与运维工程师的现代化桌面 SSH 管理工具。核心主张是把"复杂的连接路径"变成"可视化、可编排、可一眼看懂"的体验,同时保持原生级的轻量与性能。

### 1.1 目标用户

- 需要频繁经堡垒机 / 跳板机访问内网服务器的运维与 SRE
- 管理多环境(生产 / 预发 / 算力集群)的开发者
- 对终端体验、传输效率、界面美观度有要求的技术用户

### 1.2 产品差异点(为什么不是又一个 SSH 客户端)

| 差异点 | 说明 |
|---|---|
| **连接链路可视化** | 把 `本机 → 代理 → 堡垒机 → 中继 → 目标` 整条路径画成可拖拽拼装的节点流,这是产品的签名交互,业界鲜有 |
| **配置不锁死** | 所有 GUI 配置实时编译为标准 OpenSSH 命令,随时可复制带走,不绑架用户 |
| **原生级轻量** | Tauri + 纯 Rust SSH,空载内存约百兆级,远低于 Electron / JVM 系工具 |
| **一体化工作流** | SSH、SFTP 双栏、trzsz、端口转发、实时监控、命令片段集于一个原生二进制 |
| **零订阅核心能力** | 核心 SSH 工作流不依赖云端订阅,BYOK(自带密钥)本地优先 |

### 1.3 设计原则

- **键盘优先**:`⌘K` 命令面板可完成绝大多数操作,鼠标是补充而非必需
- **信息密度与留白平衡**:深色为主,单一强调色(琥珀)做视觉锚点,避免"圣诞树"配色
- **数据用等宽,UI 用无衬线**:主机名、IP、延迟、命令用等宽字体,界面文案用无衬线,刻意避开"黑客绿满屏"的审美套路
- **可逆与可见**:危险操作(重启服务、删除)有红色警示与二次确认;链路、转发、传输状态始终可见

---

## 2. 竞品调研结论

调研了 Termius、FinalShell、WindTerm、Tabby 四款主流工具,提炼各自最值得借鉴的能力,并明确 RELAY 的取舍。

### 2.1 各竞品招牌能力

| 工具 | 招牌能力 | 短板 | RELAY 的借鉴 |
|---|---|---|---|
| **Termius** | 跨全平台、内置 SFTP、多端云同步、Snippets 片段库、整体小巧美观 | 高级功能订阅制 | 片段库、凭据保险库、同步状态 |
| **FinalShell** | 极好用的 SFTP、文件在线编辑、服务器状态监控面板 | 基于 JVM,内存占用大 | 监控面板、SFTP 在线编辑(但用 Rust 轻量实现) |
| **WindTerm** | 业界公认最强的智能补全与历史命令提示 | 界面偏传统 | Tab 幽灵补全、命令历史 |
| **Tabby** | 配置同步好用、主题系统丰富、插件生态 | Electron,启动慢、内存高 | 丰富主题系统、配置同步(但用 Tauri 解决性能) |

### 2.2 核心取舍

> RELAY 的策略是:**吸收四家的功能广度,用 Tauri + Rust 解决它们共同的性能短板。**
> FinalShell 的监控好但重、Tabby 的主题好但慢、Termius 的体验好但收费——RELAY 在轻量原生的底座上,把这些好功能重新做一遍。

---

## 3. 技术架构

### 3.1 总体分层

```
┌─────────────────────────────────────────────────────────┐
│  渲染层 (WebView · React)                                  │
│  ├── 主机管理 / 链路编排 / 配置 UI                          │
│  ├── xterm.js + WebGL 渲染器  ← 终端显示                   │
│  ├── trzsz.js (TrzszFilter)   ← 传输过滤器                 │
│  └── 主题系统 / 监控面板 / SFTP 双栏                        │
└───────────────────────┬─────────────────────────────────┘
                        │ Tauri IPC (Channel · 二进制流)
┌───────────────────────┴─────────────────────────────────┐
│  后端层 (Rust · Tauri Core)                               │
│  ├── russh           ← SSH 连接 / 跳板链 / 认证            │
│  ├── russh-sftp      ← SFTP 子系统                        │
│  ├── portable-pty    ← 本地终端(可选)                     │
│  ├── 端口转发引擎     ← -L / -R / -D                       │
│  ├── 监控采集器       ← 复用 SSH 通道跑采集命令             │
│  └── 凭据保险库       ← 本地加密 / OS Keychain             │
└─────────────────────────────────────────────────────────┘
```

### 3.2 关键依赖

| 层 | 选型 | 理由 |
|---|---|---|
| 应用框架 | **Tauri 2** | 系统 WebView,不打包 Chromium,体积小、内存低、启动快 |
| 终端组件 | **xterm.js + @xterm/addon-webgl** | Web 端终端事实标准(VS Code / Tabby / electerm 同款),GPU 渲染 |
| SSH 库 | **russh** | 纯 Rust 实现,无 OpenSSL 依赖,跳板链与转发可编程控制 |
| SFTP | **russh-sftp** | 与 russh 同生态,复用已建立的 SSH 连接 |
| 文件传输 | **trzsz.js (TrzszFilter)** | trz/tsz 协议的 JS 实现,作为数据流过滤器接入 xterm |
| 前端框架 | **React** | 组件化、生态成熟,原型已用 React 验证 |
| 终端附加组件 | addon-fit / addon-search / addon-web-links | 自适应尺寸、搜索、链接识别 |

### 3.3 SSH 连接与跳板链(russh 核心)

跳板链是产品的核心。russh 实现思路:逐跳建立连接,前一跳的 `direct-tcpip` 通道作为后一跳的传输层。

```rust
// 伪代码:链路 本机 → bastion → 目标
let bastion = russh::client::connect(config, bastion_addr, handler).await?;
bastion.authenticate_publickey("ops", key).await?;

// 在 bastion 上开一个到目标的 direct-tcpip 通道
let channel = bastion.channel_open_direct_tcpip(
    target_host, target_port,    // 目标
    "127.0.0.1", 0,              // 源
).await?;

// 用该通道作为 stream,在其上建立到目标的 SSH 会话
let target = russh::client::connect_stream(config, channel.into_stream(), handler).await?;
target.authenticate_publickey("deploy", key).await?;
let shell = target.channel_open_session().await?;
shell.request_pty(...).await?;
shell.request_shell().await?;
```

多跳即递归套用:每多一个堡垒机,就在上一跳的通道里再开一个 `direct-tcpip`。出口代理(SOCKS5 / HTTP CONNECT)则在第一跳之前,通过 ProxyCommand 或在 TCP 层先连代理再 CONNECT。

### 3.4 数据通路(性能关键)

终端字节流 **必须走 Tauri Channel 的二进制传输**,不能用 JSON 事件或 invoke 返回值序列化:

```rust
// Rust 侧:russh 通道数据 → 前端 Channel
#[tauri::command]
async fn ssh_attach(channel: tauri::ipc::Channel<Vec<u8>>, session_id: String) {
    while let Some(data) = ssh_stream.next().await {
        channel.send(data).unwrap();   // 二进制,零 JSON 开销
    }
}
```

```js
// 前端:Channel → TrzszFilter → xterm
const channel = new Channel();
channel.onmessage = (bytes) => trzszFilter.processServerOutput(bytes);
await invoke('ssh_attach', { channel, sessionId });
term.onData(d => trzszFilter.processTerminalInput(d));
```

---

## 4. 性能策略

整套方案的性能成败,集中在两个确定性的工程措施上。做对了就是丝滑,做错了重输出场景会卡。

### 4.1 性能分层评估

| 层 | 性能表现 | 是否瓶颈 |
|---|---|---|
| 内存 / 启动 | 系统 WebView,空载约百兆级,启动数百毫秒 | ✅ 优势区 |
| SSH 吞吐 / 加解密 | russh 原生代码,千兆内网可跑满 | ✅ 非瓶颈 |
| 连接延迟 | 取决于网络与跳数(每跳一个 RTT,物理限制) | ⚠️ 由网络决定 |
| **终端渲染** | xterm.js,重输出时是唯一可能卡的环节 | ⚠️ **重点优化** |
| **IPC 数据通路** | JSON 序列化字节流会成隐形瓶颈 | ⚠️ **需用二进制 Channel** |
| trzsz / SFTP | 吞吐型任务,不占渲染主线程 | ✅ 非瓶颈 |

### 4.2 三条强制工程纪律

1. **必须启用 WebGL 渲染器**
   加载 `@xterm/addon-webgl`,字符由 GPU 绘制。不开 WebGL 退化到 DOM/Canvas,大量输出会明显掉帧。

2. **Rust 侧按帧聚合字节流**
   `tail -f`、`cat 大文件`、`yes` 这类高频输出,不能逐数据包 emit。在 Rust 侧用约 16ms(一帧)窗口批量聚合后再推前端,避免渲染风暴。

   ```rust
   // 按帧聚合:积累 ~16ms 或缓冲满则 flush
   let mut buf = Vec::new();
   let mut tick = tokio::time::interval(Duration::from_millis(16));
   loop {
       tokio::select! {
           Some(d) = ssh_stream.next() => {
               buf.extend_from_slice(&d);
               if buf.len() > 64 * 1024 { channel.send(std::mem::take(&mut buf)).ok(); }
           }
           _ = tick.tick() => {
               if !buf.is_empty() { channel.send(std::mem::take(&mut buf)).ok(); }
           }
       }
   }
   ```

3. **IPC 走二进制 Channel,不走 JSON**
   终端字节流用 `tauri::ipc::Channel<Vec<u8>>`,杜绝对大量字节做 JSON 序列化/反序列化。

### 4.3 其他优化点

- **进度更新节流**:trzsz / SFTP 传输进度不要每个 chunk 都 `setState`,按帧或按百分比阈值更新
- **Linux 注意 WebKitGTK**:其 WebGL 实现历史上弱于 Chromium,重输出场景需在 Linux 实测,必要时降级到 Canvas 渲染器
- **会话休眠**:非活跃标签页的 xterm 停止渲染循环,只缓存字节,切回时重放

### 4.4 与"原生天花板"的差距说明

若追求极致(如 Zed 那种基于 `alacritty_terminal` 的 GPU 直绘终端),纯原生比 xterm.js 更快、内存更低,但代价是整个 UI 用 Rust 重写,现有界面全部作废。**对 SSH 管理工具而言,xterm.js + WebGL 的体验已完全够用——VS Code 的终端就是它。** 因此本方案坚持 Tauri + xterm.js 路线,把性能压在上述确定性措施上。

---

## 5. 功能模块详述

### 5.1 主机管理

- **分组**:生产环境 / 预发布 / 算力集群 / 运维等,侧栏可切换,显示每组主机数
- **主机卡片**:状态脉冲点(在线/繁忙/离线)、主机名、`user@host`、延迟 sparkline 迷你曲线 + 当前延迟值、收藏星标、标签、链路缩略
- **悬停操作**:⚙ 配置、⇅ SFTP、连接按钮渐显
- **一键导入**:拖入 `~/.ssh/config` 自动导入全部主机
- **离线态**:降低透明度,连接按钮禁用

### 5.2 命令面板 ⌘K

- 全局快捷键 `⌘K / Ctrl+K` 唤起
- 输入主机名 / IP / 标签实时过滤,回车直连第一项
- 支持 `user@host` 直接发起临时连接
- 底部快捷键提示:`↵` 连接 / `⌘C` 复制 ssh 命令 / `⌘F` SFTP 打开

### 5.3 连接链路编排(签名功能)

- 把整条路径渲染为节点流:`本机 →(代理)→ 跳板1 → 跳板2 → 目标`
- **插入跳板/中继**:从预设堡垒机库(bastion-sh、bastion-bj、relay-db、relay-hk)选择添加,区分"堡垒机"与"中继"类型
- **节点操作**:每个跳板节点带 `‹ › ×` 按钮,可左右调序或移除,顺序即连接顺序
- **测试链路**:逐跳点亮并显示每段延迟,末端给出全链路总耗时
- 代理节点蓝色、目标节点琥珀色,视觉区分

### 5.4 出口代理

- 四种模式:直连 / SOCKS5 / HTTP CONNECT / 自定义 ProxyCommand
- SOCKS5、HTTP 模式展开地址、端口、认证开关
- ProxyCommand 模式支持 `%h %p` 占位符自定义命令
- 代理在链路图中以蓝色节点呈现

### 5.5 端口转发与隧道

- 三种类型:本地转发 `-L`、远程转发 `-R`、动态 SOCKS `-D`
- 每条规则可视化映射:`localhost:5432 →(方向箭头)→ db:5432`,带颜色区分(L 绿 / R 蓝 / D 琥珀)
- 可单独启停、删除,显示活跃状态
- 可随会话自动建立

### 5.6 等效 SSH 命令预览

- 所有配置(代理 + 跳板链 + 转发)实时编译为标准 OpenSSH 命令
- 一键复制,可在任意终端使用
- 体现"配置不锁死"原则

### 5.7 主题与外观

- **四套预设主题**:琥珀夜航(默认)、深海驰行(冷蓝)、苔原信号(终端绿)、极昼(浅色)
- 每个主题带迷你终端预览卡片,点击全局即时切换
- **独立强调色选择器**:5 种强调色,影响按钮、链路终点、光标
- **终端排版**:字号滑杆(11–18px)实时预览,支持等宽连字
- 配置跟随云同步,终端配色与界面联动(映射到 xterm.js `theme` 对象)

### 5.8 实时监控面板(学 FinalShell)

- 会话视图右侧栏:CPU / 内存 / 磁盘 / 网络仪表
- 数据动态刷新,CPU 与网络带趋势 sparkline
- 显示负载、进程数、运行时长、系统版本
- 可一键收起
- **轻量实现**:Rust 侧复用已建立的 SSH 连接周期性跑采集命令(top/free/df 等),不另开连接,避开 FinalShell 的资源臭名

### 5.9 命令片段库(学 Termius)

- 独立片段库页面 + 会话内片段抽屉(`⌘;`)
- 片段带分类标签(巡检 / 网络 / 服务 / 日志 / 容器)
- 点击直接填入输入框
- **危险命令**(如重启服务)红色警示标记,执行前需确认

### 5.10 Tab 智能补全(学 WindTerm)

- 输入命令时显示灰色"幽灵补全"建议
- 按 `Tab` 接受补全
- 基于历史命令与常用命令库

### 5.11 凭据保险库(学 Termius)

- 管理 SSH 密钥(ED25519 / RSA)、TOTP 动态口令
- **私钥永不出库**:签名在本地代理完成,跳板与目标只见公钥
- 显示指纹、使用主机数
- 本地加密,主密码解锁,可接入 OS Keychain

### 5.12 SFTP 双栏文件管理(学 FinalShell)

- **左本地 / 右远端** 双栏布局,各带路径面包屑与工具条(上级 / 刷新 / 新建文件夹)
- 单击选中(高亮)、双击进目录,目录排在文件前
- **中间方向按钮**:→ 上传 / ← 下载,仅对应侧有选中时点亮
- **传输队列**:每条任务带方向标签、实时进度条、速率,完成后文件出现在目标侧;支持断点续传;可清除已完成
- **在线编辑**:选中文本类远端文件(.conf/.env/.md 等)出现"编辑"按钮,等宽编辑器修改后"保存并上传"直接写回,免去下载-改-传三步
- 顶部保留链路条,提示文件流量同样走跳板(对应 russh 复用 SSH 连接的 SFTP 子系统,不二次认证)

### 5.13 trzsz 文件传输(trz / tsz)

- **三种触发**:拖文件到终端(trz 上传)、输入 `trz`、输入 `tsz 文件名`(下载)
- 终端内 trzsz 风格字符进度条:`app.tar.gz [████████░░] 62% · 4.8MB/s`
- 拖拽时显示琥珀虚线遮罩引导
- 兼容 tmux,支持目录传输与断点续传
- 进度信息标注经过的跳板链
- **实现**:trzsz.js 的 `TrzszFilter` 作为数据流过滤器接在 xterm 与 russh 之间,发现服务端运行 trz/tsz 即接管字节流做传输,否则原样透传;russh 无需感知其存在

---

## 6. 原型页面记录

原型已用 React 实现并通过语法校验,文件 `ssh-manager.jsx`(约 1065 行)。以下逐页记录交互与视觉,作为研发还原依据。

### 6.1 全局框架

- **顶栏**:左侧三色窗口圆点 + `RELAY› SSH 控制台` 标识;中间 `⌘K` 搜索/快速连接入口;右侧 `⟳ 已同步` 与 `● 密钥代理就绪` 状态
- **路由**:单页应用,`view.page` 在 hosts / session / config / sftp / theme / snippets / vault 间切换
- **主题驱动**:全局令牌对象 `T`,切换主题时整体替换并重渲染

### 6.2 主机列表页(hosts)

- **左侧栏**:分组导航(全部主机 / 生产环境 / 预发布 / 算力集群 / 运维)+ 工具入口(命令片段 / 凭据保险库 / 主题与外观)+ 底部 `~/.ssh/config` 导入提示
- **主区**:标题 + "X 在线 / Y 台"统计;响应式卡片网格
- **卡片元素**:脉冲点、主机名(等宽)、收藏星、延迟 sparkline + ms 值、`user@host`、链路缩略、标签、悬停渐显的 ⚙/⇅/连接 按钮
- **交互**:悬停卡片上浮 2px + 边框转琥珀;离线卡片置灰禁用

### 6.3 命令面板(⌘K 浮层)

- 居中浮层,背景模糊;顶部 `›_` 提示符 + 输入框 + `esc` 键提示
- 实时过滤结果列表,首项高亮显示 `↵ 连接`
- 底部快捷键说明栏

### 6.4 连接配置页(config)

四张配置卡片纵向排列:
1. **连接链路编排** — 节点流图 + 插入跳板下拉 + 测试链路按钮 + 逐跳延迟点亮动画
2. **出口代理** — 四选一卡片 + 条件展开的地址/端口/认证字段
3. **端口转发与隧道** — 规则列表(方向箭头映射)+ 启停/删除 + 三种新增按钮
4. **等效 SSH 命令** — 实时编译的命令预览(绿色等宽)+ 复制按钮

### 6.5 会话页(session)

- **会话标签栏**:返回、主机标签(脉冲+延迟)、`trz/tsz 就绪` 徽章、拆分、片段/广播/监控/SFTP 开关
- **链路条**:`本机 → bastion → 目标` + 操作提示
- **终端区**:等宽字体逐行输出动画、闪烁光标;支持拖拽上传(琥珀虚线遮罩);trzsz 字符进度条
- **右侧监控面板**(可收起):CPU/内存/磁盘/网络仪表 + 趋势图 + 系统信息
- **片段抽屉**(可展开):横向滚动的片段快捷按钮
- **智能输入条**:幽灵补全(Tab 接受)、广播态变色、`trz`/`tsz` 命令触发传输

### 6.6 SFTP 页(sftp)

- 顶部:返回、标题、主机名、链路条、toast 提示
- 双栏文件面板(本地/远端)+ 中间上传/下载方向按钮
- 底部传输队列(方向/文件名/进度条/速率)
- 在线编辑器浮层(等宽 textarea + 保存并上传)

### 6.7 主题页(theme)

- **主题方案**:四张带迷你终端预览的主题卡片,选中边框琥珀,标注"使用中"
- **强调色**:5 个圆形色块选择器
- **终端排版**:字号滑杆 + 实时预览框

### 6.8 命令片段页(snippets)

- 片段列表:分类标签(危险命令红色 ⚠)+ 名称 + 命令(等宽)+ 复制按钮
- 顶部"新建片段"按钮

### 6.9 凭据保险库页(vault)

- 顶部 `🔒 本地加密 · 主密码已解锁` 状态
- 凭据列表:名称 + 类型 + 指纹 + 使用主机数

---

## 7. 设计系统

### 7.1 主题令牌(以"琥珀夜航"为例)

| 令牌 | 值 | 用途 |
|---|---|---|
| `bg` | `#0C0F14` | 全局背景(深石墨蓝) |
| `panel` | `#12161D` | 卡片 / 面板背景 |
| `panelHi` | `#181D26` | 高亮面板 / 输入框 |
| `line` | `#232A35` | 分隔线 / 边框 |
| `text` | `#E6EAF0` | 主文字 |
| `dim` | `#8A94A6` | 次要文字 |
| `faint` | `#5A6374` | 弱化文字 / 占位 |
| `amber` | `#E8A33D` | 强调色(信号琥珀) |
| `amberSoft` | `rgba(232,163,61,0.12)` | 强调色柔和背景 |
| `green` | `#4CC38A` | 在线 / 成功 |
| `red` | `#E5534B` | 危险 / 离线 |
| `blue` | `#5B9DD9` | 代理 / 信息 |

### 7.2 四套主题对照

| 主题 | 背景 | 强调色 | 定位 |
|---|---|---|---|
| 琥珀夜航 | `#0C0F14` | `#E8A33D` | 默认 · 深石墨蓝与信号琥珀 |
| 深海驰行 | `#0A0E17` | `#5B9DD9` | 冷调深蓝 · 长时间夜间值守 |
| 苔原信号 | `#0D1210` | `#4CC38A` | 经典终端绿的现代演绎 |
| 极昼 | `#F4F5F7` | `#B45309` | 浅色 · 高亮环境/投屏演示 |

### 7.3 字体规范

- **等宽**(数据/终端/命令):`JetBrains Mono` / `SF Mono` / `Menlo` / `Consolas`
- **无衬线**(UI 文案):`Inter` / `Segoe UI` / `PingFang SC` / `Microsoft YaHei`
- **原则**:主机名、IP、延迟、命令一律等宽;界面文案一律无衬线

### 7.4 视觉语汇

- **状态脉冲点**:在线绿/繁忙琥珀/离线灰,在线态有扩散脉冲动画
- **链路胶囊**:跳板节点为圆角胶囊,目标节点琥珀描边+柔和背景
- **sparkline**:延迟与监控趋势用极简折线,无坐标轴
- **圆角**:卡片 14px、按钮 8px、胶囊 99px
- **动效**:卡片上浮、逐行 rise、光标 blink、脉冲扩散;遵守 `prefers-reduced-motion`

---

## 8. 数据模型

### 8.1 主机(Host)

```typescript
interface Host {
  id: number;
  name: string;          // 主机名(显示用)
  host: string;          // IP / 域名
  user: string;          // 登录用户
  group: string;         // 分组
  tags: string[];        // 标签
  status: "online" | "busy" | "offline";
  lat: number[];         // 延迟历史(sparkline)
  chain: string[];       // 跳板链(堡垒机/中继名列表)
  fav: boolean;          // 收藏
  proxy?: ProxyConfig;   // 出口代理
  forwards?: Forward[];  // 端口转发规则
}
```

### 8.2 跳板/中继(Bastion)

```typescript
interface Bastion {
  name: string;
  desc: string;
  type: "堡垒机" | "中继";
  // 实际实现含:host/port/user/认证方式/2FA 绑定
}
```

### 8.3 代理配置(ProxyConfig)

```typescript
interface ProxyConfig {
  type: "none" | "socks5" | "http" | "cmd";
  host?: string;
  port?: string;
  auth?: boolean;
  cmd?: string;          // ProxyCommand,%h %p 占位
}
```

### 8.4 端口转发(Forward)

```typescript
interface Forward {
  id: number;
  type: "L" | "R" | "D"; // 本地/远程/动态
  lport: string;
  rhost: string;
  rport: string;
  on: boolean;           // 是否启用
}
```

### 8.5 命令片段(Snippet)与凭据(Credential)

```typescript
interface Snippet { name: string; cmd: string; tag: string; danger?: boolean; }
interface Credential { name: string; type: string; fp: string; used: number; }
```

---

## 9. 安全与凭据

- **私钥不出本地**:认证签名由本地代理完成,远端只见公钥;凭据库本地加密,可接入 OS Keychain(macOS Keychain / Windows Credential Manager / Linux Secret Service)
- **主机指纹校验**:首次连接记录 known_hosts,后续比对,变更时告警
- **2FA / TOTP**:支持堡垒机动态口令自动填充
- **危险命令防护**:删除、重启服务等命令红色标记 + 二次确认
- **零遥测**:核心 SSH 工作流不上报数据
- **传输安全**:SFTP / trzsz 复用已加密的 SSH 通道,不额外开放端口

---

## 10. 项目结构与开发计划

### 10.1 建议目录结构

```
relay/
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── ssh/                # russh 连接、跳板链
│   │   │   ├── connect.rs
│   │   │   ├── jump.rs         # 跳板链递归建立
│   │   │   └── proxy.rs        # SOCKS5/HTTP 代理
│   │   ├── sftp.rs             # russh-sftp
│   │   ├── forward.rs          # 端口转发引擎
│   │   ├── monitor.rs          # 监控采集
│   │   ├── vault.rs            # 凭据保险库
│   │   └── ipc.rs              # Channel 二进制流
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                        # React 前端
│   ├── App.jsx
│   ├── theme/tokens.js         # 主题令牌
│   ├── components/
│   │   ├── HostGrid.jsx
│   │   ├── Palette.jsx
│   │   ├── ChainEditor.jsx     # 链路编排
│   │   ├── ProxyConfig.jsx
│   │   ├── ForwardRules.jsx
│   │   ├── Session.jsx         # xterm + trzsz
│   │   ├── Sftp.jsx
│   │   ├── Monitor.jsx
│   │   ├── Snippets.jsx
│   │   ├── Vault.jsx
│   │   └── ThemeManager.jsx
│   └── lib/
│       ├── terminal.js         # xterm + WebGL + addons
│       └── trzsz.js            # TrzszFilter 接线
├── package.json
└── README.md
```

### 10.2 里程碑计划

| 阶段 | 目标 | 关键产出 |
|---|---|---|
| **M0 工程骨架** | Tauri 2 + React + xterm.js 跑通 | 能开本地 pty 终端,WebGL 渲染就绪 |
| **M1 SSH 核心** | russh 单跳连接 + 二进制 Channel 流 | 连上单台主机,终端可交互,按帧聚合生效 |
| **M2 跳板链** | 多跳堡垒机 + 出口代理 + 链路编排 UI | 签名功能落地,链路测试可用 |
| **M3 传输** | SFTP 双栏 + 在线编辑 + trzsz | 文件管理与 trz/tsz 完整 |
| **M4 端口转发** | -L/-R/-D 引擎 + 规则 UI | 转发可视化与实际生效 |
| **M5 体验层** | 主题系统 + 监控 + 片段 + 补全 | 四套主题、监控面板、片段库、Tab 补全 |
| **M6 安全与同步** | 凭据保险库 + Keychain + 配置同步 | 私钥本地、指纹校验、多端同步 |
| **M7 打磨发布** | 性能压测 + 跨平台测试 + 打包 | macOS/Windows/Linux 三端二进制 |

### 10.3 跨平台注意事项

- **Linux**:WebKitGTK 的 WebGL 需实测,重输出场景必要时降级 Canvas 渲染器
- **Windows**:依赖 WebView2 运行时(Win10+ 多已内置)
- **trzsz Webview fs 权限**:trzsz.js 读写本地文件需经 Tauri fs API 桥接(类比 Electron preload.js 方案)

---

## 11. 附录:关键技术决策与取舍

| 决策点 | 选择 | 放弃的备选 | 理由 |
|---|---|---|---|
| 应用框架 | Tauri 2 | Electron | 内存/启动/体积全面占优,解决 Tabby 痛点 |
| 终端组件 | xterm.js + WebGL | 原生 alacritty_terminal | 复用现有 React UI;体验已够用(VS Code 同款);原生需整体 Rust 重写,成本翻倍 |
| SSH 库 | russh(纯 Rust) | libssh2 绑定 / 调系统 ssh | 无 OpenSSL 依赖;跳板链与转发可编程控制 |
| 数据通路 | 二进制 Channel | JSON 事件 | 避免字节流序列化瓶颈 |
| 渲染节流 | Rust 侧按帧聚合 | 前端节流 | 在源头聚合最有效,避免 IPC 风暴 |
| 终端绿满屏 | 单一琥珀强调色 | 传统绿色终端审美 | 现代化、专业控制台观感 |

---

### 一句话总结

> **RELAY 用 Tauri + 纯 Rust 的轻量底座,把堡垒机/中继/代理这套"连接复杂度"做成可视化编排,再叠加 SFTP 双栏、trzsz、监控、主题等一体化能力。性能成败压在「xterm.js 开 WebGL」与「Rust 侧按帧聚合二进制流」两件确定性工程上——做对即丝滑。**

---

*文档随设计迭代持续更新。配套原型见 `ssh-manager.jsx`。*
