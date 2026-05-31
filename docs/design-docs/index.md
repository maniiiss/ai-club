# 设计文档索引

## 文档定位

本目录存放 AI Club 平台的正式设计方案文档，用于记录和指导系统架构、模块设计、技术选型等关键决策。

## 文档分类

### 核心理念

- [核心设计理念](core-beliefs.md) - 设计原则、设计底线、价值导向

### 架构设计

- [系统架构设计](../architecture.md) - 整体架构概览
- [执行中心流式架构](../execution-center-streaming-architecture-v1.md) - 流式任务执行架构

### 模块设计

- [API 管理设计](../generated/api-management-technical-design-v1.md) - API 工作台设计
- [GitLab 集成设计](../exec-plans/completed/gitlab-module.md) - 代码仓库集成
- [GitLab 代码结构](../generated/gitlab-code-structure-technical-design-v1.md) - 代码结构分析
- [服务器管理设计](../generated/server-management-technical-design-v1.md) - 服务器管理模块
- [记忆事实图设计](../exec-plans/completed/memory-fact-graph.md) - 知识图谱设计

### 移动端设计

- [移动端控制台设计](../generated/mobile-console-technical-design-v1.md) - 移动端适配方案

### CI/CD 集成

- [流水线提供者设计 v1](../generated/pipeline-woodpecker-provider-technical-design-v1.md)
- [流水线提供者设计 v2](../generated/pipeline-woodpecker-provider-technical-design-v2.md)

### 测试与质量

- [测试自动化平台设计](../generated/test-automation-platform-technical-design-v1.md) - 自动化测试设计
- [API 测试用例生成](../generated/api-ai-test-case-generation-technical-design-v1.md) - AI 测试用例生成

### 第三方集成

- [Yaade 集成设计](../generated/yaade-integration-technical-design-v1.md) - API 工具集成
- [Gitee 工作项同步](../generated/gitee-work-item-sync-technical-design-v1.md) - 工作项同步
- [Gitee 测试计划推送](../generated/gitee-test-plan-push-technical-design-v1.md) - 测试计划推送

### 智能体

- [Hermes 技能架构](../exec-plans/active/hermes-skill-architecture-v1.md) - 智能助手架构
- [模型 Token 用量设计](../generated/model-token-usage-technical-design-v1.md) - Token 计费设计

### 工程规范

- [编码指南](../encoding-guide.md) - 编码规范
- [权限模型设计](../current-permission-model.md) - 权限系统设计
- [结构化 Lint 设计](../structural-lint-design-v1.md) - 代码检查设计
- [Harness 最佳实践](../harness-best-practices.md) - 测试与验证最佳实践

## 文档规范

### 命名规则

- 文件名使用小写字母和连字符
- 版本号后缀: `-v1`, `-v2` 等
- 示例: `module-name-technical-design-v1.md`

### 文档模板
参考：[技术设计模板](../architecture-design-template.md) - 技术设计模板

*本索引自动更新，如有新增设计文档请同步维护。*
