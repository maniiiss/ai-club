# 设计文档索引

## 文档定位

本目录存放 AI Club 平台的正式设计方案文档，用于记录和指导系统架构、模块设计、技术选型等关键决策。

## 文档分类

### 核心理念

- [核心设计理念](core-beliefs.md) - 设计原则、设计底线、价值导向

### 架构设计

- [系统架构设计](../architecture.md) - 整体架构概览
- [执行中心流式架构](execution-center-streaming-architecture-v1.md) - 流式任务执行架构

### 模块设计

- [公众 SaaS 前端设计](public-saas-frontend-technical-design-v1.md) - 公众端产品信息架构与前端边界
- [公众端积分扣费设计](public-credit-technical-design-v1.md) - 公众端积分账户、流水和 AI 消费扣减
- [公众端技术设计 AI Runtime 设计](public-technical-design-ai-runtime-technical-design-v1.md) - 基于 GitNexus 与成熟 Agent Runtime 的技术设计生成链路
- [GitPilot 多运行时智能体技术设计](gitpilot-multi-runtime-technical-design-v1.md) - GitPilot 产品入口、Pi Runtime 接入、运行时能力适配与 Hermes 渐进迁移方案
- [GitPilot CLI 云端开发接力技术设计](gitpilot-cli-cloud-coding-handoff-technical-design-v1.md) - 内嵌 Pi Agent Core 的本地 Coding CLI、工作区与会话接力、云端 Codex Runtime 及安全结果回传
- [AgentRuntime 统一聊天流式技术设计](agent-runtime-chat-streaming-technical-design-v1.md) - 多 Runtime 的 NDJSON 事件协议、Backend 转发和流式降级策略
- [原生 API 工作台设计](api-studio-native-technical-design-v1.md) - 平台原生 API 资产与调试工作台
- [API 管理设计](api-management-technical-design-v1.md) - API 工作台设计
- [GitLab 集成设计](../exec-plans/completed/gitlab-module.md) - 代码仓库集成
- [GitLab 代码结构](gitlab-code-structure-technical-design-v1.md) - 代码结构分析
- [GitLab 业主仓库推送](gitlab-owner-repo-push-technical-design-v1.md) - 代码推送到业主 GitLab 仓库
- [服务器管理设计](server-management-technical-design-v1.md) - 服务器管理模块
- [DataWorkbench 设计](data-workbench-technical-design-v1.md) - 项目内数据变更工作台
- [DataWorkbench 语义查询设计](data-workbench-semantic-query-technical-design-v1.md) - 动态 PostgreSQL 数据源、语义层与自然语言只读查询
- [聊天室设计](chat-room-technical-design-v1.md) - 项目聊天室与房间级 Agent

### 移动端设计

- [移动端控制台设计](mobile-console-technical-design-v1.md) - 移动端适配方案

### CI/CD 集成

- [流水线提供者设计 v1](pipeline-woodpecker-provider-technical-design-v1.md)
- [流水线提供者设计 v2](pipeline-woodpecker-provider-technical-design-v2.md)

### 测试与质量

- [测试自动化平台设计](test-automation-platform-technical-design-v1.md) - 自动化测试设计
- [API 测试用例生成](api-ai-test-case-generation-technical-design-v1.md) - AI 测试用例生成
- [模型对比测试设计 v1](model-benchmark-technical-design-v1.md) - 模型 Benchmark 第一版设计
- [模型对比测试设计 v2](model-benchmark-technical-design-v2.md) - 模型 Benchmark 配置与运行拆分

### 第三方集成

- [Gitee 工作项同步](gitee-work-item-sync-technical-design-v1.md) - 工作项同步
- [Gitee 测试计划推送](gitee-test-plan-push-technical-design-v1.md) - 测试计划推送

### 智能体

- [Hermes 技能架构](../exec-plans/active/hermes-skill-architecture-v1.md) - 智能助手架构
- [模型 Token 用量设计](model-token-usage-technical-design-v1.md) - Token 计费设计
- [智能体调用量统计](agent-invocation-tracking-technical-design-v1.md) - 智能体调用统计

### 工程规范

- [编码指南](../encoding-guide.md) - 编码规范
- [权限模型设计](current-permission-model.md) - 权限系统设计
- [结构化 Lint 设计](structural-lint-design-v1.md) - 代码检查设计
- [Harness 最佳实践](../harness-best-practices.md) - 测试与验证最佳实践

## 文档规范

### 命名规则

- 文件名使用小写字母和连字符
- 版本号后缀: `-v1`, `-v2` 等
- 示例: `module-name-technical-design-v1.md`

### 文档模板
参考：[技术设计模板](architecture-design-template.md) - 技术设计模板

*本索引自动更新，如有新增设计文档请同步维护。*
