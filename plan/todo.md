# 待办清单

## 任务管理与 Hermes 工具集成

### 背景

- 现有 `task_info` 实际已承载“工作项”语义，包含需求、任务、缺陷、迭代、关联需求、计划时间等信息。
- 现有任务管理页与迭代工作项页存在职责重叠，需要重构为“工作项中心 + 执行中心”。
- Hermes 当前更偏向上下文助手，后续需要扩展为“意图识别 + 工具调用入口”，但业务真相仍由平台自身负责。
- 目标场景示例：
  `帮我创建一个需求，内容是 xxx，派给 xxx`

### 一、概念与边界梳理

- [ ] 明确并统一领域概念：工作项 `WorkItem`、执行任务 `ExecutionTask`、执行运行 `ExecutionRun`
- [ ] 将现有“任务管理”页面重新定位为“执行中心”，避免与项目工作项中心重复
- [ ] 明确 Hermes、平台业务服务、Agent Runtime 的职责边界
- [ ] 明确“聊天问答”和“业务动作执行”的边界，避免 Hermes 直接承担业务落库职责

### 二、执行中心设计

- [ ] 设计 `execution_task` 数据表，承载执行任务定义
- [ ] 设计 `execution_run` 数据表，承载一次执行实例
- [ ] 设计 `execution_step` 数据表，支持多阶段、多智能体编排
- [ ] 设计 `execution_artifact` 数据表，沉淀报告、链接、文件等执行产物
- [ ] 设计执行状态机：草稿、待执行、执行中、成功、失败、已取消
- [ ] 设计重试、取消、审计、进度查询能力

### 三、兼容现有能力迁移

- [ ] 评估现有 `task_agent_run_log` 的迁移与兼容方案
- [ ] 保留现有 `/api/tasks/{id}/agent-runs` 接口，对内代理到新的执行中心
- [ ] 梳理 [TaskAgentRunService](C:/Users/dlhxy/Downloads/Programs/git-ai-club/backend/src/main/java/com/aiclub/platform/service/TaskAgentRunService.java) 可复用逻辑，抽到执行调度层
- [ ] 拆分过大的 [PlatformStoreService](C:/Users/dlhxy/Downloads/Programs/git-ai-club/backend/src/main/java/com/aiclub/platform/service/PlatformStoreService.java)

### 四、前端页面重构

- [ ] 将 [TaskView.vue](C:/Users/dlhxy/Downloads/Programs/git-ai-club/frontend/src/views/TaskView.vue) 重构为“执行中心”
- [ ] 保持 [IterationView.vue](C:/Users/dlhxy/Downloads/Programs/git-ai-club/frontend/src/views/IterationView.vue) 作为“工作项中心”
- [ ] 在工作项详情中增加“发起执行任务”入口
- [ ] 在执行中心展示来源工作项、执行 Agent、状态、最近运行、发起人、产物摘要
- [ ] 补充执行详情页或执行详情抽屉，支持查看步骤日志与产物

### 五、Hermes 动作化改造

- [ ] 为 Hermes 响应增加 `actions` 结构，不再只返回文本、引用和建议问题
- [ ] 设计 `HermesActionPlannerService`，负责把自然语言意图转换为平台动作
- [ ] 设计动作确认机制，避免高风险动作直接自动执行
- [ ] 将 Hermes 从“问答助手”扩展为“问答 + 动作建议 + 动作发起入口”
- [ ] 保持 Hermes 不直接改业务数据，只调用平台标准工具接口

### 六、工具体系设计

- [ ] 设计统一工具注册与执行框架：`ToolRegistry / ToolExecutor`
- [ ] 设计只读工具：项目、成员、迭代、工作项、Agent 查询
- [ ] 设计写入工具：创建工作项、更新工作项、指派负责人、创建执行任务
- [ ] 设计外部集成工具：GitLab、Jenkins、Webhook 等
- [ ] 设计工具执行审计、幂等、权限校验、错误回传机制

### 七、自然语言业务动作支持

- [ ] 支持示例指令：`帮我创建一个需求，内容是 xxx，派给 xxx`
- [ ] 支持从当前页面上下文自动补齐 `projectId / iterationId / taskId`
- [ ] 支持按昵称、用户名、项目成员列表匹配负责人
- [ ] 支持存在歧义时由 Hermes 追问确认，而不是错误落库
- [ ] 支持创建需求后继续推荐下一步动作，例如“是否继续拆解为开发任务”

### 八、需求创建流程优化

- [ ] 将“需求草稿创建”与“需求正式提交”拆成两阶段
- [ ] 放宽自然语言创建需求时的最低输入要求，允许先创建草稿
- [ ] 保留正式提交时对原型链接、模板结构、状态流转的严格校验
- [ ] 评估现有需求模板规则对工具调用链路的影响

### 九、执行调度与进度回传

- [ ] 第一阶段先使用数据库队列 + 轮询调度
- [ ] 第二阶段补充 SSE 或 WebSocket 实时进度回传
- [ ] 支持执行百分比、当前步骤、开始时间、结束时间、失败原因展示
- [ ] 支持后续扩展 tokens、耗时、费用等运行指标

### 十、实施顺序建议

- [ ] 第一步：确认领域模型与接口边界
- [ ] 第二步：落执行中心表结构与后端基础接口
- [ ] 第三步：兼容旧 `agent-runs` 接口到新执行中心
- [ ] 第四步：重构执行中心页面
- [ ] 第五步：工作项详情接入“发起执行”
- [ ] 第六步：Hermes `actions` 与工具执行框架落地
- [ ] 第七步：接入自然语言创建需求、指派、发起执行等场景
- [ ] 第八步：扩展 GitLab / Jenkins / Webhook 等外部工具集成

## 补充说明

- 任务管理重构优先目标不是“再做一个工作项列表”，而是做“面向智能体执行的任务中心”。
- Hermes 应该作为自然语言入口和动作规划层，而不是平台核心业务的真实执行者。
- 平台要始终掌握权限、状态、审计、落库、调度、进度、产物这些核心能力。
