# 记忆事实图

## 目标

记忆事实图用于在项目与 Wiki 空间维度展示 Hindsight 中沉淀的实体关系与事实证据。

第一版的设计目标是：

- 保留项目“逻辑图谱”页面，记忆事实图入口放入 Wiki 中心；每个 Wiki 空间直接打开自己的记忆事实图，不依赖关联项目。
- 后端在线代理 Hindsight 的实体图、实体详情和事实 recall 接口。
- 页面支持实体点击、关系点击、搜索、过滤、刷新和空态提示。
- 平台可控的 Wiki retain 路径统一补齐 `source:wiki` 标签，并按来源补齐 `space:{spaceId}` 或 `project:{projectId}` 标签。

第一版不做：

- 平台侧缓存表或快照表。
- 手工编辑图、改边、改节点。
- Hermes 主记忆历史回补。

## 核心接口

项目维度保留三个只读接口：

- `GET /api/projects/{projectId}/memory-fact-graph`
- `GET /api/projects/{projectId}/memory-fact-graph/facts`
- `GET /api/projects/{projectId}/memory-fact-graph/entity/{entityId}`

Wiki 空间维度提供对应的独立只读接口：

- `GET /api/wiki/spaces/{spaceId}/memory-fact-graph`
- `GET /api/wiki/spaces/{spaceId}/memory-fact-graph/facts`
- `GET /api/wiki/spaces/{spaceId}/memory-fact-graph/entity/{entityId}`

返回约定：

- 图主接口只返回图骨架和统计，不直接内联原始事实全文。
- `facts` 接口支持 `entityId`、`edgeId`、`query` 三选一。
- 所有接口都允许返回 `warnings`，用于提示 Hindsight 不可用、共享 bank 未参与图骨架等降级信息。
- 当 Hindsight HTTP 服务不可用但 `hindsight` 数据库仍可访问时，后端会自动回退到库内快照读取 `entities / entity_cooccurrences / memory_units`。

## bank 解析策略

### 图骨架

图骨架优先读取这些 bank：

1. 项目级 bank
   默认会回退到当前已存在的 `git-ai-club:wiki:project:{projectId}` 结构，保证项目 Wiki 页面可直接进入记忆事实图。
2. 项目相关 Wiki space bank
   通过 `WikiSpaceService.buildProjectGraphProjection(projectId)` 找出当前项目相关空间，再读取对应 `git-ai-club:wiki:space:{spaceId}` bank。
3. Wiki 空间独立入口
   直接读取当前空间自己的 `git-ai-club:wiki:space:{spaceId}` bank，不要求该空间绑定项目。

### 事实 recall

事实 recall 会读取：

- 图骨架涉及的项目 bank 与空间 bank
- 项目维度显式配置的共享 bank（如果有）
- Wiki 空间维度仅读取当前空间 bank，并通过 `space:{spaceId}` 标签做范围过滤

共享 bank 当前仅参与事实 recall，不参与实体图骨架聚合。原因是当前 Hindsight 官方实体图接口更适合项目级或空间级隔离 bank，直接对共享 bank 做项目标签级实体图过滤并不稳定。

## 降级策略

### Hindsight HTTP 可用

- 优先走 Hindsight 实体图、实体详情、facts recall 在线接口。
- `table` 模式在“当前作用域全部内容”场景下，优先读取 `/graph` 返回的 `table_rows`，避免空查询 recall 被 Hindsight 直接拒绝。

### Hindsight HTTP 不可用

- 若 `platform.hindsight.memory-fact.database-fallback-enabled=true` 且 `hindsight` 数据库可访问，自动回退到库内快照。
- 图骨架读取 `entities` 与 `entity_cooccurrences`。
- 实体详情与事实面板读取 `memory_units` 与 `unit_entities`。
- 前端仍会收到 `warnings`，明确说明当前数据来自库内快照，而不是实时 Hindsight HTTP 结果。

## Hindsight 配置

`backend/src/main/resources/application.yml` 新增了这些配置：

```yaml
platform:
  hindsight:
    memory-fact:
      project-bank-template:
      shared-bank-id:
      entity-graph-path-template: /v1/default/banks/{bankId}/graph
      entity-detail-path-template: /v1/default/banks/{bankId}/entities/{entityId}
      recall-path-template: /v1/default/banks/{bankId}/memories/recall
```

说明：

- `project-bank-template` 为空时，会默认回退到当前项目 Wiki bank 模板。
- `shared-bank-id` 只有显式配置才会启用，避免运行时盲猜。
- 三个 path template 允许在 Hindsight 版本升级后只改配置，不改代码。

## 探测脚本

新增脚本：

```bash
python scripts/probe_hindsight_memory_fact_graph.py --bank-id git-ai-club:wiki:project:12 --tag project:12 --query 发布说明
```

脚本会探测：

- `/health`
- `/v1/default/banks/{bankId}/graph`
- `/v1/default/banks/{bankId}/entities/{entityId}`
- `/v1/default/banks/{bankId}/memories/recall`

输出会同时包含：

- 原始请求结果状态
- 归一化后的实体图样例
- 归一化后的实体详情样例
- 归一化后的 facts recall 样例

建议在 Hindsight 容器启动后先跑一遍脚本，再做联调。

如果本地 Hindsight 一直停留在 `Waiting for application startup`，优先检查两项：

- embeddings 维度是否和已有库里历史向量一致。当前仓库默认改成 384 维 `BAAI/bge-small-en-v1.5`，用于兼容已有 `memory_units` 数据。
- reranker 是否仍在加载本地大模型。当前编排默认改成 `rrf`，避免 dev 环境因为本地 reranker 初始化过慢而长时间无法响应 `/health`。

如果你准备自己在本机启动 OpenAI-compatible embedding 服务，例如 `Qwen/Qwen3-Embedding-4B`，当前编排已经支持直接切换：

```env
HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=http://host.docker.internal:8000/v1
HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=local
HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=Qwen/Qwen3-Embedding-4B
```

说明：

- `docker-compose.yml` 默认按 `host.docker.internal:8000/v1` 连接宿主机上的 OpenAI-compatible embeddings 服务，适合 Windows 本地源码模式。
- `docker-compose.host.yml` / `docker-compose.server.yml` 默认按 `127.0.0.1:8000/v1` 连接，适合 host 网络模式。
- 当前本地仍保留 `HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL` 配置项，只是当 provider 改成 `openai` 时不会被使用。

## 平台 retain 标签治理

当前平台可控的两条 Wiki retain 路径都已补齐来源标签：

- `WikiPageService`
- `WikiSpaceService`

统一标签约定至少包含：

- `wiki`
- `source:wiki`
- `space:{spaceId}`（Wiki 空间路径）
- `project:{projectId}`（项目 Wiki 路径，或 Wiki 空间目录绑定项目时）

这保证后续按项目或 Wiki 空间做事实 recall 时，不会漏掉平台自己写入的 Wiki 记忆。

## 已知边界

- Hermes 主记忆的 retain 逻辑不在当前仓库里，本次没有直接为其补项目标签。
- 如果 Hindsight 完全不可达，页面会返回空图或空事实，并通过 `warnings` 给出提示。
- 当前共享 bank 只参与事实 recall，不参与图骨架聚合；如果后续需要把 Hermes 共享记忆也稳定纳入图骨架，需要进一步评估 Hindsight 的共享 bank 图过滤能力。
