# GitPilot 检索工具开箱即用技术设计 v1

## 背景

桌面端 Agent 执行代码检索（如 `grep -rli "keyword"`）极慢。排查结论：

1. **默认工具集未包含检索工具**：`gitpilot-cli` 的 `createAgentSession` 默认工具集为 `[read, bash, edit, write]`，内置 grep/find/ls 工具（基于 rg/fd，尊重 .gitignore、命中即停）从未启用，系统提示词反而引导"Use bash for file operations like ls, rg, find"。
2. **用户机器无 rg**：bash 环境无 rg 时模型退回 `grep -r`，不认识 .gitignore，对含 node_modules 的项目全量扫描（实测 24 万文件 / 7.4 GB，其中 95% 为依赖与构建产物）。
3. **运行时自下载不可靠**：`ensureTool("rg")` 的下载链路（GitHub API + releases 直连、Node fetch 不走系统代理）在国内网络间歇性失败（实测同终端一次成功一次 10s 超时），失败后静默，rg 永远缺失。

## 方案

### 1. 默认启用检索工具（gitpilot-cli）

- `src/core/sdk.ts`、`src/core/agent-session.ts`、`src/core/system-prompt.ts` 三处默认工具列表统一追加 `grep / find / ls`。
- Agent 优先调用内置 grep 工具（rg 内核），搜索行为由工具层保证，不依赖模型自觉。

### 2. rg/fd 预置进安装包（核心，免用户下载）

查找优先级（`src/utils/tools-manager.ts` 的 `getToolPath`）：

```
① PI_PACKAGE_DIR/bin     安装包预置（Tauri resources/bin），零网络依赖
② ~/.gitpilot/agent/bin  共享 bin 目录（历史上自下载/手动安装的落点）
③ 系统 PATH
④ GitHub 下载兜底        仅前三级都未命中时触发
```

- 桌面端 sidecar 启动时已有 `PI_PACKAGE_DIR` 环境变量（`src-tauri/src/sidecar.rs`，指向 Tauri 资源根），预置二进制放 `resources/bin/` 即被 ① 命中。
- 打包链路（`gitpilot-desktop/scripts/build-release-oneclick.ps1` 第 5.5 步）：优先从打包机 `~/.gitpilot/agent/bin` 复制，缺失则从 GitHub 下载；rg 预置失败强制终止打包，fd 失败仅警告（运行时可回退自下载）。
- `tauri.conf.json` 的 resources 增加 `resources/bin/*`。

### 3. bash 环境同步开箱可用（gitpilot-cli）

`src/utils/shell.ts` 的 `getShellEnv` 把 `PI_PACKAGE_DIR/bin` 与共享 bin 目录一并前置注入 bash 的 PATH，模型在 bash 里直接敲 `rg`/`fd` 同样可用。

### 4. GUI 进程树防黑框

`grep.ts` / `find.ts` 的 spawn 增加 `windowsHide: true`，避免桌面端每次调用 rg/fd 闪控制台窗口。

## 影响范围

| 仓库 | 文件 | 变化 |
|---|---|---|
| gitpilot-cli | src/core/sdk.ts | 默认工具集 + 后台预下载 rg（静默兜底） |
| gitpilot-cli | src/core/agent-session.ts | 默认工具列表同步 |
| gitpilot-cli | src/core/system-prompt.ts | 默认工具列表同步 |
| gitpilot-cli | src/utils/tools-manager.ts | getToolPath 增加 PI_PACKAGE_DIR/bin 最高优先级 |
| gitpilot-cli | src/utils/shell.ts | getShellEnv 注入资源 bin 目录 |
| gitpilot-cli | src/core/tools/grep.ts / find.ts | spawn 加 windowsHide |
| gitpilot-desktop | src-tauri/tauri.conf.json | resources 加 bin/* |
| gitpilot-desktop | scripts/build-release-oneclick.ps1 | 新增 5.5 预置步骤 |
| gitpilot-desktop | src-tauri/resources/bin/ | 预置 rg.exe / fd.exe（构建时生成，不入库） |

## 已知边界

- macOS 打包未加预置步骤：走 ②③④ 兜底链，行为不劣于现状；后续可在 mac 打包脚本补齐。
- rg 的 `.gitignore` 尊重依赖目标目录是 git 仓库（或存在 `.ignore`）；非 git 目录可用 `--glob '!**/node_modules/**'` 兜底（规划中的 P1 加固项）。
- SDK 层 `void ensureTool("rg", true)` 预下载保留：非安装包场景（独立 CLI）仍需自下载能力。
