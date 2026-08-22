# 设计文档索引

## 文档定位

本目录存放 AI Club 平台的正式设计方案文档，用于记录和指导系统架构、模块设计、技术选型等关键决策。

## 文档分类

- [GitPilot Work 协同技术设计](gitpilot-work-collaboration-technical-design-v1.md) - 独立任务目录、文件产出与公众端协同插件
- [GitPilot Work Office Skills 技术设计](gitpilot-work-office-skills-technical-design-v1.md) - Work 模式 Word、Excel、PowerPoint 内置 Skill 与受控本地生成工具
- [GitPilot Web 与 MCP 扩展技术设计](gitpilot-web-mcp-extensions-technical-design-v1.md) - Web 研究、MCP 模式授权、Desktop/CLI 管理与凭据边界

### 核心理念

- [核心设计理念](core-beliefs.md) - 设计原则、设计底线、价值导向

### 架构设计

- [系统架构设计](../architecture.md) - 整体架构概览
- [执行中心流式架构](execution-center-streaming-architecture-v1.md) - 流式任务执行架构

### 模块设计

- [公众 SaaS 前端设计](public-saas-frontend-technical-design-v1.md) - 公众端产品信息架构与前端边界
- [公众端积分扣费设计](public-credit-technical-design-v1.md) - 公众端积分账户、流水和 AI 消费扣减
- [公众端技术设计 AI Runtime 设计](public-technical-design-ai-runtime-technical-design-v1.md) - 基于 GitNexus 与成熟 Agent Runtime 的技术设计生成链路
- [GitPilot 多运行时智能体技术设计](gitpilot-multi-runtime-technical-design-v1.md) - GitPilot 产品入口、Pi Runtime 接入、运行时能力适配与 Assistant 渐进迁移方案
- [GitPilot CLI 云端开发接力技术设计](gitpilot-cli-cloud-coding-handoff-technical-design-v1.md) - 内嵌 Pi Agent Core 的本地 Coding CLI、工作区与会话接力、云端 Codex Runtime 及安全结果回传
- [GitPilot 桌面版技术设计](gitpilot-desktop-technical-design-v1.md) - Tauri 2 + React + bun sidecar 三进程模型，复用 RPC 协议只换 UI 层，类 Codex 原生 GUI 编码助手
- [GitPilot CLI 会话执行快照与 Desktop 恢复技术设计](gitpilot-cli-session-execution-snapshot-technical-design-v1.md) - CLI Core 统一维护多任务运行快照、精确耗时和事件游标，Desktop 通过兼容 RPC 在切换与重连后恢复执行状态
- [GitPilot Desktop shadcn UI 整体替换技术设计](gitpilot-desktop-shadcn-ui-replacement-technical-design-v1.md) - 基于 Radix、Mira 和 Tailwind v4 重建桌面渲染层，保留 Tauri/RPC/Agent 行为契约并分阶段迁移
- [GitPilot Desktop Git 与代码审查工作台技术设计](gitpilot-desktop-git-review-workbench-technical-design-v1.md) - 受限 sidecar Git、不可变审查快照、结构化 finding、平台治理与 GitLab 显式发布
- [GitPilot Desktop Code 模式右侧栏 Git 面板技术设计](gitpilot-desktop-code-git-panel-technical-design-v1.md) - 工作台方案的本地 Git 落地收敛版：sidecar 受限 core/git 服务、类型化 git_* RPC、右侧栏 Git 页签与文件树状态联动
- [GitPilot Desktop Code 模式右侧栏 Git 面板技术设计 v2](gitpilot-desktop-code-git-panel-technical-design-v2.md) - 提交范围自动跳过误跟踪（已跟踪但命中 .gitignore）文件、git_untrack_paths 解除跟踪命令与面板分组
- [GitPilot Desktop 云端发布与在线升级技术设计](gitpilot-desktop-release-update-technical-design-v1.md) - Windows x64 stable 已签名产物发布、公开下载、Tauri updater 和安全安装重启
- [GitPilot Work 技术设计](gitpilot-work-technical-design-v1.md) - Code/Work 双模式、本机任务空间与受控联网研究
- [GitPilot Desktop WORK 模式能力协同技术设计](gitpilot-desktop-work-delegation-technical-design-v1.md) - WORK 模式双路径协同：HTML 原型走内置技能自建（同 Office 技能模式），专业设计稿走 delegate_design 阻塞式工具委托 DESIGN 子会话，delegate_code 协议预留给未来
- [GitPilot Desktop HTML 预览技术设计](gitpilot-desktop-html-preview-technical-design-v1.md) - CODE/WORK 模式浏览器接入：Tauri preview:// 自定义协议 + 授权根注册 + iframe sandbox，对话卡片与独立面板双入口，文件变更防抖自动刷新，v1 主做 CODE 模式
- [GitPilot Desktop AI UI 设计编辑器技术设计](gitpilot-desktop-ai-ui-design-editor-technical-design-v1.md) - 单人结构化设计文档、DOM/CSS 画布、AI DesignPatch 与 Canvas/协作演进边界
- [GitPilot Pi 生产力扩展技术设计](gitpilot-pi-productivity-extensions-technical-design-v1.md) - 内置 slopchop、goal、plan-mode、subagents、pi-rtk-optimizer 的 CLI/Desktop 双宿主适配、离线打包、自主委派边界与命令重写/输出压缩
- [GitPilot Plannotator Desktop 原生适配技术设计](gitpilot-plannotator-desktop-integration-technical-design-v1.md) - Plannotator 计划清单、Desktop 右侧计划 Tab、原生审核与执行进度事件
- [GitPilot 提问执行引导 P0 技术设计](gitpilot-execution-guidance-p0-technical-design-v1.md) - CLI 与 Desktop 的立即引导、完成后追加、队列展示和停止清队列语义
- [AgentRuntime 统一聊天流式技术设计](agent-runtime-chat-streaming-technical-design-v1.md) - 多 Runtime 的 NDJSON 事件协议、Backend 转发和流式降级策略
- [原生 API 工作台设计](api-studio-native-technical-design-v1.md) - 平台原生 API 资产与调试工作台
- [API 管理设计](api-management-technical-design-v1.md) - API 工作台设计
- [GitLab 集成设计](../exec-plans/completed/gitlab-module.md) - 代码仓库集成
- [GitLab 代码结构](gitlab-code-structure-technical-design-v1.md) - 代码结构分析
- [GitLab 仓库镜像推送](gitlab-owner-repo-push-technical-design-v1.md) - 代码推送到镜像 GitLab 仓库
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

- [Assistant 技能架构](../exec-plans/active/assistant-skill-architecture-v1.md) - 智能助手架构
- [模型 Token 用量设计](model-token-usage-technical-design-v1.md) - Token 计费设计（已 superseded，改用复用 agent_invocation_log）
- [平台模型调用量统计设计](platform-model-usage-stats-technical-design-v1.md) - 模型为中心的平台级看板，补齐流式对话与 code-processing 覆盖盲区
- [模型调用量缓存命中统计设计](model-usage-cache-hit-stats-technical-design-v1.md) - 缓存命中率与命中 token 数的采集、聚合与看板展示
- [智能体调用量统计](agent-invocation-tracking-technical-design-v1.md) - 智能体调用统计
- [积分与 Token 关联及智能体计费设计](credit-token-agent-billing-technical-design-v1.md) - 模型 token 定价、智能体按 token 计费（预扣+终态结算）、激活 cost_credits 建立 token 与积分关联
- [模型 Token 计费管理端 UI 设计](model-token-billing-console-ui-v1.md) - 模型管理页 token 计费配置入口、列表计费状态列、积分管理页 TOKEN_BASED 规则标注
- [GitPilot CLI 模型会话 Token 计费设计](cli-model-session-token-billing-v1.md) - CLI/Desktop 模型调用按实际 token 即时扣积分，复用 ModelPricingService/CreditService
- [GitPilot 桌面端非多模态模型图片识别 fallback 技术设计](gitpilot-image-vision-fallback-technical-design-v1.md) - 9router 代理感知 + full-turn multimodal routing + 本地 OCR 三层 fallback，解决非多模态模型上传图片被丢弃问题

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

### Design Mode

- [GitPilot Desktop Design Mode 技术设计 v1](gitpilot-desktop-design-mode-technical-design-v1.md) - 基于自然语言生成 HTML 原型，支持移动端/桌面端预览，并规划多人协作与设计师画板演进
- [GitPilot Desktop Design Mode 流式执行技术设计 v2](gitpilot-desktop-design-mode-streaming-technical-design-v2.md) - 独立 Design Agent 会话、结构化 patch、实时预览、审批、恢复与 Design 专属队列
- [GitPilot Desktop Design Mode 绘制与画板实时渲染技术设计 v1](gitpilot-desktop-design-mode-live-render-technical-design-v1.md) - 基于 CanvasKit 单画布的 AI 增量 patch、手绘 transient、RAF 帧调度、草稿恢复与正式 revision 收口
- [GitPilot Desktop Design Mode 多项目与多文件技术设计 v1](gitpilot-desktop-design-mode-multi-project-multi-file-technical-design-v1.md) - 项目级 Design Workspace、页面树/文件树、canonical manifest、多项目事件隔离与受控预览
- [GitPilot Desktop Design Mode 项目级设计规范技术设计 v1](gitpilot-desktop-design-mode-project-guidelines-technical-design-v1.md) - 项目独立的品牌、Token、组件、交互和可访问性约束，以及规范恢复与 Agent 注入链路
- [Design 上下文压缩技术设计 v1](design-compaction-technical-design-v1.md) - Pi 默认摘要格式复用、Design 页面事实压缩提示、RPC 状态投影与 Desktop 三态文案

*本索引自动更新，如有新增设计文档请同步维护。*
