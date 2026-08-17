# GitPilot 按需下发工具技术设计 v1

## 1. 背景与问题

GitPilot 项目助手（管理端抽屉、聊天室 @GitPilot）走 Pi runtime，调用火山引擎 Ark
`deepseek-v4-flash` 模型。backend 在 `RuntimeToolContractService.build()` 一次性把全部
平台 MCP 工具（24 个）下发给模型，超过该模型的有效处理阈值。

### 实测证据

用该会话真实 systemPrompt + tools 直接调 pi-runtime 的隔离实验：

| 下发工具数 | TEXT_DELTA 数 | 结果 |
|------------|---------------|------|
| 0          | 49            | 正常完整回复 |
| 12         | 51            | 正常完整回复 |
| **24**     | **0**         | thinking 在第一个词就 `THINKING_END`，不产出正文 |

`assistant_chat_audit` 表显示重启后对话 `status=SUCCESS` 但 `response_summary` 为空，
Redis 会话快照中 assistant 消息从 thinking 残缺（"用户"/"The"）到完全空数组 `[]`。
pi-runtime 的 `#run` 在 `agent.prompt()` 未抛异常时无条件发 `RUN_COMPLETED(SUCCESS)`，
不检测"模型未产出正文"，导致用户看到空回复而非明确报错。

### 根因结论

- **直接原因**：24 个工具的 schema+描述约 17K 字符（~4-5K token），超过
  `deepseek-v4-flash` 阈值，模型 thinking 异常截断、不产出正文。
- **放大问题**：pi-runtime 未检测空正文，误报成功；残缺回复进入会话 history 后，
  后续轮次模型更困惑，形成"越问越空"的连锁。
- **与代码改动的关系**：本次 `codex/gitpilot-ci` 分支的"模型用量统计"改动不涉及
  Pi runtime 链路，不是回归源；平台 MCP 工具配置增至 24 个超过阈值是主因。

## 2. 设计目标

根据用户本轮输入（问题文本、slash 命令、路由、候选工具集）动态选出相关工具子集下发，
控制在阈值（≤12）内；规则匹配为主，向量检索兜底，未命中下发核心工具集。覆盖
assistant 抽屉（Pi runtime）与聊天室。

## 3. 架构

```
AssistantChatService.executeChat (Pi 分支)        ChatAssistantService.executeChat (Pi 分支)
        │ select(ctx)                                    │ select(ctx)
        ▼                                                ▼
        PlatformToolSelector ───────────────────────────┘
          ├─ ① slashCommand 精确映射
          ├─ ② 关键词匹配（复用 Orchestrator 词表）
          ├─ ③ 规则未命中 -> PlatformToolSemanticIndex.search（向量兜底）
          ├─ ④ 与候选集取交集（聊天室 = 房间启用工具集）
          ├─ ⑤ 上限裁剪 maxTools(12)
          └─ ⑥ 完全未命中 -> 核心工具集（≤8 高频只读）
        │ selectedToolCodes
        ▼
  withToolContract(..., selectedToolCodes, ...)
        ▼
  RuntimeToolContractService.build：restrictedToolCodes 白名单过滤
        allowedCodes = definitions.map(toolCode)  # 与下发集自动同源
        ▼
  HttpRuntimeAdapter.requestBody：payload["tools"] = 子集
        ▼
  pi-runtime：createPlatformTools 只迭代收到的 tools，beforeToolCall 白名单预检不误 block
```

### 契约保证（无需改 pi-runtime）

`RuntimeToolContractService.build()` 的 `allowedCodes = definitions.map(toolCode)`
保证下发的 `tools` 与 `toolPolicy.allowedToolCodes` 永远同源，pi-runtime 的
`beforeToolCall` 白名单预检不会误 block。

## 4. 核心组件

### 4.1 PlatformToolSelectionProperties（配置）

- `enabled`（默认 true）：按需下发开关，关闭时调用方回退全量下发。
- `maxTools`（默认 12）：单轮下发工具上限。
- `vectorFallbackEnabled`（默认 true）：规则未命中时是否启用向量检索。
- `coreFallbackToolCodes`（默认 8 个高频只读工具）：未命中时兜底。

### 4.2 PlatformToolSemanticIndex（向量索引/检索）

- 启动懒加载：首次检索时把 24 个工具的富文本（name + description + moduleCode +
  补充关键词）向量化写入 Qdrant `platform_tools` collection。
- `search(question, topK)`：embedding -> Qdrant search -> 返回 toolCode 列表。
- 复用 `WikiKnowledgeProperties` 的 embedding 配置与 `QdrantClientService`，
  embedding 未配置时 `isEnabled()` 返回 false，`search` 静默返回空。
- Qdrant 不可用或 collection 不存在时静默降级（404 返回空），不阻断主链路。

### 4.3 PlatformToolSelector（选择器）

选择流程：

1. `enabled=false` -> 返回 `null`（调用方全量下发）。
2. slashCommand 精确映射（`/需求` -> work_item.* + project.get_detail 等）。
3. 关键词匹配（复用 `AssistantToolOrchestrator` 沉淀的意图词表）。
4. 规则未命中且向量可用时 -> `PlatformToolSemanticIndex.search`。
5. 与候选集取交集（聊天室为房间启用工具集，保证"按需 ⊂ 房间策略"）。
6. 上限裁剪到 `maxTools`。
7. 完全未命中 -> 核心工具集；核心集与候选集无交集时退回候选集截断。

## 5. 接入点

| 入口 | 文件 | 改动 |
|------|------|------|
| assistant 抽屉 | `AssistantChatService.executeChat` Pi 分支 | `withToolContract` 前调 `resolveSelectedToolCodes`，候选集 = null（全量可见） |
| 聊天室 | `ChatAssistantService.executeChat` Pi 分支 | 候选集 = `toolExecutionPolicy.enabledToolCodes()`（房间启用） |

两处均复用现成的 `restrictedToolCodes` 通道，不改 `RuntimeToolContractService.build()`
与 `HttpRuntimeAdapter`，pi-runtime 无需改动。

## 6. 配置

```yaml
platform:
  assistant:
    tool-selection:
      enabled: ${PLATFORM_TOOL_SELECTION_ENABLED:true}
      max-tools: ${PLATFORM_TOOL_SELECTION_MAX_TOOLS:12}
      vector-fallback-enabled: ${PLATFORM_TOOL_SELECTION_VECTOR_FALLBACK:true}
```

## 7. 测试

- `PlatformToolSelectorTests`（8 例）：slash 映射、关键词匹配、向量兜底、候选集交集、
  上限裁剪、核心集兜底、disabled 返回 null。
- `PlatformToolSemanticIndexTests`（4 例）：embedding 未配置降级、空问题降级、
  索引未就绪降级。
- 隔离实验复现：0/12 tools 正常，24 tools 异常，验证按需下发（≤12）能恢复 TEXT_DELTA。

## 8. 风险与回滚

- **召回不全**：规则+向量双路 + 核心集 fallback 兜底；`enabled=false` 一键回退全量。
- **向量延迟**：每轮 ~100-300ms embedding；`vectorFallbackEnabled=false` 可关。
- **embedding 未配**：自动降级纯规则，不报错。
- **未来增强**（不在本期）：pi-runtime 检测"模型未产出正文"时发 `RUN_FAILED` 而非
  `RUN_COMPLETED(SUCCESS)`，让用户看到明确错误而非空回复；工具按 moduleCode 分组
  按需加载，进一步降低单轮 token。
