# GitPilot 桌面版

GitPilot CLI 的原生 GUI 桌面版，采用 **Tauri 2 + React 19 + bun sidecar** 三进程架构，复用 `gitpilot-cli` 的 RPC 核心（pi-agent-core 循环 + 工具 + 平台对接 extension + 凭据），只把 UI 层从 pi-tui 终端渲染换成原生图形界面。定位为"类 Codex"的桌面编码助手。

完整设计与决策依据见 [`docs/design-docs/gitpilot-desktop-technical-design-v1.md`](../docs/design-docs/gitpilot-desktop-technical-design-v1.md)。

## 架构

```text
┌──────────────────────────────────────────┐
│  Tauri 主进程 (Rust, 极薄)               │
│  窗口 / sidecar 生命周期 / IPC 白名单转发 │
└──────────┬───────────────────┬───────────┘
   stdin(JSONL)            Tauri IPC
           ▼                    ▼
┌────────────────────┐   ┌─────────────────────┐
│ Agent sidecar(bun)│   │ React 渲染层 (WebView)│
│ gitpilot --mode rpc│   │ 会话/流式/卡片/平台集成│
│ pi-agent-core 循环 │   └─────────────────────┘
│ 平台对接 extension │
└─────────┬──────────┘
          │ HTTPS
          ▼
   AI Club 平台 (模型网关/用量统计/设备授权)
```

三进程职责严格隔离：Rust 零业务纯转发，所有 agent 与平台对接逻辑在 sidecar 内，React 纯 UI。agent 核心通过现成的 JSONL RPC 协议复用（`gitpilot-cli/src/modes/rpc/`）。

## 前置环境

| 工具 | 版本 | 用途 |
|---|---|---|
| Node.js | ≥ 22 | 前端构建 |
| bun | ≥ 1.3 | 编译 sidecar 单文件 |
| Rust + MSVC Build Tools | stable | 编译 Tauri 主进程（**当前未安装，待装**） |

> bun 已通过 spike 验证可编译含 native 模块（`@napi-rs/keyring`、`photon-node`）的 `rpc-entry` 为单文件并成功响应 RPC。详见设计文档第 13.1 节。

## 目录结构

```text
gitpilot-desktop/
├── src/                      # React 渲染层
│   ├── rpc/                  # RPC 类型 + Tauri IPC 桥接
│   ├── store/                # Zustand 会话状态 + 事件订阅
│   ├── components/           # 侧栏/对话/卡片/命令面板/模型选择/扩展模态
│   └── styles/               # 深色主题令牌
├── src-tauri/                # Rust 主进程
│   ├── src/{main,sidecar,commands}.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── binaries/             # sidecar 产物（gitignore）
│   └── resources/            # sidecar 运行时资源（theme/export-html）
├── sidecar/build.sh          # 编译 sidecar + 复制资源
└── package.json
```

## 开发

### 1. 安装前端依赖

```bash
cd gitpilot-desktop
npm install
```

### 2. 仅前端预览（无需 Rust，走 mock）

未装 Rust 时可先预览 UI。桥接层检测到非 Tauri 环境会注入 mock 数据：

```bash
npm run dev   # 访问 http://localhost:1420
```

### 3. 构建并预览真实 sidecar（需 bun）

```bash
bash sidecar/build.sh                              # 编译 sidecar + 复制资源
cd .tmp-spike && printf '{"id":"1","type":"get_state"}\n' | ./gitpilot-rpc.exe
```

### 4. 完整桌面应用（需 Rust + MSVC）

```bash
npm run tauri dev     # 开发模式，热重载
npm run tauri build   # 生产构建，产出 src-tauri/target/release 下的安装包
```

### Windows 一键生成发布上传包

双击 `scripts/build-release-windows.cmd`，或在 `gitpilot-desktop` 目录执行：

```powershell
.\scripts\build-release-windows.cmd
```

脚本会检查三处版本号、Tauri sidecar、签名密钥和发布端点，然后构建 MSI、NSIS 以及带 `.sig` 的 updater ZIP，最后整理到：

```text
gitpilot-desktop\release-artifacts\<版本号>\
```

首次运行找不到签名私钥时会询问是否生成。私钥默认保存在 `%USERPROFILE%\.tauri\gitpilot.key`，只用于本机签名，绝对不要上传；公钥会由脚本通过临时配置注入构建结果。也可以显式指定发布地址：

```powershell
.\scripts\build-release-windows.ps1 -ApiBaseUrl https://你的平台域名
```

生成目录中的六类文件分别上传到管理端“桌面版本发布”页面：MSI 安装器、MSI updater ZIP、MSI `.sig`、NSIS 安装器、NSIS updater ZIP、NSIS `.sig`。如果只想整理已有构建结果，可使用 `-SkipBuild`。

## 当前状态

- ✅ 设计文档已落地并通过 spike 验证
- ✅ React 渲染层骨架完成：会话侧栏、流式对话、代码交互卡片、命令面板、模型选择、扩展 UI 模态、登录门、深色主题
- ✅ Tauri IPC 桥接层完成：命令 id 关联、超时、事件分流、mock 模式
- ✅ Rust 主进程骨架完成：SidecarBridge、IPC 白名单转发、capabilities（**待装 Rust 编译验证**）
- ✅ sidecar 打包脚本完成
- ⏳ 待用户安装 Rust + MSVC 后编译 Rust 部分并端到端联调
- ⏳ 平台分发端点接口契约待与后端对齐（设计文档第 15.1 节）

## 安全边界

- Tauri capabilities 白名单：渲染层不开放 fs/shell/exec，所有文件与命令能力只能经 sidecar 的 agent 工具走，继承 pi 的仓库范围与确认策略
- token（`gpt_`/`gms_`）只在 sidecar 进程，不进 IPC、不进渲染层、不进日志
- 严格 CSP，禁用远程资源；渲染层不直接发 HTTPS
