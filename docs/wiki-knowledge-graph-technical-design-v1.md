# Wiki 向量化数据知识图谱技术设计 v1

## 1. 背景与目标

Wiki 模块的页面内容会被切分为 chunk 并写入 Qdrant 向量库（空间侧 collection 默认 `wiki_space_chunks`），
用于召回搜索、相关页面和 Hermes 证据拼装。但向量数据此前没有任何可视化出口，
用户无法直观看到「向量化数据之间的关联」。

本设计在**单个 Wiki 空间**维度提供一个知识图谱视图：

- 以**页面**为图谱节点（页面级粒度，而非 chunk 级，保证可读性）；
- 同时呈现两类关系：
  - **目录归属边（结构）**：页面属于哪个目录；
  - **向量语义相似边（语义）**：页面之间在向量空间里的余弦相似度超过阈值。

两类边用不同颜色区分（语义紫、结构橙），复用既有 G6 画布组件。

## 2. 数据来源与派生算法

向量本体只存在于 Qdrant，业务库没有向量列。因此节点与边都需要从 Qdrant 派生：

### 2.1 批量拉取

`QdrantClientService.scrollPoints(collection, equalsFilter, withVectors, pageSize)`
调用 Qdrant `POST /collections/{c}/points/scroll`，按 `next_page_offset` 翻页拉全
（`search` 只能按相似度召回 topK，覆盖不了全量）。构图时 `withVectors=true`、
过滤条件 `{spaceId}`。collection 不存在时与 `search` 一致降级为空列表。

### 2.2 页面级聚合（质心）

同一页面的多个 chunk 向量做**算术平均**得到页面质心向量：

```
centroid(page) = (1 / chunkCount) * Σ chunk_vector
```

聚合时同时从任一 chunk 的 payload 取出 `title / slug / directoryId`，
脏数据（维度不一致的 chunk）会被跳过，避免污染质心。

### 2.3 目录归属边

每个页面按 payload 的 `directoryId` 连一条 `BELONGS_TO_DIRECTORY` 边到目录节点；
目录节点按需补建。目录名称由后端 `WikiSpaceService` 从业务库读出后注入
（Qdrant payload 不含目录名）。

### 2.4 语义相似边

页面质心两两计算**余弦相似度**，`>= similarity-threshold`（默认 0.78）才生成
`SEMANTIC_SIMILAR` 边。为避免稠密空间里边爆炸，按相似度从高到低裁剪，
每个节点最多保留 `max-edges-per-node`（默认 6）条边。
余弦相似度与归一化用纯 Java 实现，无新增依赖。

## 3. 节点 id 约定

目录与页面共用一张数值 id 表，供前端画布统一处理：

- 页面节点 id = `pageId`；
- 目录节点 id = `DIRECTORY_NODE_ID_OFFSET(1_000_000_000) + directoryId`；
- `bizId` 始终为真实业务主键，前端跳转页面用 `bizId`。

## 4. 接口契约

`GET /api/wiki/spaces/{spaceId}/knowledge-graph`（权限 `wiki:view`）
→ `ApiResponse<WikiSpaceKnowledgeGraph>`

```
WikiSpaceKnowledgeGraph {
  spaceId, spaceName, vectorEnabled, generatedAt,
  nodes: [{ id, nodeType(WIKI_PAGE|WIKI_DIRECTORY), bizId, name, slug, directoryId, chunkCount, metadataJson }],
  edges: [{ id, fromNodeId, toNodeId, edgeType(BELONGS_TO_DIRECTORY|SEMANTIC_SIMILAR), similarity, evidenceText }]
}
```

`vectorEnabled=false`（未配置 Embedding 模型）时返回空 nodes/edges 并提示，不报错。
权限校验复用 `WikiSpaceService.requireSpaceVisible`，与目录树等接口一致。

## 5. 前端

- 入口：`WikiSpaceView` 空间卡片新增「查看知识图谱」按钮，
  跳转路由 `wiki-space-knowledge-graph`（`/wiki/spaces/:spaceId/knowledge-graph`，懒加载）。
- 视图：`WikiKnowledgeGraphView.vue`，复用 `KnowledgeGraphCanvas.vue`，
  将 Wiki 图谱 DTO 适配成画布通用的 `KnowledgeGraphNodeItem/EdgeItem`。
- **相似度阈值滑块**在前端对 `SEMANTIC_SIMILAR` 边做本地二次过滤
  （后端给较低阈值的全量，前端可临时收紧），无需重复请求；
  结构边始终保留，阈值收紧后会隐藏失去全部连接的孤立页面节点。
- 提供节点/边列表、选中详情、页面跳转。

## 6. 配置项（`platform.wiki-knowledge.graph.*`）

| key | 默认值 | 含义 |
|-----|--------|------|
| `similarity-threshold` | 0.78 | 生成语义边的最小余弦相似度，范围 0~1 |
| `max-edges-per-node` | 6 | 每个节点最多保留的语义边数（按相似度裁剪） |
| `scroll-page-size` | 256 | Qdrant scroll 单页拉取数量，范围 16~1024 |

## 7. 不在本期范围

- chunk 级节点（信息过密，可读性差）；
- 跨空间 / 全局 Wiki 图谱；
- 改动 Qdrant 写入与索引流程（只新增读取）；
- 项目需求关联图谱（`KnowledgeGraphService`）逻辑不变。
