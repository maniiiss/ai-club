# 跨智能体 Harness 架构说明

## 目标

本仓库用于维护一套仓库内可读的 harness 协议，使不同智能体在缺少平台专有技能支持时，仍能通过统一目录结构、入口文档、计划模板和校验脚本协作。

## 核心组成

- `AGENTS.md`
  - 提供短入口、硬约束和最小验证命令。
- `docs/agent-harness-contract.md`
  - 提供跨智能体主协议，约束信息源优先级、工作流程、文档落盘和验证规则。
- `docs/design-docs/index.md`
  - 提供正式设计导航。
- `docs/exec-plans/`
  - 提供执行计划与历史归档。
- `docs/references/`
  - 提供长参考资料入口。
- `docs/quality/`
  - 提供质量约束和校验覆盖说明。
- `scripts/validate_harness.py`
  - 提供轻量机械校验。
- `tests/test_validate_harness.py`
  - 提供脚本自动化回归。

## 关键链路

标准工作链路如下：

1. 智能体先读 `AGENTS.md`。
2. 再读 `docs/agent-harness-contract.md`。
3. 按任务需要读取架构文档、设计文档和执行计划。
4. 执行修改后运行 `scripts/validate_harness.py` 和测试。
5. 交付时记录验证结果和剩余风险。

## 设计边界

本仓库只约束“如何在仓库内表达和维护 harness”，不负责绑定任意单一平台的运行时能力。平台私有功能可以作为补充，但不应成为理解本仓库的前提。

## 后续演进方向

- 增加设计文档模板和计划模板。
- 增加基于 Git diff 的提示性检查。
- 增加索引覆盖率和计划字段完整性检查。
