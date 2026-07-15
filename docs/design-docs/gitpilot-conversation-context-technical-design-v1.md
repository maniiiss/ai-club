# GitPilot 会话上下文技术设计 v1

## 目标

GitPilot 的 Runtime 上下文预算由管理端 Runtime Registry 统一配置。会话层永久保留原始消息，同时保存滚动摘要和结构化对话事实；运行时优先使用自身原生上下文能力，backend 在能力缺失或失败时兜底。

## 配置与快照

Runtime Registry 维护 `contextWindowTokens`、`maxOutputTokens`、`compactionThresholdPercent` 和 `compactionStrategy`。新建 Assistant 会话或执行时固化 Runtime 上下文配置快照，后续管理员修改配置不影响历史会话。

## 上下文链路

```text
完整消息历史（数据库）
        |
        v
Conversation Context Service
  摘要 + 结构化事实 + 待确认问题 + 最近消息
        |
        v
Runtime Adapter
  原生压缩优先 / backend fallback
        |
        v
Hermes / Pi / OpenClaw / CLI Runtime
```

可用输入预算由 Runtime 上下文窗口减去最大输出、系统提示词、工具契约和安全余量计算。达到配置阈值时，优先调用 Runtime 原生压缩；不可用时保留最近完整消息并使用 backend 摘要。

## 结构化事实

结构化事实用于保存项目、分支、候选对象和待确认问题，避免模型必须从自然语言历史中重新推断。例如“CRM项目”“deploy 分支”会写入会话上下文事实，压缩后仍可恢复。

## 持久化与兼容

数据库保存全部原始消息、摘要、事实和 Runtime 配置快照；Redis 保存同一份热状态。旧会话缺少快照时回退当前 Runtime 默认配置，旧消息不迁移、不删除。

Pi Runtime 使用 `pi-agent-core` 的 `transformContext` 和真实消息角色；Hermes/OpenClaw 通过 Gateway 适配器接收统一预算；CLI 保留自身执行会话，不改造成 GitPilot CHAT Runtime。

## 观测与灰度

backend 和 Runtime 记录上下文估算 token、压缩次数、原生压缩次数、fallback 次数和溢出风险指标。Context V2 可通过 Runtime 场景配置逐步启用；旧 transcript、Redis 状态和 Hermes Legacy 链路继续保留，压缩不会删除任何原始消息。
