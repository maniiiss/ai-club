# Hermes 记忆系统优化点

基于代码分析，当前 Hermes 记忆系统存在以下可优化项。

---

## 1. 记忆缺少整合与衰减机制

**现状**

每轮对话都作为独立 document 写入 Hindsight，没有做任何整合。

`HermesHindsightMemoryService.java:377-384` 中 `retainConversationTurn` 逐轮写入，用户聊 100 轮就有 100 条独立 document。

**问题**

语义召回时容易返回碎片化的旧对话片段，而不是整合后的结论。

**改进方向**

- 定期触发 Hindsight 的 `consolidate` 能力，将同主题对话压缩为摘要事实
- 引入时间衰减或重要性权重，让近期记忆优先召回
- 对连续追问做合并写入，而非逐轮存储

---

## 2. 工具执行结果没有沉淀到长期记忆

**现状**

工具调用的结果只保存在 Redis 热状态中，TTL（默认 86400 秒）到期即丢失。

`HermesConversationState.java:24` 中 `toolExecutions` 只在 Redis 里，不写入 Hindsight。

**问题**

用户问"上次帮我查的那个项目有哪些迭代"，如果超过 24h 或 Redis 被清理，Hermes 完全不记得。

**改进方向**

- 将工具执行的关键结果（候选对象、摘要）异步写入 Hindsight 用户记忆
- 下次问类似问题时可先召回上次的查询结果，减少重复工具调用

---

## 3. 用户无法主动管理记忆

**现状**

没有任何 API 让用户查看、编辑、删除或标记自己的 Hermes 记忆。

`HindsightClientService` 只有 retain/recall，没有 list/update/delete 用户记忆的公开接口。

**问题**

如果 Hermes 记住了一条错误信息（比如用户随口说的"我明天要去公司"），这条记忆会一直参与召回，用户无法修正。

**改进方向**

- 后端新增 `/api/hermes/memories` 列表/删除 API
- 前端 Hermes 抽屉侧边栏新增"记忆"Tab
- 对话中支持"忘掉刚才那个"之类的显式遗忘指令

---

## 4. 附件内容没有进入长期记忆

**现状**

附件只绑定在消息记录上（`HermesConversationAttachmentEntity`），不写入 Hindsight。

`HermesAttachmentService.java:89` 中 `setMarkdown` 只存 DB，不入 Hindsight。

**问题**

用户上传了一份需求文档并和 Hermes 讨论过，下次在另一个会话中问"之前那份需求文档的核心结论是什么"，Hermes 无法召回。

**改进方向**

- 将附件核心摘要写入用户记忆 bank，关联 document_id 指向原始资产

---

## 5. Grounding 状态没有持久化回退

**现状**

Grounding 纯粹依赖 Redis，TTL 到期即丢失。

`HermesConversationStateStore.java:61-65` 中 Redis key 过期后 grounding 绑定全部清除。

**问题**

用户第二天回来继续聊同一个会话，Redis 可能已过期，Hermes 不记得"当前项目"是哪个，需要用户重新说明。

**改进方向**

- Grounding 关键绑定（projectId、taskId）在会话创建时已持久化到 `HermesConversationSessionEntity`
- 可以在 Redis miss 时从 DB 恢复基础 grounding，而非直接丢失

---

## 6. 召回上限偏保守

**现状**

```java
// HermesHindsightMemoryService.java:32-34
private static final int MAX_FACTS_PER_BANK = 3;
private static final int MAX_TOTAL_FACTS = 6;
private static final int MAX_SUMMARY_LENGTH = 180;
```

**问题**

用户沉淀了大量对话记忆，但每轮最多只召回 6 条、每条 180 字，信息密度受限。

**改进方向**

- 根据场景动态调整召回量（如 Wiki 场景可以多召回一些）
- 支持分层召回：先粗召回再 rerank，而不是简单截断

---

## 7. 跨会话记忆没有显式关联

**现状**

每个会话的 Redis 状态是隔离的，Hindsight 记忆虽然按用户共享，但 tags 过滤可能导致跨场景召回不完整。

`HermesHindsightMemoryService.java:82` 中 `recallTags` 按当前项目/空间过滤，可能漏掉其他场景的记忆。

**问题**

用户在"项目 A 工作区会话"中讨论的结论，在"全局助手会话"中不一定能被召回。

**改进方向**

- 用户记忆 bank 的召回可以去掉 `project:` tag 过滤，改为全量召回后按相关性排序
- 增加"记忆图谱"能力，让用户不同场景的对话形成知识网络

---

## 优先级

| 优先级 | 改进项 | 复杂度 | 收益 |
|---|---|---|---|
| P0 | 用户记忆管理 API（查看/删除） | 低 | 直接解决记忆污染问题 |
| P1 | 工具执行结果沉淀到 Hindsight | 中 | 跨会话复用查询结果 |
| P1 | 记忆整合/consolidation | 中 | 减少碎片化召回 |
| P2 | 附件摘要写入记忆 | 低 | 文档知识跨会话可用 |
| P2 | Grounding DB 回退恢复 | 低 | 提升长会话体验 |
| P3 | 召回量动态调整 | 中 | 提升信息密度 |
| P3 | 跨会话记忆关联 | 中 | 打通知识网络 |
