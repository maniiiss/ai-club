# GitPilot CLI

GitPilot CLI 是基于 [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi-mono) v0.81.1 二开的本地 Coding Agent，核心仍是 Pi：开箱即用 Pi 的交互式 TUI、`read`/`write`/`edit`/`bash`/`grep`/`find`/`ls` 内置工具、树形会话管理、扩展、技能与主题，并内置 GitPilot 平台对接 extension。

## 定位

- **本地 Coding Agent**：直接复用 Pi 的 Agent 循环、工具与 TUI，运行在用户本地仓库。
- **平台模型网关**：通过设备授权登录 AI Club 平台，用平台已配置的 CHAT 模型推理，复用平台模型治理与用量统计。
- **可扩展**：平台对接以 Pi extension 形式实现，不侵入核心；后续云端接力等能力同样以 extension 接入。

## 环境要求

- Node.js ≥ 22.19（pi-coding-agent 0.81.1 要求）。

## 安装（开发）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-gitpilot-cli.ps1
```

安装器只安装并构建 CLI、注册 `gitpilot` 命令、把平台地址写入 `~/.gitpilot/agent/platform.json`，不会启动后端或前端。

如果平台地址不是默认的 `http://localhost:8080`：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-gitpilot-cli.ps1 -PlatformUrl https://gitpilot.example.com
```

## 使用

```text
gitpilot                      # 在当前仓库启动交互式 Coding Agent
gitpilot exec -p "指令"        # 单轮非交互执行
```

进入交互式 GitPilot 后，输入 `/` 呼出命令菜单。平台对接命令：

- `/gitpilot login [平台地址]`：设备授权登录，长期令牌保存在系统凭据库。
- `/gitpilot logout`：撤销并清除令牌。
- `/gitpilot status`：查看当前登录状态。

登录后通过 `/model`（或 Ctrl+L）选择平台模型即可开始推理；模型会话令牌（`gms_`）短期签发并自动续期，上游真实密钥与模型地址不进入本地。

## 平台地址配置

优先级：环境变量 `GITPILOT_PLATFORM_URL` > `~/.gitpilot/agent/platform.json` > `/gitpilot login` 时输入。

## 凭据与安全边界

- CLI Token（`gpt_`）写入操作系统凭据库（Windows Credential Manager / macOS Keychain / Linux Secret Service），不写入项目目录、会话 JSON 或日志。
- 平台短期模型会话令牌（`gms_`）只在当前进程使用，临近过期自动重建。
- 本地文件与 Shell 工具继承 Pi 的仓库范围与确认策略。

## 目录结构（GitPilot 二开部分）

```text
src/extensions/gitpilot/
  config.ts          # 平台地址配置（~/.gitpilot/agent/platform.json）
  credentials.ts     # gpt_ token 的 keyring 存取与进程内缓存
  api.ts             # 平台 CLI HTTP 客户端（设备授权 / 模型会话 / 模型清单）
  session-cache.ts   # gms_ 模型会话缓存（带 TTL 自动重建）
  platform-auth.ts   # /gitpilot login|logout|status 命令
  platform-model.ts  # gitpilot provider + streamSimple 接平台模型代理
  index.ts           # 内置 extension 入口
```

该 extension 在 `src/extensions/index.ts` 的 `builtInExtensions` 中注册，随源码编译并默认加载，无需用户手动放置扩展文件。

## 升级与维护

源码 fork 自 pi-mono `v0.81.1`（tag `v0.81.1`）。后续 Pi 升级需手动 merge 上游改动；品牌通过 `package.json` 的 `piConfig: { name: "gitpilot", configDir: ".gitpilot" }` 派生，少量硬编码字面量（系统提示词、User-Agent、自更新地址等）已改为 GitPilot。
