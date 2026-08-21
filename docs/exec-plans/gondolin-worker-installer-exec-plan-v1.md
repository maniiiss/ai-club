# Gondolin Worker 与安装器执行计划（v1）

> 配套设计文档：`docs/design-docs/gondolin-worker-installer-technical-design-v1.md`
> 范围：范围 A——全链路「造 worker + 安装器供给」，分阶段实现，每阶段可独立验证。

## 阶段 0：对齐与设计冻结
- [ ] 用户拍板 D3（平台范围，推荐 Windows/WSL2 独占）与 D2（网络默认策略：全拦 vs 白名单）。
- [ ] 锁定 host↔worker 协议字段（复用 `ToolExecutionRequest`/`ToolExecutionResult`）。
- [ ] 确认 `@earendil-works/gondolin` 在 WSL2 内的运行时依赖（是否仍需 QEMU/KVM、Node 最低版本）。
- 产出：本计划与前述设计文档定稿；`docs/architecture.md` 增补「增强隔离已落地」小节。

## 阶段 1：Worker 运行时（可单测、脱离 UI）
- [ ] 从 `examples/extensions/gondolin/index.ts` 提炼独立 worker 包 `gitpilot-cli/src/core/security/gondolin-worker/`。
- [ ] 实现 VM 创建、`/workspace` 挂载、host↔worker stdio JSON-lines 服务循环（握手帧含协议版本与 worker 版本）。
- [ ] 接入 6 类工具（read/write/edit/bash/find/grep/ls），复用 gitpilot-cli 自家 `src/core/tools/` tool factories（`options.operations` 注入换 VM 后端），不引入上游 `@earendil-works/pi-coding-agent`。
- [ ] 实现超时（120s 默认 / 600s 上限）与 abort，对齐现有策略。
- [ ] 单测：guest 内执行、越界写入隔离、`/workspace` 写回、超时/abort。
- 验证：`node` 直接启动 worker 跑通工具；单测全绿。

## 阶段 2：探针与执行接管（sandbox-executor.ts + rpc-mode.ts）
- [ ] `workerInstalled` 改为检查 distro 内固定路径 worker 入口（环境变量仅作 dev override）。
- [ ] 修复探针现存缺陷：`virtualizationReady` 硬编码 true；`wsl.exe` 输出 UTF-16LE 需按 utf16le 解码（现 utf8 解析不可靠）。
- [ ] worker 生命周期：initialize 握手健康检查、崩溃阻断并回传结构化错误、shutdown 终止帧 + 超时强杀。
- [ ] `SandboxStatus` 新增 `installState`/`installProgress`/`installError`。
- [ ] `GondolinExecutor.executeTool` 从 stub 改为经 host↔worker RPC 真正派发；`rpc-mode.ts` 接入 `sandboxExecutor.executeTool` 调用点。
- [ ] `set_security_policy` 切到 gondolin 时走真实初始化；失败仍结构化暴露、阻断。
- 验证：本地用 dev 环境变量 + 手动起 worker 跑通端到端工具执行；CLI 单测覆盖探针与阻断。

## 阶段 3：安装器供给（Desktop / Tauri，Windows/WSL2）
- [ ] 安装包 resources 内置：Node 静态 tarball（arch）、worker npm 离线包。
- [ ] 实现供给流程：探测 WSL2 → 缺失引导 `wsl --install`（提权/UAC 提示）→ 确保默认 distro（离线 `--import` Ubuntu）→ distro 内装 Node（离线优先）→ 安装 worker（离线 `npm ci`）→ 写入入口/注入 env → 重跑探针。
- [ ] 每步失败原因回传、可重试；不后台自动安装、不降级。
- [ ] 内置 Node tarball 与 worker 包安装前做哈希/签名校验（对齐 desktop-updater 签名姿态）。
- [ ] 版本协同：Desktop 更新后 worker 版本不匹配 → 探针提示「修复」重新供给。
- [ ] 离线包体积与安装耗时评估，必要时改用按需下载 + 签名校验。
- 验证：全新 Windows 沙箱（无 WSL2/Node）点 UI 安装后五项全绿。

## 阶段 4：UI 安装流程（SecuritySettings.tsx）
- [ ] 分阶段状态展示：未安装/检测中/安装中(进度)/就绪/失败(原因)。
- [ ] 「安装增强隔离」/「修复」按钮替换或并列「重新检测」。
- [ ] 安装中禁用切换、展示进度；失败原因 + 重试；风格对齐 `desktop-updater.ts`。
- 验证：UI 状态机单测 + 手动走通完整安装/失败/重试。

## 阶段 5：集成与发布门禁
- [ ] 跨服务启动验证：backend/frontend/frontend-public/code-processing 不受影响；Desktop 三种模式（原生/增强/降级阻断）均通过。
- [ ] `gitpilot-desktop`：`npm run test`（vitest）+ `npm run build`（tsc --noEmit && vite build）。
- [ ] `gitpilot-cli` 相关单测。
- [ ] 更新 `docs/architecture.md` 与 `desktop-security-sandbox-technical-design-v1.md` 互相引用。
- [ ] `python scripts/check_encoding.py`（文档与代码变更后的最低门禁）。

## 依赖与顺序
阶段 1 → 2 → 3 → 4 → 5 串行；阶段 0 与全部并行前置。
阶段 3 强依赖阶段 1/2 的 worker 产物；阶段 4 强依赖阶段 3 的安装态字段。

## 验收（同设计文档第 10 节）
全新 Windows 机器仅点 UI 即可点亮增强隔离；五项探针全绿；工具在 VM 内执行；`/workspace` 写回、越界隔离、网络默认拦截；失败可重试且不降级；原生模式无回归。
