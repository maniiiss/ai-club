# GitPilot Desktop HTML 预览（浏览器接入）技术设计 v1

状态：已评审通过，待实施

## 1. 背景与结论

GitPilot Desktop（Tauri 2 + React 19 + bun sidecar）目前没有任何 HTML 预览能力：全代码库无 iframe/webview 组件，`src-tauri/tauri.conf.json` 的 CSP 为 null。CODE 模式下 Agent 写出的网页产物、项目中的静态页面，用户只能去外部浏览器手动打开，看不到即时效果，也谈不上"改一下立即看到"的迭代闭环。

`gitpilot-desktop-work-delegation-technical-design-v1.md` 曾为 WORK 模式规划过"HTML 原型 + 对话内 iframe 沙箱预览卡片"，其中"沿用 DESIGN 模式现有 iframe 沙箱配置"的表述已过时（DESIGN 改造为 CanvasKit 渲染后该配置不存在）；本设计落地后由本文档取代该表述，成为桌面端 HTML 预览的唯一机制。

**结论**：预览定位为纯展示层能力，采用 **Tauri 自定义协议（`preview://`）+ iframe sandbox** 架构：

- Rust 主进程注册 `preview://` URI scheme 处理器，从磁盘读取**已授权根**之下的文件返回，相对路径由浏览器引擎原生解析，多文件项目（html + css + js + 图片）零改写即可完整渲染。
- 不开本地端口（对比本地 HTTP 静态服务方案：本机任意进程可扫描端口读取用户工作区文件，与项目 deny-by-default 安全基线冲突）。
- 不做前端 srcDoc 内联改写（运行时 `fetch` 相对路径、动态加载处理不了，与"接近真实浏览器效果"的目标冲突）。
- **gitpilot-cli sidecar 零改动**：预览不进 Agent 工具链，触发与刷新信号复用现有事件流。
- v1 主做 **CODE 模式**；WORK 模式接线为后续阶段（协议层与组件模式无关，接入零架构改动，见第 10 节）。

## 2. 目标与非目标

### 2.1 目标

- CODE 模式下可直接预览会话 cwd 内任意 html：支持相对路径引用的 css/js/图片等资源完整加载。
- 两个入口：对话流**预览卡片**（Agent 产出/修改 html 时自动插入）与**独立预览面板**（文件树右键、CodeCard 按钮打开）。
- 面板轻量工具栏：入口文件路径展示（只读）、手动刷新、桌面/375px 手机尺寸切换、在系统浏览器打开、关闭。
- 脚本与网络策略：允许 JS 执行、允许访问外网（CDN 字体、公开 API），预览效果接近真实浏览器。
- 文件变更自动刷新：Agent 修改当前预览根下文件（不限入口 html 本身，css/js 同样触发）后，防抖 300ms 自动 reload。

### 2.2 非目标（v1 边界）

- 不做 WORK 模式接线（后续阶段，见 10.1）。
- 不做 fs watch：外部编辑器/终端改文件不自动刷新，手动刷新兜底（见 10.2）。
- 不做 HMR 级热更新、多标签页、前进/后退历史、可输入跳转的地址栏。
- 不做 dev server URL 预览（如 Vite 5173 端口，见 10.3）。
- 不动 sidecar / gitpilot-cli 任何代码，不动全局 CSP（`csp: null` 维持现状，全局收紧为独立后续项，届时需包含 `frame-src preview:` 与 `http://preview.localhost`）。
- DESIGN 模式不参与：继续 CanvasKit 渲染，不引入 iframe/DOM 作为第二内容渲染器。

## 3. 现状与约束

```text
AppMode = 'code' | 'work' | 'design'          (gitpilot-desktop/src/store/app-mode.ts)
三个工作台常驻挂载，aria-hidden 切换          (gitpilot-desktop/src/App.tsx)

Rust 主进程（极薄，零业务）：
  main.rs       tauri::Builder 链，invoke_handler 白名单命令（commands.rs）
  sidecar.rs    SidecarBridge：sidecar JSONL 转发
  commands.rs   rpc_send / gitpilot_root / reveal_path / terminal_*（平台能力定位）

CODE 模式：
  TargetDesktopShell 组合 TargetSessionSidebar + TargetConversationArea
  + TargetExecutionInspector + TargetTerminalPanel（bottom/terminal 槽位体系）
  会话 cwd = 项目目录；Agent 工具事件经 AgentSessionEvent 流（rpc/types.ts）

WORK 模式（v1 不接线，仅背景）：
  每任务独立工作区 workspaces/<taskId>/，work_file_created/updated/deleted 事件流
```

关键约束：

1. **Rust 极薄原则**：主进程只放平台能力，不放业务。`preview://` 协议处理器属于平台能力（同 Tauri 内置 asset protocol 机制），与 commands.rs 定位一致，允许进入；但不得在 Rust 侧做任何会话/任务语义。
2. **三模式隔离**：预览状态按模式隔离（CODE/WORK 各记最近预览目标），切换模式不串扰、不卸载。
3. **瞬态权限先例**：`full_access` 会话权限只存 sidecar 会话实例、不落盘。预览根授权采用同款瞬态原则（Rust 内存态）。
4. **事件流即信号源**：CODE 模式文件变更信号 = AgentSessionEvent 工具完成事件（工具名 + 路径参数），不新增 sidecar 事件类型。

## 4. 总体架构

```text
┌─ 桌面端 React ──────────────────────────────────────────────┐
│ PreviewCard（对话流卡片，小尺寸 iframe）                       │
│ PreviewPanel（独立面板：轻量工具栏 + iframe）                  │
│         └────── src: preview://<rootId>/<相对路径>?v=<版本> ─┐│
│ store/preview.ts（根注册缓存、当前预览目标、刷新防抖、按模式隔离）││
└─────────────────────────────────────────────────────────────┼┘
                                                               ▼
┌─ Rust 主进程 ───────────────────────────────────────────────────┐
│ preview.rs：preview:// 协议处理器                                  │
│   PreviewRootRegistry（Mutex<HashMap<rootId, PathBuf>>，内存态）  │
│   rootId 查表 → canonicalize + 前缀校验 → 读文件 → MIME → 响应    │
│ commands.rs 新增：preview_register_root / preview_revoke_root    │
└──────────────────────────────────────────────────────────────────┘

数据流：
打开预览 → invoke('preview_register_root', path) → rootId
→ iframe src = preview://<rootId>/<相对路径>?v=1
→ 协议处理器查授权根、拼路径、防穿越校验、读盘返回
→ Agent 工具事件命中预览根 → bumpVersion → 防抖 300ms → src 更新 → reload
```

## 5. 详细设计

### 5.1 preview:// 协议层（Rust）

**新模块 `src-tauri/src/preview.rs`**，`main.rs` Builder 链上 `register_uri_scheme_protocol("preview", ...)` 注册。

**URL 格式**：`preview://<rootId>/<相对路径>?v=<版本号>`

- `rootId`：注册时生成的短 ID（如 `r3f2a1`），URL 不暴露绝对路径——既避免路径进 DOM/React 状态，又天然形成"先注册才能访问"的门槛。
- `?v=`：每次刷新递增，绕过 WebView 缓存实现"改了立即看到"。

**PreviewRootRegistry（managed state）**：`Mutex<HashMap<String, PathBuf>>`，rootId → 授权根绝对路径。注册入口校验路径存在且为目录。内存态，应用重启即清空。

**协议处理器逻辑**（按序）：

1. 解析 host 段为 rootId，查授权表；未注册 → 404。
2. 根 + 相对路径拼接 → `canonicalize` → 结果必须仍以该根为前缀（`..\` 穿越与符号链接逃逸统一 404）。
3. 路径为目录（或以 `/` 结尾）→ 自动补 `index.html`，与真实静态服务器行为一致。
4. 读文件 → 按扩展名给 MIME：白名单内（html/htm/css/js/mjs/svg/png/jpg/jpeg/webp/gif/ico/woff/woff2/ttf/json/map/txt/md 等）按类型返回，未知类型一律 `application/octet-stream`（iframe 内触发下载而非执行）。
5. 不提供目录列表（无 index.html 的目录请求 404）。

**命令（commands.rs 新增两个）**：

- `preview_register_root(path: String) -> Result<String, String>`：校验、生成 rootId、入表、返回 rootId（幂等：同路径重复注册返回既有 rootId）。
- `preview_revoke_root(rootId: String)`：出表。会话切换/项目关闭时前端调用。

### 5.2 前端 store（`src/store/preview.ts`）

- 状态：
  - `roots: Map<rootId, { path, label }>`：已注册根缓存（含 Rust 校验结果）。
  - `active: { rootId, entryPath, entryLabel, version } | null`：当前预览目标。
  - `panelOpen: boolean`；`viewport: 'desktop' | 'mobile'`。
  - 按模式记忆的最近预览目标：`lastByMode: Record<'code' | 'work', ...>`（v1 只写 code）。
- 动作：`registerRoot(path, label)`、`open(rootId, entryPath, label)`（开面板并设 active）、`bumpVersion()`、`close()`、`setViewport()`。
- 刷新防抖：工具事件命中当前预览根 → 排队 → 300ms 静默期后统一 `bumpVersion()` 一次（流式写入多次事件只触发一次 reload）。

### 5.3 组件

**`src/components/preview/PreviewPanel.tsx`（独立面板）**

- 挂载：CODE 模式挂进 `TargetDesktopShell` 槽位体系，与 `TargetTerminalPanel` 同级的右侧可开合 dock。
- 工具栏（轻量，非浏览器式）：入口文件相对路径只读展示、刷新按钮、桌面/375px 切换、"在系统浏览器打开"（用入口 html 的绝对路径经系统默认浏览器打开 `file://`，资源相对路径同样成立）、关闭。
- 主体：`<iframe src={previewUrl} sandbox="allow-scripts allow-forms allow-popups allow-modals">`。**不加 `allow-same-origin`**（页面保持受限 origin，触碰不到主应用与 Tauri IPC，代价是页面内 localStorage 不可用、抛 SecurityError——已知接受的限制）。

**`src/components/preview/PreviewCard.tsx`（对话流卡片）**

- 出现在产出该 html 的助手消息内：固定高度约 240px 的小尺寸 iframe（同一 preview:// URL，共享根注册与版本号）+ 文件名 + "在面板中打开" + "在系统浏览器打开"。
- 同一入口文件被多次修改时更新既有卡片，不重复插入。

### 5.4 CODE 模式接线（v1 交付范围）

- **根注册**：CODE 会话激活（会话 cwd 确定）时 `registerRoot(cwd, 项目名)`；会话切换时 revoke 旧根。
- **卡片触发**：监听 AgentSessionEvent 工具完成事件，工具参数中路径以 `.html` 结尾（write_file / edit 等写入类工具）→ 在当前对话流插入/更新预览卡片。
- **面板入口**：`TargetSessionSidebar` 文件树 html 条目右键"预览 HTML"；`CodeCard`（html 产出卡片）增加"预览"按钮。两入口都调用 `store.open()`。
- **自动刷新**：工具完成事件中路径命中当前预览根（任意后缀，css/js/图片同样算）→ 进入防抖队列 → reload。

### 5.5 刷新联动（事件 → reload 全链路）

```text
sidecar AgentSessionEvent(tool completed, path ∈ 预览根)
→ bridge.dispatchLine 既有链路 → preview store 事件订阅
→ 命中 active.root 对应根前缀 → 防抖 300ms
→ version++ → iframe src 更新（?v=n）→ WebView 绕缓存重载
```

手动刷新按钮 = 直接 `bumpVersion()`，不受防抖约束。

## 6. 安全设计

用户已选定"允许 JS + 允许外网"（预览接近真实浏览器效果），边界靠以下机制兜住：

| 层面 | 机制 |
|---|---|
| 文件访问 | 协议只服务已注册根之下的文件：canonicalize + 前缀校验防穿越；根必须由桌面端显式注册（CODE 会话 cwd），WebView 内任何 JS 无法凭空访问未注册路径。 |
| 应用隔离 | `preview://` origin（Windows WebView2 下为 `http://preview.localhost`）与主应用 origin（`http://tauri.localhost`）不同源：页面 JS 拿不到 Tauri IPC、主应用 DOM、localStorage。iframe sandbox 不加 `allow-same-origin`。 |
| 根授权瞬态 | rootId 只存 Rust 内存态，不落盘、不进 localStorage；应用重启即失效。对齐 `full_access` 会话权限的瞬态原则。 |
| MIME 收敛 | 白名单外一律 `application/octet-stream`，避免未知类型被执行。 |

**已知接受的残余风险**（明示，不隐藏）：允许外网意味着 Agent 生成的页面可加载 CDN 资源、请求外部 API——这是产品选择的能力边界；缓解是"默认只预览自己工作区产出 + 面板一键关闭 + 用户可随时在系统浏览器核对"。

**实现期验证项**（双平台各验证一次）：

- iframe 内 `window.parent` 不可达（跨源）。
- 页面内 `fetch('http://tauri.localhost/...')` 被同源策略拦截。
- iframe 内无 Tauri IPC init script 注入（Tauri IPC 默认只注主 frame）。

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| 入口 html 被删除 | 协议 404 → 面板显示"文件已不存在"占位 + 提示从文件树重新选择 |
| 根被 revoke 时面板还开着 | 自动关闭面板；卡片保留但点击提示"工作区已关闭" |
| 流式写入中途刷新 | 防抖 300ms 天然缓解；半截 html 由浏览器容错渲染，下一次写入事件再刷新，最终一致 |
| 注册根失败（目录不存在） | Rust 返回错误 → 面板/卡片显示占位，不崩溃 |
| 大文件/二进制 | MIME 白名单外 octet-stream，触发下载而非执行 |
| 会话切换后旧 rootId 请求 | 注册表已 revoke → 404 → 面板占位提示重新打开 |

## 8. 测试与验证（对齐 Harness 规范）

- **Rust**：`preview.rs` 单元测试——根注册/注销幂等、路径穿越拒绝（`..\`、符号链接）、MIME 映射、目录补 index.html、未注册 rootId 404。`cd gitpilot-desktop/src-tauri && cargo test`。
- **前端**：`store/preview.ts` 单测（根缓存、按模式隔离、防抖归并一次 bump）；卡片触发归并逻辑单测（同一 html 多次修改只更新一张卡片）。`cd gitpilot-desktop && npm run test`（vitest）。
- **构建**：`cd gitpilot-desktop && npm run build`；Rust `cargo check`。
- **手工验收**：见第 11 节验收场景。
- **编码检查**：`python scripts/check_encoding.py`（UTF-8 无 BOM）。

## 9. 文档同步

- 本文档即正式设计（`docs/design-docs/gitpilot-desktop-html-preview-technical-design-v1.md`）。
- `docs/design-docs/index.md` 增加索引条目。
- 实施交付时更新 `docs/architecture.md` 桌面端章节：补 preview:// 协议层说明与三模式关系（CODE 接入、WORK 后续、DESIGN 不参与）。
- 修正 `gitpilot-desktop-work-delegation-technical-design-v1.md` 中"沿用 DESIGN 模式现有 iframe 沙箱配置"的过时表述，改为指向本文档。

## 10. 未来扩展

1. **WORK 模式接线**（下一阶段）：根 = 任务工作区 `workspaces/<taskId>/`，卡片触发源 = `work_file_created/updated` 事件，面板挂 `TargetWorkShell` Inspector dock。协议层、store、两个组件全部复用，纯接线工作。对齐 work-delegation 文档"原型预览卡片"规划（目录约定 `prototype/<名称>/index.html` 沿用，但不强制）。
2. **fs watch**：Rust 侧引入 notify 监听预览根，覆盖外部编辑器改文件场景；事件并入同一防抖队列。
3. **dev server URL 预览**：面板支持输入 `http://localhost:5173` 直开（iframe src 直接指向该 URL，协议层零改动）。
4. **全局 CSP 收紧**：独立后续项，届时需包含 `frame-src preview:` / `http://preview.localhost`。

## 11. 验收场景

1. CODE 会话打开含静态站点的项目 → 文件树右键 index.html"预览 HTML" → 面板打开，相对路径 css/js/图片完整渲染。
2. 对话让 Agent"新建一个登录页" → Agent 写入 `login.html` → 对话流自动出现预览卡片 → 点"在面板中打开"。
3. "把主色改成深蓝" → Agent 修改 css → 300ms 后面板与卡片自动刷新呈现新配色，无手动操作。
4. 面板切 375px 手机尺寸 → 布局按移动端响应式呈现；"在系统浏览器打开" → 系统默认浏览器打开同一页面。
5. 恶意构造 `preview://<rootId>/../../Windows/system32/...` → 404；未注册 rootId → 404。
6. 会话切换 → 旧根 revoke → 面板自动关闭；切回原会话 → 重新注册，"最近预览"恢复。
7. Agent 删除入口 html → 面板出现"文件已不存在"占位，应用不崩溃。
