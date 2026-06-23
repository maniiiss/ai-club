# Wiki 知识图谱 LightRAG 底层技术设计 v1

## 1. 背景与目标

平台目前存在两套独立的「知识图谱」实现，都是中间过程，不是最终方向：

1. **项目业务图谱**（`KnowledgeGraphService`）：从 PG 业务外键派生 PROJECT / ITERATION / TASK / BUG / REQUIREMENT / TEST_PLAN / USER / AGENT / WIKI_SPACE / WIKI_DIRECTORY / WIKI_PAGE 节点与 HAS_ITERATION / ASSIGNED_TO / RELATES_TO_REQUIREMENT 等结构边，落到 `knowledge_graph_nodes` / `knowledge_graph_edges` 表。
2. **Wiki 向量图谱**（`WikiKnowledgeSearchService`）：Wiki 页面切 chunk 写 Qdrant，页面质心余弦相似度派生 `SEMANTIC_SIMILAR` 边，同时承担 Hermes 证据召回（向量 + rerank）。

本设计用 **LightRAG** 替代这两套，并且**业务实体不再单独注入图谱**。理由：

- 需求录入后会自动以 PRD 形式写入 Wiki（已有 `TaskPrdProjectionEntity` 维护「需求工作项 → PRD Wiki 页面」的投影与同步状态）。业务信息以 PRD 文本进入 Wiki，由 LightRAG 的 LLM 抽取实体与关系，统一走语义层。
- 业务实体的结构化关系本就存在于 PG 表里，需要时 SQL 查询即可，做成图谱可视化是冗余。因此第 1 套业务图谱整体废弃，不再迁移、不双写、直接退役。
- 真正需要图谱能力（多跳推理、主题分层、语义关联）的是非结构化的 Wiki / PRD 文本，这正是 LightRAG 的价值所在。

设计目标：用 LightRAG 一条 Wiki 正文摄入流水线，替代现有两套中间产物，降低存储与检索语义的维护成本，并让 Wiki 获得真正的主题分层与多跳推理能力。

**Trade-off（已确认接受）**：现有 `KnowledgeGraphView` 展示的「项目/迭代/任务/指派人」精确外键结构图会消失。取而代之的是 PRD / Wiki 文本里 LLM 抽出的语义关系图，粒度从「精确外键」变成「文本语义」。业务结构关系需要时仍可 SQL 查询，不依赖图谱。

## 2. 范围与退役清单

### 2.1 本期替换

| 现有组件 | 去向 |
|---|---|
| `KnowledgeGraphService` | **直接删除**，业务图谱整体退役，不迁移不双写 |
| `WikiKnowledgeSearchService` | 删除，检索迁到 LightRAG query |
| `WikiChunkingService` | 删除，chunking 由 LightRAG 接管 |
| `QdrantClientService`（Wiki 专用） | 灰度期保留双写，切流量后整体删除 |
| PG 表 `knowledge_graph_nodes` / `knowledge_graph_edges` | Flyway V96 标记废弃，灰度结束 V97 删表 |
| `WikiKnowledgeProperties` | 替换为 `LightRagProperties` |
| `KnowledgeGraphController` | **直接删除**，业务图谱入口一并下线，路由 `projects/:projectId/knowledge-graph` 移除（目前该路由已是 redirect 到迭代页，删除无功能损失）。`/api/projects/{id}/knowledge-graph` 与 `/rebuild` 接口同步删除 |
| `KnowledgeGraphView.vue`（前端） | **直接删除，不重做此视图**。知识图谱可视化统一收敛到 `WikiKnowledgeGraphView`，展示 Wiki/PRD 语义实体关系 |
| `WikiSpaceController` 空间图谱接口 | 改调 `LightRagClientService.getGraph(namespace="space:{id}")` |
| Hermes 证据 `buildWikiEvidenceMarkdown` | 改调 `LightRagClientService.query` |

### 2.2 不在范围

- **Hindsight 用户记忆向量系统**：独立链路，保持原样。
- **GitNexus 代码知识图谱**：独立索引（`gitnexus analyze`），不并入 LightRAG。
- **业务实体的结构化关系图谱**：已确认废弃，需求以 PRD 进 Wiki 走语义层。若后续仍需结构图，从 PG SQL 查询，不再建图谱。
- **跨 project / space 的全局图谱合并**：本期按 namespace 隔离。

## 3. 架构总览

```
┌─ frontend ─────────────────────────────────────────────┐
│  WikiKnowledgeGraphView（唯一知识图谱入口）            │
│  Hermes 证据展示                                        │
└────────────────────┬───────────────────────────────────┘
                     │ HTTP
┌─ backend (Java) ───┴───────────────────────────────────┐
│  LightRagClientService   ← 新增，仿 RepositoryScanClientService │
│  LightRagProperties      ← 新增配置                     │
│  WikiPage 保存 → 同事务写 outbox 队列表                  │
│  Hermes 证据拼装 → LightRagClientService.query()       │
│  定时扫描未索引页面 → 入队                              │
└────────────────────┬───────────────────────────────────┘
                     │ HTTP (内部 Bearer token)
┌─ code-processing (FastAPI/Python) ─────────────────────┐
│  /lightrag/ingest/wiki       (insert，走队列消费)       │
│  /lightrag/query             (local/global/hybrid/mix)  │
│  /lightrag/graph             (读图给可视化)             │
│  /lightrag/health            (依赖探测)                 │
│  LightRAG 实例 + outbox 消费者                           │
└────────────────────┬───────────────────────────────────┘
                     │
   ┌─────────────────┼─────────────────┐
   │                 │                 │
   ▼                 ▼                 ▼
 Qdrant           Postgres          Neo4j
 (vector backend) (kv backend)      (graph backend)
 复用现有实例       复用现有实例      新增中间件
```

LightRAG 放 code-processing：它是 Python 生态，且已有 FastAPI 路由层。Java 只做薄客户端，不碰图算法。相比双路径方案，删掉了业务实体注入路径与 `/lightrag/ingest/business` 接口，架构更轻。

## 4. 存储后端选型

LightRAG 的存储三件套各自独立可插拔，选型如下：

| 后端 | 存什么 | 选型 | 理由 |
|---|---|---|---|
| Vector store | 实体 / 关系的 embedding 向量 | **Qdrant**（复用） | 已在运行，LightRAG 原生支持 `QdrantVectorDBStorage` |
| KV store | 实体描述、文档块原文等文本 | **Postgres**（复用） | 复用现有 PG，LightRAG 原生支持 `PGKVStorage` |
| Graph store | 实体节点 + 关系边的拓扑 | **Neo4j**（新增） | LightRAG 一等支持 `Neo4JStorage`，原生图引擎成熟，社区案例多 |

### 4.1 Qdrant：复用实例，新建 collection

- LightRAG 写 Qdrant 的 schema 与现有 Wiki collection 不同：现有 payload 是 `{pageId, spaceId, title, slug, ...}`，LightRAG 写的是 `{entity_name, content, source_id, metadata}`。
- 因此**不复用 `wiki_space_chunks` / `wiki_project_chunks`**，新建 LightRAG 专用 collection，按 `workspace` namespace 隔离（如 `lightrag_space_{spaceId}`）。
- 同一个 Qdrant 实例，不同 collection，互不干扰。老 collection 灰度期保留，切流量后删。
- embedding 维度由抽取模型决定，全实例统一，禁止两套模型混写一个 collection。

### 4.2 Postgres：KV 后端

- LightRAG 的 `PGKVStorage` 用一张表存实体描述、文档块原文等。
- 建表 SQL 由 code-processing 启动时自动执行（LightRAG 内置 schema），不进 Flyway（Flyway 只管 backend 业务表）。
- backend 业务表（`wiki_page_v2` 等）不迁，只读。

### 4.3 Neo4j：新增中间件

Neo4j 是本设计唯一新增的持久化中间件，运维代价写明：

- 新增 docker-compose service（见 §12），新端口（7474 HTTP / 7687 Bolt）、新数据卷 `./.data/neo4j`、新凭证 `NEO4J_PASSWORD`。
- 新增备份策略：`neo4j-admin database dump` 定时导出（与 PG / Qdrant 备份并列）。
- 新增健康检查：HTTP 7474 探活，纳入 backend 与 code-processing 的 `depends_on`。
- 鉴权：用户名 `neo4j` + 密码走 env，不复用 PG 凭证。

选 Neo4j 而非 Postgres + Apache AGE 的理由：LightRAG 对 Neo4j 是一等支持、社区踩坑资料多、原生 Cypher 优化成熟；AGE 仍在孵化、案例少。代价是引入新中间件，本设计接受这个代价换取实现稳定性。

## 5. 数据注入路径（单路径）

业务实体不再单独注入，只有一条 Wiki 正文摄入路径。

### 5.1 Wiki 正文注入（`insert`，走 LLM 抽取）

Wiki 页面（含 PRD）走 LightRAG 的 `insert(text)`，由 LLM 抽取实体与关系，写 Neo4j + Qdrant + PG KV。

- 每个页面拼成一段文档（标题 + 路径 + 正文，复用现有 `buildSpaceIndexContent` 的拼装思路），调 `rag.insert(text, [pageId])`。
- LLM 抽取的实体与关系自动写三后端。
- `source_id` 标记为 `wiki:{spaceId}:{pageId}`，便于按页面删除重建。
- PRD 页面走同一条路径 —— 需求录入后以 PRD 形式写入 Wiki（`TaskPrdProjectionEntity` 维护投影），保存时自动入队，无需特殊处理。

抽取 LLM 由部署方通过 `PLATFORM_LIGHTRAG_LLM_*` 自行配置（见 §14），实现侧只暴露配置项、不绑死模型。embedding 沿用现有 Wiki 的 embedding 配置（`PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_*`），保证新 collection 维度与现网一致，避免两套模型混写。抽取用便宜模型控制成本，因为 Wiki 每天高频更新。

### 5.2 不再有的业务实体注入

明确删除：上一版设计里的 `insert_custom_kg` 业务实体注入路径不再需要。业务图谱（`KnowledgeGraphService`）整体退役，业务实体的结构化关系留在 PG 表里按需 SQL 查询，不进 LightRAG。这简化了实现 —— 不再需要 `source_id` 的 business 前缀约定、不再需要 `/lightrag/ingest/business` 接口、不再需要 PoC 验证 `insert_custom_kg`。

## 6. 索引流水线

Wiki 每天高频更新，直接同步调 LLM 抽取会拖死编辑接口。用 **PG outbox 队列 + 定时兜底扫描** 双保险。

### 6.1 编辑触发入队（PG outbox）

Wiki 页面保存（创建 / 更新 / 删除）时，在**同一 PG 事务**里往 `lightrag_ingest_queue` 表写一条记录：

```
lightrag_ingest_queue (
  id BIGSERIAL PRIMARY KEY,
  namespace VARCHAR(128) NOT NULL,      -- 'project:{id}' 或 'space:{id}'
  page_id BIGINT NOT NULL,
  page_version INT,                     -- 删除时为 NULL
  op VARCHAR(16) NOT NULL,              -- 'UPSERT' | 'DELETE'
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING/PROCESSING/DONE/FAILED/DEAD
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ              -- 消费者抢占锁
)
```

同事务入队保证「页面存了、入队前宕机」不会丢消息 —— 这是选 PG outbox 而非 Redis Stream 的决定性理由。PRD 页面投影写入 Wiki 时同样触发入队，无需特殊分支。

### 6.2 队列消费者（code-processing）

code-processing 起一个后台任务轮询 `lightrag_ingest_queue`：

1. `SELECT ... FOR UPDATE SKIP LOCKED` 抢占 `status='PENDING' AND locked_until < now()` 的记录，置 `PROCESSING`，设 `locked_until = now() + 5min`。
2. 按 `op` 分发：
   - `UPSERT`：拉页面最新正文 → `rag.insert(text, [pageId])`；
   - `DELETE`：按 `source_id` 删 LightRAG 实体（见 §6.5）。
3. 成功置 `DONE`；失败 `retry_count++`，`status` 回 `PENDING`，`last_error` 记录原因；`retry_count >= 5` 置 `DEAD`。
4. 消费者并发度可配，默认 1（LightRAG 单实例写入不建议高并发）。

### 6.3 定时兜底扫描

backend 起一个定时任务（Spring `@Scheduled`，仿 `ExecutionWorkspaceCleanupScheduler` 的写法）：

- 扫 `wiki_lightrag_index_state` 表，找 `indexed_version < page.currentVersionNumber` 或 `indexed_at` 过老的页面。
- 补往 `lightrag_ingest_queue` 入队（幂等：同 pageId + version 已有 PENDING 则不重复入）。
- 默认每 10 分钟跑一次，覆盖消费者宕机、事件丢失、增量失败等漏网情况。

### 6.4 索引状态表

```
wiki_lightrag_index_state (
  page_id BIGINT PRIMARY KEY,
  namespace VARCHAR(128) NOT NULL,
  indexed_version INT,                  -- 最后成功索引的版本
  indexed_at TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING/INDEXED/FAILED
  last_error TEXT
)
```

这张表是「未更新」判定的数据源，也是去重依据，LightRAG 本身不提供。

### 6.5 删除处理

Wiki 页面删除要触发 LightRAG 实体清理。LightRAG 的按文档 / 实体删除能力在版本间稳定性不一，**这是本设计的高风险点**（见 §16）。对冲方式：

- 删除路径调 LightRAG 的 `delete_by_entity` / `delete_by_doc_id`（按目标版本实测确认可用）。
- 若目标版本删除 API 不可靠，降级方案：按 `source_id` 直接在 Neo4j 跑 Cypher 删实体节点 + 关联边，Qdrant 按 payload `source_id` 删点，PG KV 按 key 删。这条路绕过 LightRAG 抽象，但保证删干净。
- 删除幂等：重复删同 pageId 不报错。

## 7. 检索接口

### 7.1 query mode 与场景映射

LightRAG 的 `query(query, QueryParam(mode=...))` 支持多种模式，按场景映射：

| 场景 | mode | 说明 |
|---|---|---|
| Hermes 证据召回（局部查找） | `local` | 实体邻域召回，替代现有向量 + rerank |
| 全局主题问题（"这个空间主要讲什么"） | `global` | 社区摘要召回 |
| 多跳推理（答案需串联多个页面） | `hybrid` | local + global 合并 |
| 兜底 naive 向量召回 | `naive` | 纯向量，用于对比基线 |

Hermes 证据默认走 `local`。后续可加 query 分类器自动选 mode，本期不做。

### 7.2 Hermes 证据拼装

`WikiKnowledgeSearchService.buildWikiEvidenceMarkdown` 替换为 `LightRagClientService.query`：

- backend 按 `wikiSpaceId` / `projectId` 决定 namespace，调 `LightRagClientService.query(namespace, query, mode="local", topK=3)`。
- 返回结果按 LightRAG 的 context 格式解析，渲染成 Markdown 证据（复用现有 `renderEvidenceMarkdown` 的渲染逻辑，只换数据源）。
- 对 Hermes 透明：`buildWikiEvidenceMarkdown` 的签名不变，只换内部实现。

## 8. 可视化图谱接口

新增 `GET /api/lightrag/graph?namespace={space:123}`（权限复用现有 `wiki:view` / 空间可见性）：

- 调 code-processing `/lightrag/graph`，后者直接读 Neo4j 返回节点 + 边。
- 节点：实体 `{id, name, type, description, source_id}`。
- 边：关系 `{from, to, type, description, weight}`，全部来自 Wiki/PRD 文本的 LLM 抽取。
- DTO 适配成现有 `KnowledgeGraphNodeSummary` / `KnowledgeGraphEdgeSummary`，前端画布组件 `KnowledgeGraphCanvas` 无需改。
- 大图截断：单 namespace 节点数超阈值（默认 500）时按度数裁剪，防止前端卡死。

这里的图是「Wiki/PRD 语义实体关系图」，不再是「项目业务结构图」。原 `KnowledgeGraphView` 直接重做（见 §13）。

## 9. 后端设计

### 9.1 LightRagClientService

新增 `backend/src/main/java/com/aiclub/platform/service/LightRagClientService.java`，完全仿 `RepositoryScanClientService` 的写法：

- `@Value("${platform.code-processing.base-url}")` + `@Value("${platform.internal.service-token}")` 注入。
- `HttpClient` + `baseRequest` 带 `Authorization: Bearer`。
- 方法：
  - `ingestWikiPage(String namespace, Long pageId, String content)` → POST `/lightrag/ingest/wiki`
  - `deleteWikiPage(String namespace, Long pageId)` → DELETE `/lightrag/ingest/wiki`
  - `query(String namespace, String query, String mode, int topK)` → POST `/lightrag/query`
  - `getGraph(String namespace, int nodeLimit)` → GET `/lightrag/graph`
  - `health()` → GET `/lightrag/health`
- DTO 全用 record，错误信息提取复用 `RepositoryScanClientService.buildErrorMessage` 的模式。

### 9.2 LightRagProperties

新增 `backend/.../service/LightRagProperties.java`，仿 `WikiKnowledgeProperties` 的 `@Component` + `@Value` 风格：

- `enabled`（默认 true）
- `graphNodeLimit`（可视化截断，默认 500）
- `query.topK`（默认 3）
- `query.defaultMode`（默认 `local`）
- `ingest.retryMax`（默认 5）
- `ingest.scanIntervalMs`（定时扫描间隔，默认 600000）
- 退役 `WikiKnowledgeProperties` 的 Qdrant / rerank / 相似度阈值等字段（保留到灰度结束）。

### 9.3 退役服务

- `KnowledgeGraphService`：**直接删除**。业务图谱整体退役，不再迁移逻辑到 LightRAG。`KnowledgeGraphController` 的重建/读取接口同步删除，不指向 LightRAG。
- `WikiKnowledgeSearchService`：`buildWikiEvidenceMarkdown` 改调 `LightRagClientService.query`，其余方法（向量召回 / rerank / 质心图谱）废弃。灰度结束后删类。
- `WikiChunkingService`：废弃，LightRAG 接管 chunking。
- `QdrantClientService`：灰度期保留双写，切流量后删。

### 9.4 Controller 改造

- `KnowledgeGraphController`：**直接删除**，业务图谱接口（`/api/projects/{id}/knowledge-graph` 与 `/rebuild`）一并下线，不改造、不指向 LightRAG。知识图谱可视化统一走 `WikiSpaceController`。
- `WikiSpaceController`：空间图谱接口改调 `LightRagClientService.getGraph(namespace="space:{id}")`。
- Wiki 页面保存 / 删除的 service 方法里，同事务往 `lightrag_ingest_queue` 入队。PRD 投影写入 Wiki 的链路同样触发入队。

### 9.5 定时任务

新增 `LightRagIndexScanScheduler`，仿 `ExecutionWorkspaceCleanupScheduler`：

- `@Scheduled(fixedDelayString = "${platform.lightrag.ingest.scan-interval-ms:600000}")`。
- 扫 `wiki_lightrag_index_state` 找落后版本，补入 `lightrag_ingest_queue`。

## 10. code-processing 设计

### 10.1 LightRAG 实例与初始化

新增 `code-processing/app/services/lightrag_service.py`：

- **存储连接走环境变量，不走构造函数参数**。已安装的 `lightrag-hku` 里，`Neo4JStorage` / `PGKVStorage` / `QdrantVectorDBStorage` 的连接信息都从 `os.environ` 读取（`NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD`、`POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DATABASE`、`QDRANT_URL` / `QDRANT_API_KEY`）。因此实例化前先用 `_apply_storage_env()` 把 settings 写进环境变量（`PLATFORM_LIGHTRAG_PG_KV_DSN` 会被解析成 `POSTGRES_*`），构造函数只传 `workspace` / `llm_model_func` / `embedding_func` 与三个 `*_storage` 类名字符串。
- **按 namespace 缓存多个 LightRAG 实例，而非单例切 workspace**。LightRAG 的 `workspace` 在构造时即与各存储 namespace 绑定，运行时无法切换；所以实现按 `workspace`（`lightrag_space_{id}` / `lightrag_project_{id}`）缓存实例字典，每个 namespace 一个实例，实现真正的数据隔离。底层 Neo4j driver / asyncpg pool / qdrant client 各自复用连接池，实例数量受空间数量限制、可接受。**刻意不设置 `NEO4J_WORKSPACE` / `POSTGRES_WORKSPACE` / `QDRANT_WORKSPACE` 环境变量**，否则它们会覆盖实例级 workspace 导致隔离失效。
- `llm_model_func`：复用 LightRAG 自带的 `openai_complete_if_cache` 适配器绑定抽取 LLM（正确处理 `history_messages` / `keyword_extraction` 等内部参数）。
- `embedding_func`：用 `lightrag.utils.EmbeddingFunc` 包装 `openai_embed`，沿用现有 Wiki embedding 配置（`PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_*`）；维度首次调用时探测一次并缓存，传给 `EmbeddingFunc(embedding_dim=...)`。
- `/lightrag/health` 探测三个后端连通性（Neo4j `RETURN 1`、Qdrant `/healthz`、PG `SELECT 1`），任一不通返回降级状态，不阻断 code-processing 主流程（其他扫描 / 审查功能不受影响）。

### 10.2 API 路由

新增 `code-processing/app/api/lightrag_routes.py`，挂到 `app/api/routes.py` 的 router：

- `POST /lightrag/ingest/wiki`：body `{namespace, pageId, content}` → 先 `rag.adelete_by_doc_id(source_id)` 幂等清旧，再 `rag.ainsert(content, ids=[source_id], file_paths=[source_id])`，`source_id = wiki:{namespace}:{pageId}`。
- `DELETE /lightrag/ingest/wiki`：query `{namespace, pageId}` → `rag.adelete_by_doc_id(source_id)`，`not_found` 视为幂等成功（见 §6.5）。
- `POST /lightrag/query`：body `{namespace, query, mode, topK}` → `rag.aquery_data(query, QueryParam(mode=mode, top_k=topK))`，取结构化 entities / relationships / chunks 拼成证据上下文（不做 LLM 生成，证据召回成本更低）。
- `GET /lightrag/graph`：query `{namespace, nodeLimit}` → `rag.get_knowledge_graph("*", max_nodes=nodeLimit)`，用官方图查询 API（自动按 workspace 隔离），返回的 `KnowledgeGraphNode/Edge` 适配成可视化 DTO。
- `GET /lightrag/health`：探测 Qdrant / PG / Neo4j 连通性。
- 全部走现有 `Authorization: Bearer ${PLATFORM_INTERNAL_SERVICE_TOKEN}` 鉴权，与 `hermes_internal_client` 一致。

namespace → workspace 映射：`project:123` → workspace `lightrag_project_123`，`space:456` → `lightrag_space_456`。LightRAG 按 workspace 隔离 KV / vector / graph 命名空间。相比双路径方案，删除了 `/lightrag/ingest/business` 接口。

### 10.3 队列消费者

新增 `code-processing/app/services/lightrag_queue_consumer.py`：

- 后台 `asyncio` 任务，轮询 backend 暴露的内部接口 `/internal/lightrag/queue/poll`（backend 提供，`SELECT FOR UPDATE SKIP LOCKED`）。
- 拿到记录后调 `lightrag_service.ingest_wiki_page` 或 `delete_wiki_page`。
- 回调 `/internal/lightrag/queue/{id}/ack` 或 `/nack` 更新状态。
- 并发度配置项 `PLATFORM_LIGHTRAG_CONCURRENCY`（默认 1）。

注意：队列表在 backend PG，消费者在 code-processing，通过 backend 内部 HTTP 接口读写，避免 code-processing 直连业务 PG（保持现有服务边界，code-processing 不碰业务库 schema）。

### 10.4 定时兜底

backend 的 `LightRagIndexScanScheduler` 负责扫状态表入队，code-processing 不做定时扫描，职责单一。

### 10.5 settings 配置

`code-processing/app/settings.py` 新增：

- `lightrag_enabled`（默认 true）
- `lightrag_neo4j_uri`、`lightrag_neo4j_user`、`lightrag_neo4j_password`
- `lightrag_qdrant_url`、`lightrag_qdrant_api_key`（复用现有 Wiki Qdrant 配置）
- `lightrag_pg_kv_dsn`（复用 backend 业务 PG DSN，或独立库）
- `lightrag_llm_model`、`lightrag_llm_base_url`、`lightrag_llm_api_key`（抽取用 LLM，由部署方配置）
- embedding 不单独配置，直接复用现有 Wiki 的 `PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_*`
- `lightrag_concurrency`（默认 1）

### 10.6 Python 依赖

`code-processing/pyproject.toml` 新增：

- `lightrag-hku`（LightRAG 主包，提供 `LightRAG` / `QueryParam` / 各存储后端实现）
- `neo4j`（Python driver，`Neo4JStorage` 依赖）
- `qdrant-client`（`QdrantVectorDBStorage` 依赖；现有 code-processing 未直接依赖，需新增）
- `asyncpg` 或 `psycopg[binary]`（`PGKVStorage` 依赖，按 LightRAG 版本要求二选一）

版本号在 PoC 阶段钉死（见 §18），写进 `pyproject.toml` 的 `dependencies` 数组。

## 11. 数据库迁移（Flyway V96）

`backend/src/main/resources/db/migration/V96__lightrag_ingest_queue.sql`：

```sql
-- LightRAG 索引队列（PG outbox），Wiki 页面保存同事务入队，消费者在 code-processing 异步处理。
CREATE TABLE lightrag_ingest_queue (
    id           BIGSERIAL PRIMARY KEY,
    namespace    VARCHAR(128) NOT NULL,
    page_id      BIGINT NOT NULL,
    page_version INT,
    op           VARCHAR(16) NOT NULL,
    status       VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    retry_count  INT NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until TIMESTAMPTZ
);
CREATE INDEX idx_lightrag_queue_status_locked ON lightrag_ingest_queue (status, locked_until);
CREATE INDEX idx_lightrag_queue_namespace_page ON lightrag_ingest_queue (namespace, page_id);

-- LightRAG 索引状态表，定时扫描依据。
CREATE TABLE wiki_lightrag_index_state (
    page_id         BIGINT PRIMARY KEY,
    namespace       VARCHAR(128) NOT NULL,
    indexed_version INT,
    indexed_at      TIMESTAMPTZ,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    last_error      TEXT
);
CREATE INDEX idx_wiki_lightrag_state_status ON wiki_lightrag_index_state (status);
```

`knowledge_graph_nodes` / `knowledge_graph_edges` 本期不删，灰度结束在后续迁移（V97）里 `DROP TABLE`。业务图谱直接退役，不需要数据迁移。

## 12. docker-compose 改造

新增 neo4j service：

```yaml
  neo4j:
    image: ${NEO4J_IMAGE:-neo4j:5.26-community}
    container_name: git-ai-club-neo4j
    restart: unless-stopped
    environment:
      TZ: ${APP_TZ:-Asia/Shanghai}
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:-neo4j123}
      # 关闭内嵌鉴权插件，保持最小依赖。
      NEO4J_dbms_security_auth__enabled: "true"
    ports:
      - "${NEO4J_HTTP_PORT:-17474}:7474"
      - "${NEO4J_BOLT_PORT:-17687}:7687"
    volumes:
      - "${NEO4J_DATA_DIR:-./.data/neo4j}:/data"
    healthcheck:
      test: ["CMD-SHELL", "wget -O /dev/null -q http://localhost:7474 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
```

- `backend` 与 `code-processing` 的 `depends_on` 加 `neo4j: condition: service_healthy`。
- `.env.example` / `.env.server.example` 补 `NEO4J_PASSWORD` / `NEO4J_HTTP_PORT` / `NEO4J_BOLT_PORT` / `NEO4J_DATA_DIR`。
- 备份脚本（`scripts/`）补 Neo4j dump 步骤。

## 13. 前端改造

- `KnowledgeGraphView.vue`：**直接删除**，不重做此视图。路由 `projects/:projectId/knowledge-graph` 一并移除。知识图谱可视化入口统一收敛到 `WikiKnowledgeGraphView`。
- `WikiKnowledgeGraphView.vue`：作为唯一知识图谱入口，API 从 `/api/wiki/spaces/{id}/knowledge-graph` 改到 `/api/lightrag/graph?namespace=space:{id}`，DTO 结构兼容（后端适配层保持 `KnowledgeGraphNodeSummary` / `KnowledgeGraphEdgeSummary` 形状）。文案与标题同步调整（如"Wiki 知识图谱"保留，但图例与边类型说明按 LightRAG 真实边类型重写）。
- `KnowledgeGraphCanvas.vue`：无需改，边类型从单一 `SEMANTIC_SIMILAR` 扩展为多种语义边，画布按 `edgeType` 着色即可。
- Hermes 证据展示：无改动（后端 `buildWikiEvidenceMarkdown` 签名不变）。
- `frontend-public` 的 `KnowledgePage.tsx` 同步改 API。

## 14. 配置项汇总

### backend（application.yml）

```yaml
platform:
  lightrag:
    enabled: ${PLATFORM_LIGHTRAG_ENABLED:true}
    graph-node-limit: ${PLATFORM_LIGHTRAG_GRAPH_NODE_LIMIT:500}
    query:
      top-k: ${PLATFORM_LIGHTRAG_QUERY_TOP_K:3}
      default-mode: ${PLATFORM_LIGHTRAG_QUERY_DEFAULT_MODE:local}
    ingest:
      retry-max: ${PLATFORM_LIGHTRAG_INGEST_RETRY_MAX:5}
      scan-interval-ms: ${PLATFORM_LIGHTRAG_INGEST_SCAN_INTERVAL_MS:600000}
```

### code-processing（env）

```
PLATFORM_LIGHTRAG_ENABLED=true
PLATFORM_LIGHTRAG_NEO4J_URI=bolt://neo4j:7687
PLATFORM_LIGHTRAG_NEO4J_USER=neo4j
PLATFORM_LIGHTRAG_NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j123}
PLATFORM_LIGHTRAG_QDRANT_URL=http://qdrant:6333
PLATFORM_LIGHTRAG_QDRANT_API_KEY=
PLATFORM_LIGHTRAG_PG_KV_DSN=postgresql://aiclub:${POSTGRES_PASSWORD}@postgres:5432/ai_agent_platform
PLATFORM_LIGHTRAG_LLM_MODEL=              # 抽取用 LLM，由部署方自行配置
PLATFORM_LIGHTRAG_LLM_BASE_URL=
PLATFORM_LIGHTRAG_LLM_API_KEY=
# embedding 沿用现有 Wiki 配置（PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_*），不单独定义，
# 保证 LightRAG 新 collection 维度与现网一致，避免两套模型混写。
PLATFORM_LIGHTRAG_CONCURRENCY=1
```

## 15. 迁移与灰度策略

分四阶段，每阶段都可回滚。业务图谱直接退役，不参与双写。

**阶段一：基础设施就位**
- docker-compose 加 neo4j，code-processing 装 LightRAG + 路由，backend 加 `LightRagClientService` + `LightRagProperties`。
- Flyway V96 建队列 / 状态表。
- 不接任何业务流量，`/lightrag/health` 验证三后端连通。
- 回滚：删 neo4j service + 回 V96，不影响现有图谱。

**阶段二：双写并行**
- Wiki 保存时既写 Qdrant（旧）又入 `lightrag_ingest_queue`（新）。消费者跑起来索引到 LightRAG。
- Hermes 证据仍走旧 `WikiKnowledgeSearchService`。
- 业务图谱（`KnowledgeGraphService`）此阶段仍保留可用，直到阶段四统一删除。
- 验证 LightRAG 索引覆盖率（状态表 `INDEXED` 比例）、Neo4j 数据量、LLM 抽取成本。
- 回滚：停消费者，删队列数据，旧链路不受影响。

**阶段三：切流量**
- Hermes 证据切 `LightRagClientService.query`，灰度按 space 开关（`LightRagProperties` 加 `hermesEvidenceEnabledSpaces` 白名单）。
- Wiki 空间图谱可视化切 `LightRagClientService.getGraph`。
- 对比切流前后的检索质量（人工评测 + naive mode 基线）。
- 回滚：白名单清空，回旧链路。

**阶段四：退役清理**
- 停 Qdrant 双写，删 `wiki_space_chunks` / `wiki_project_chunks` collection。
- 删 `KnowledgeGraphService` / `WikiKnowledgeSearchService` / `WikiChunkingService` / `QdrantClientService` / `WikiKnowledgeProperties`。
- 删 `KnowledgeGraphController` 及其路由（`/api/projects/{id}/knowledge-graph` 与 `/rebuild`）。
- Flyway V97 `DROP TABLE knowledge_graph_nodes, knowledge_graph_edges`。
- 删 `frontend` 旧 API 调用与业务图谱入口。

## 16. 风险与对冲

| 风险 | 影响 | 对冲 |
|---|---|---|
| LightRAG `delete` API 在目标版本不稳定 | Wiki 删除时实体残留 | 阶段一 PoC 必须验证 delete（见 §18），失败则降级直写 Neo4j Cypher + Qdrant payload 删 |
| LLM 抽取成本随 Wiki 高频更新暴涨 | 账单失控 | 抽取用便宜模型；队列限并发；定时扫描只补落后版本不重抽全量 |
| Neo4j 单点故障 | 图查询与可视化不可用 | `/lightrag/health` 探活；Hermes 证据失败时降级 naive 向量（保留 Qdrant 旧 collection 直到阶段四） |
| LightRAG 多 workspace 实例管理复杂 | 内存 / 连接泄漏 | 单例 + 按 namespace 切 workspace，不持有多实例；连接池复用 |
| 业务结构图入口消失，用户预期落差 | `KnowledgeGraphView` 直接删除，用户无法再看到项目结构图 | `WikiKnowledgeGraphView` 改读 LightRAG 后展示更丰富的 Wiki/PRD 语义关系图；阶段三切流前 `WikiKnowledgeGraphView` 仍走旧接口可用，结构图入口在阶段四才真正下线，给用户观察期 |
| 灰度期双写数据不一致 | 切流后结果偏差 | 状态表 + 定时扫描兜底；切流前做全量一致性校验脚本 |

## 17. 不在范围

- Hindsight 用户记忆向量系统（独立链路）。
- GitNexus 代码知识图谱（独立索引）。
- 业务实体的结构化关系图谱（已确认废弃）。
- 跨 project / space 的全局图谱合并。
- query 自动分类器选 mode（本期 Hermes 固定 `local`）。
- LightRAG 的增量社区检测调优（用默认参数）。

## 18. PoC 验证清单（阶段一前置项）

进入阶段二前必须验证：

1. **`delete` 可用性**：按 `source_id` 删实体，确认 Neo4j / Qdrant / PG KV 三后端同步清理；不可用则实现 Cypher 降级路径。
2. **`query` 四种 mode 返回格式**：钉死返回结构，backend 反序列化才能落地。
3. **Neo4j 连接池在 code-processing 单例下的稳定性**：压测 100 次连续 `insert` + `query`，看连接是否泄漏。
4. **embedding 维度对齐**：确认抽取 LLM 与 embedding 模型组合下，Qdrant collection 维度一致。
5. **成本估算**：用真实 Wiki 页面样本（100 页，含 PRD）跑一轮全量索引，记录 LLM 调用次数与 token 消耗，推算日常更新成本。

PoC 结果补到本文档附录或 `docs/wiki-lightrag-poc-result.md`。

---

版本：v1
日期：2026-06-22
关联：`docs/wiki-knowledge-graph-technical-design-v1.md`（被本设计取代）、`docs/architecture.md`（需同步更新知识图谱段落）
