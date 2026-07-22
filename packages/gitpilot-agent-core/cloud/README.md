# Cloud Coding Relay（已停车，P2）

本目录是从早期 `gitpilot-cli` 迁出的云端接力相关代码，当前**不参与构建与测试**，作为后续 P2 `cloud-handoff` extension 的素材保留：

- `gitstate/snapshot.ts`：使用临时 `GIT_INDEX_FILE` 生成零污染 Git 接力提交。
- `handoff/envelope.ts`：`HandoffSessionEnvelope` v1 校验的 CLI 薄包装（实际协议逻辑在 `../src/index.mjs`）。
- `tests/`：上述逻辑的单测，迁移后导入路径未同步，需在接入 extension 时一并修正。

后续接入方式：作为 Pi extension 调用 `@aiclub/gitpilot-agent-core` 的 `validateHandoffSessionEnvelope`，遵循 `docs/design-docs/gitpilot-cli-cloud-coding-handoff-technical-design-v1.md` 的本地零污染与 Sandbox Worker 边界。
