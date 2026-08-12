## ADDED Requirements

### Requirement: Desktop 审查 API 必须使用独立 scope 和资源所有权校验
系统 SHALL 使用 `cli:code-review:execute`、`cli:code-review:read` 和 `cli:code-review:publish` 控制创建、读取与发布，并校验当前用户是运行创建人且对目标 GitLab 仓库可见。

#### Scenario: 读取他人审查运行
- **WHEN** 已认证用户请求不属于自己的 reviewId
- **THEN** backend 返回无权访问且不泄露运行是否存在、文件名或结论

#### Scenario: Token 缺少发布 scope
- **WHEN** token 可以执行审查但没有 `cli:code-review:publish`
- **THEN** 用户仍可在 Desktop 查看结果，但 backend 拒绝发布到 GitLab

### Requirement: 本地代码载荷只能短期存在
系统 SHALL 将完整本地 Diff 作为加密短期载荷保存，默认 TTL 不超过 30 分钟，并在完成、失败或取消后主动删除；数据库和业务日志不得保存完整 Diff 或本地绝对路径。

#### Scenario: 审查成功
- **WHEN** code-processing 已消费载荷并返回结果
- **THEN** backend 保存快照摘要、digest、结果和审计，随后删除短期 Diff 载荷

#### Scenario: 载荷过期
- **WHEN** worker 取任务时短期 Diff 已过期
- **THEN** 运行以 PAYLOAD_EXPIRED 失败且不使用空内容或残缺内容调用模型

### Requirement: 模型密钥和 GitLab Token 不得进入 Desktop
系统 SHALL 让模型供应商密钥只存在于 backend 到 code-processing 的内部调用，让 GitLab 项目 Token 只存在于平台 GitLab 服务，WebView 和 sidecar 均不得接收这些凭据。

#### Scenario: Desktop 发起平台审查
- **WHEN** sidecar 使用 `gpt_` token 创建 code review
- **THEN** backend 解析用户和模型配置并调用内部服务，响应中不包含 provider apiKey 或 GitLab Token

### Requirement: 发布 MR 评论必须显式确认且具有幂等性
系统 SHALL 仅在用户确认后发布审查结果，并以 reviewId、snapshot digest 和目标 MR 生成幂等键，避免重试产生重复评论。

#### Scenario: 网络超时后重试发布
- **WHEN** 首次发布结果未知且用户或客户端重试同一 reviewId
- **THEN** backend 返回已有发布记录或更新同一条总评，不新增重复评论

#### Scenario: 未关联 GitLab 仓库
- **WHEN** 本地 remote 无法精确匹配当前用户可见的 GitLab binding
- **THEN** 本地审查仍可完成，但发布入口不可用且系统不按仓库名称猜测目标

### Requirement: AI 结论不得触发隐式代码或仓库变更
系统 SHALL 将审查、发布评论、Agent 修复、提交、Push、批准和合并视为独立动作；完成审查本身不得触发后续有副作用动作。

#### Scenario: 审查结论为 approved
- **WHEN** 审查返回 approved=true
- **THEN** 系统只显示结论，不自动提交、Push、批准或合并 MR

#### Scenario: 用户请求 Agent 修复 finding
- **WHEN** 用户从 finding 选择“交给 Agent 修复”
- **THEN** 系统把结构化 finding 和快照信息填入新的 Agent 指令，后续文件修改仍遵守现有工具确认与执行事件契约

### Requirement: 审查运行和用户反馈必须可审计
系统 SHALL 记录运行创建人、来源、快照摘要、模型配置、状态迁移、用量关联、发布目标、发布时间和 finding 反馈，但日志不得包含原始 Token 或完整源码。

#### Scenario: 用户标记误报
- **WHEN** 用户对 finding 提交“误报”反馈
- **THEN** backend 追加独立反馈记录并保留模型原始 finding，供后续质量评估和复审使用

