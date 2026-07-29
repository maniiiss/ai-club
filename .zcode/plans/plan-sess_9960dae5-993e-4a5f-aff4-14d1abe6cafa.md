# 项目-任务会话模型实现方案

## 目标
会话列表分**项目**与**任务**两层：项目=工作目录（文件对话框选），任务=会话（可指定项目内子目录作 cwd），侧栏=项目下拉 + 任务列表。

## 概念映射
- **项目** = 工作目录绝对路径。文件选择对话框添加项目，localStorage 持久化。
- **任务** = 会话。任务 cwd = 项目根（默认）或项目内子目录（用户指定）。
- **任务列表** = 当前项目下所有会话（会话 cwd 在项目根前缀下）。
- **侧栏** = 顶部项目下拉（切换+添加） + 下方任务列表。

## 技术可行性（已确认）
- `SessionManager.create(cwd, sessionDir?)` sessionDir 可选（`session-manager.ts:1519`），不传则用 `getDefaultSessionDirPath(cwd)`。
- `newSession`（`agent-session-runtime.ts:223`）当前硬编码 `this.cwd`（236/245 行），加 `options.cwd` 即可按任意 cwd 重建 services + 会话目录。
- `SessionManager.listAll()`（`session-manager.ts:1653`）已能跨所有项目目录列会话，每条 `SessionInfo.cwd` 携带原始 cwd。
- `switch_session` 已支持跨 cwd 恢复（会话 header.cwd 自动变 runtime cwd，`session-manager.ts:1546`）。
- 当前 sidecar cwd=resources 是 bug（会话堆在 resources-cwd），本方案用 new_session cwd 指定真实项目目录修复。

## 改动清单

### A. gitpilot-cli（sidecar）— 让 new_session 带 cwd + list_sessions 跨项目
1. **`src/core/agent-session-runtime.ts`** `newSession(options)`（223-257 行）加 `cwd?: string`：
   - `const targetCwd = options?.cwd ?? this.cwd;`
   - `SessionManager.create(targetCwd)`（替换 236 行 `create(this.cwd, sessionDir)`，sessionDir 自动按 targetCwd 算）
   - `createRuntime({ cwd: targetCwd, ... })`（替换 245 行 `this.cwd`）
2. **`src/modes/rpc/rpc-types.ts`**：
   - `new_session` 加 `cwd?: string`
   - `list_sessions` 加 `scope?: "current" | "all"`
3. **`src/modes/rpc/rpc-mode.ts`**：
   - `new_session` case（435-442）透传：`runtimeHost.newSession({ parentSession: command.parentSession, cwd: command.cwd })`
   - `list_sessions` case（638-644）：`scope === "all"` 调 `SessionManager.listAll()`，否则 `SessionManager.list(getCwd, sessionDir)`

### B. gitpilot-desktop — dialog 插件 + 项目管理 + 侧栏重写
4. **Tauri dialog 插件**：
   - `src-tauri/Cargo.toml` 加 `tauri-plugin-dialog = "2"`
   - `src-tauri/src/main.rs` 注册 `.plugin(tauri_plugin_dialog::init())`
   - `src-tauri/capabilities/default.json` permissions 加 `"dialog:default"`
   - `package.json` 加 `@tauri-apps/plugin-dialog`，`npm install`
5. **项目管理（store/session.ts）**：
   - 状态加 `projects: { name: string; path: string }[]`、`currentProjectPath: string | null`
   - localStorage 持久化（key `gitpilot-desktop.projects`）+ 当前项目
   - actions：`addProject()`（调 `@tauri-apps/plugin-dialog` 的 `open({ directory: true })` 选目录）、`switchProject(path)`、`removeProject(path)`
   - 切换项目后 `refreshAll()`（listAll 拉取后按 currentProjectPath 前缀过滤任务）
6. **`src/rpc/bridge.ts`**：
   - `newSession(cwd?: string, parentSession?: string)` 加 cwd
   - `listSessions(scope?: "current" | "all")` 加 scope
7. **`src/store/session.ts`**：
   - `refreshAll` 的 list_sessions 用 `scope: "all"`，按 `currentProjectPath` 前缀过滤 `sessions`（`s.cwd.startsWith(projectPath)`）
   - `newSession` 传当前项目 cwd（或任务指定子目录）
   - 加 `loadMessages` 已有（切换会话回显）
8. **`src/components/SessionSidebar.tsx` 重写**：
   - 顶部：项目下拉（列出 projects，切换 switchProject）+「添加项目」按钮（addProject 弹 dialog）
   - 下方：当前项目的任务列表（sessions 过滤后，显示 name/firstMessage + 时间 + 消息数，点击 switchSession）
   -「新建任务」按钮：默认 cwd=当前项目根；可展开"工作目录"选择项目内子目录（dialog 选子目录）作为任务 cwd

## 实施顺序
1. gitpilot-cli：newSession cwd + list_sessions scope（3 文件）
2. dialog 插件：Cargo + main.rs + capabilities + package.json + npm install
3. 桌面版 types.ts/bridge.ts/session.ts/SessionSidebar.tsx
4. `tsc` 验证 → rebuild sidecar → 重启 tauri dev → 端到端验证

## 验证
- 添加项目（选目录如 D:\ai-club）→ 项目下拉出现
- 新建任务（cwd=项目根或子目录）→ 任务在项目目录运行（文件工具 ls 看到项目文件）
- 任务列表显示当前项目的会话（按 cwd 前缀过滤）
- 切换项目 → 任务列表变（不同项目的任务）
- 切换历史任务 → 跨项目恢复（runtime cwd 自动变该任务 cwd）
- 旧 resources-cwd 会话不属任何项目，前端过滤隐藏（或归"其他"）

## 风险/注意
- listAll 扫所有 sessions 目录，会话多时性能下降；MVP 接受，后续可缓存/分页。
- sidecar process.cwd() 仍 resources，但 new_session cwd 指定项目目录后，文件工具/会话归属项目目录（services cwd 生效，process.cwd 不影响）。
- 任务子目录选择 UI 增加复杂度，MVP 先做"新建任务可选指定子目录"（dialog 选目录，默认项目根）。
- 项目列表 localStorage 持久化，跨设备不同步（MVP 足够）。

## 不在本次范围
- 任务子目录的更细粒度管理（每个任务记忆子目录、子目录树浏览）
- 项目级配置（每个项目独立模型/凭据）
- 旧 resources 会话迁移