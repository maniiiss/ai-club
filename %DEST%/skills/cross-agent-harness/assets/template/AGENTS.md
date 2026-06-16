# 跨智能体 Harness 仓库入口

## 目标

本仓库用于沉淀一套不依赖单一平台运行时的 harness 协议，让不同智能体通过读取仓库文件理解同一套入口、文档分层、计划约束与验证方式。

## 先看这里

- 通用工作协议：`docs/agent-harness-contract.md`
- 系统级事实源：`docs/architecture.md`
- 正式设计导航：`docs/design-docs/index.md`
- 进行中执行计划：`docs/exec-plans/active/`
- 已完成计划归档：`docs/exec-plans/completed/`

## 硬约束

- 所有文档、脚本和代码使用 UTF-8 无 BOM 保存。
- 入口文档保持精简，不把长篇设计、排障和历史背景塞进 `AGENTS.md`。
- 设计、计划、架构决策和验证方式必须落到仓库文件，不能只存在聊天记录中。
- 新增正式设计文档后，必须同步更新 `docs/design-docs/index.md`。
- 修改协议、入口、目录或验证脚本后，必须运行 harness 校验命令。

## 目录地图

- `docs/agent-harness-contract.md`：跨智能体通用工作协议。
- `docs/architecture.md`：系统级架构与边界说明。
- `docs/design-docs/`：正式设计文档导航。
- `docs/exec-plans/`：执行计划与归档。
- `docs/references/`：长参考资料入口。
- `docs/quality/`：文档质量、校验范围与维护规则。
- `scripts/`：仓库校验脚本。
- `tests/`：脚本自动化测试。

## 常用验证

- `python scripts/validate_harness.py`
- `python -m pytest tests/test_validate_harness.py -q`

## 交付要求

- 说明改动内容。
- 说明验证命令和结果。
- 说明未覆盖风险。
