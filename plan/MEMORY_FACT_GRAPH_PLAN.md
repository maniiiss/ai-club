# 记忆事实图实施方案

## 1. 背景

当前项目管理中的“知识图谱”本质上是平台业务实体关系图，核心节点来自项目、迭代、工作项、测试计划、测试用例、用户、Agent、Wiki 等主数据。它适合表达“谁属于谁、谁关联谁”的逻辑结构，但并不适合直接承载 Hindsight 中的记忆事实。

本次要建设的目标不是继续增强“项目管理逻辑图”，而是单独建设一套**记忆事实图**：

- 主数据源来自 Hindsight
- 图谱骨架来自 Hindsight 的实体图能力
- 证据层来自 Hindsight 的 World Facts
- 平台负责做项目级过滤、接口适配、权限控制和前端可视化

换句话说，后续页面上看到的图，不再是“项目结构图”，而是“项目相关记忆在 Hindsight 中沉淀出来的事实关系图”。

## 2. 目标

### 2.1 核心目标

- 在项目维度展示 Hindsight 中沉淀的实体关系图
- 支持查看实体之间的关联强度、证据事实和来源摘要
- 支持按项目过滤，只展示当前项目相关的记忆
- 为后续 Hermes 记忆分析、经验复盘、问题归因、上下文发现提供统一入口

### 2.2 非目标

- 不复用现有 `kg_node` / `kg_edge` 作为第一版事实图主存储
- 不把 Hindsight World Facts 原样写回平台业务主表
- 不在第一版中做复杂编辑能力，不支持手工改图
- 不要求第一版就把所有记忆源全部纳入，只需先打通项目维度的事实图读取和展示

## 3. 结论与设计原则

### 3.1 总体结论

**记忆事实图应以 Hindsight 为主数据源独立建设，而不是直接塞进现有项目管理知识图谱。**

原因如下：

- 现有图谱是平台业务对象投影，语义上偏“结构关系”
- 事实图是 Hindsight 的记忆投影，语义上偏“实体关系 + 事实证据”
- 两者节点类型、边类型、证据模型、置信度模型都不同
- 现有前端图例、颜色和交互逻辑基本围绕项目管理实体写死，直接混入事实节点会造成展示语义混乱

### 3.2 设计原则

- Hindsight 是事实源头，平台只做适配和筛选
- 项目维度通过 bank 或标签隔离，避免跨项目串数据
- 图结构和事实证据分层返回，避免前端一次性承载过重语义
- 第一版优先只读，不做事实写回
- 第一版优先接 Hindsight 在线接口，不额外做平台侧持久化缓存

## 4. 当前仓库现状

### 4.1 现有项目图谱现状

当前后端 `KnowledgeGraphService` 在重建图谱时会直接从平台业务表装配节点和边，并写入 `kg_node` / `kg_edge`。这套逻辑更适合“项目结构图”，不适合作为记忆事实图底座。

### 4.2 现有 Hindsight 集成现状

当前项目已经具备 Hindsight 接入能力，但主要聚焦于 Wiki：

- Wiki 页面 retain 到 Hindsight
- Wiki 页面 recall 做语义检索
- 已有 bank 前缀、超时、预算等通用配置

因此，接入“记忆事实图”时，优先复用现有 Hindsight 配置类和 HTTP 客户端模式，而不是重新造一套通信层。

### 4.3 当前缺口

当前平台中缺少以下能力：

- 面向普通记忆 bank 的 World Facts 读取能力
- 面向普通记忆 bank 的实体图读取能力
- 面向项目维度的 bank / tag 过滤策略
- 面向事实图的前端节点、边、详情面板模型

## 5. 推荐架构

### 5.1 架构概览

推荐采用“在线代理 + 前端渲染”的模式：

1. 前端请求“项目记忆事实图”
2. 后端根据项目 ID 计算目标 Hindsight bank 或过滤条件
3. 后端调用 Hindsight 实体图接口获取实体关系骨架
4. 后端调用 Hindsight 事实接口获取 World Facts 证据
5. 后端将实体、关系、证据整理成前端稳定 DTO
6. 前端渲染图，并在节点/边选中时展示事实详情

### 5.2 为什么第一版不落平台库

- Hindsight 才是记忆事实真实来源
- 第一版最重要的是验证图谱价值，不是做冗余存储
- 事实图结构可能随 Hindsight API 细节变化，需要先观察真实返回
- 平台当前 `kg_node.biz_id` 为数值型，不适合直接承载 Hindsight 的字符串型事实/实体标识

如果后续需要提高性能或支持离线审计，再考虑增加缓存表或快照表。

## 6. 数据范围与隔离策略

### 6.1 项目粒度隔离

第一版建议按“项目相关记忆”隔离事实图，优先使用以下策略：

- 优先使用项目级 bank
- 如果 Hermes/Hindsight 当前只有共享 bank，则必须强制使用 `project:{projectId}` 标签过滤

### 6.2 推荐约定

后续所有需要进入事实图的数据，在 retain 时都应带上统一标签，例如：

- `project:{projectId}`
- `source:wiki`
- `source:hermes`
- `source:execution`
- `module:{moduleCode}`

这样后续无论事实来自 Wiki、Hermes 记忆、执行总结还是经验沉淀，都能统一过滤。

### 6.3 第一版事实来源

建议第一版先纳入以下来源：

- 已进入 Hindsight 的 Wiki 内容
- Hermes 运行过程中已经沉淀到目标 bank 的通用记忆

先不强行纳入尚未标准化 retain 的其他数据源。

## 7. 后端设计

### 7.1 新接口建议

建议不要复用现有 `/api/projects/{projectId}/knowledge-graph`，而是新增独立接口：

```text
GET /api/projects/{projectId}/memory-fact-graph
GET /api/projects/{projectId}/memory-fact-graph/facts
GET /api/projects/{projectId}/memory-fact-graph/entity/{entityId}
```

建议说明：

- `memory-fact-graph`：返回实体图主结构
- `facts`：按实体、边或关键词补充事实证据
- `entity/{entityId}`：读取实体详情和相关事实

### 7.2 DTO 设计建议

建议新建独立 DTO，而不是复用当前 `KnowledgeGraphSummary`。

推荐模型如下：

```text
MemoryFactGraphSummary
- projectId
- bankId
- generatedAt
- nodeCount
- edgeCount
- factCount
- nodes: List<MemoryFactNodeSummary>
- edges: List<MemoryFactEdgeSummary>

MemoryFactNodeSummary
- id: String
- entityType: String
- label: String
- aliases: List<String>
- degree: Integer
- metadataJson: String

MemoryFactEdgeSummary
- id: String
- sourceId: String
- targetId: String
- relationType: String
- weight: Double
- factIds: List<String>
- metadataJson: String

MemoryFactItem
- id: String
- type: String
- subject: String
- predicate: String
- object: String
- summary: String
- confidence: Double
- sourceType: String
- createdAt: String
- tags: List<String>
- metadataJson: String
```

### 7.3 Service 设计建议

建议新增：

- `MemoryFactGraphService`
- `MemoryFactGraphController`
- `MemoryFactGraphAssembler`

职责划分：

- `HindsightClientService`：继续负责底层 HTTP 通信
- `MemoryFactGraphService`：负责项目维度过滤、聚合和容错
- `Assembler`：负责把 Hindsight 返回结构转成前端稳定 DTO

### 7.4 HindsightClientService 扩展点

在现有 Wiki retain/recall 之外，补充：

- 获取实体图方法
- 获取 World Facts 方法
- 获取单实体详情方法

建议新增方法形态：

```java
MemoryEntityGraph fetchEntityGraph(String bankId, List<String> tags)
List<MemoryWorldFact> listWorldFacts(String bankId, List<String> tags, int limit)
List<MemoryWorldFact> recallWorldFacts(String bankId, String query, List<String> tags, int limit)
MemoryEntityDetail getEntityDetail(String bankId, String entityId)
```

### 7.5 容错策略

第一版必须考虑 Hindsight 接口失败时的降级：

- 图接口失败时，返回空图 + 明确错误消息
- 事实接口失败时，图可正常显示，但右侧证据区提示暂不可用
- 单实体详情失败时，不影响整图展示

## 8. 前端设计

### 8.1 页面策略

有两种可选路径：

#### 方案 A：替换当前“知识图谱”页面

优点：

- 入口简单
- 用户心智统一

缺点：

- 会覆盖当前逻辑图能力
- 语义容易混淆

#### 方案 B：新增“记忆事实图”页面

优点：

- 语义清晰
- 不影响当前项目结构图
- 后续两套图都可保留

缺点：

- 菜单和路由会多一个入口

**推荐第一版采用方案 B。**

### 8.2 组件策略

建议不要直接复用当前 `KnowledgeGraphCanvas` 作为最终方案，但可以借它的 G6 渲染骨架。

推荐新增：

- `MemoryFactGraphCanvas.vue`
- `MemoryFactGraphView.vue`
- `MemoryFactPanel.vue`

原因：

- 当前组件节点类型、颜色和图例顺序偏业务实体
- 事实图更适合“实体类别 + 关系强度 + 证据数量”这类视觉表达

### 8.3 前端交互建议

第一版建议具备以下交互：

- 节点点击：查看实体详情
- 边点击：查看该关系对应的 World Facts
- 搜索框：按实体名快速定位
- 过滤器：按事实来源、实体类型、关系类型过滤
- 刷新按钮：重新请求 Hindsight 最新图

### 8.4 视觉表达建议

节点建议维度：

- 大小：实体相关事实数量或连接度
- 颜色：实体类型
- 副标题：别名、来源或最近活跃时间

边建议维度：

- 粗细：关系强度
- 高亮：点击后联动事实面板
- 标签：关系类型，可按缩放级别控制是否显示

## 9. 分阶段实施计划

### Phase 1：打通基础读取链路

目标：

- 后端能从 Hindsight 拉实体图
- 前端能展示基础节点/边
- 页面可按项目访问

任务：

- 扩展 `HindsightClientService`
- 新增 `MemoryFactGraphService`
- 新增 `MemoryFactGraphController`
- 新增前端 API 和基础图页面

验收标准：

- 打开项目页时能看到实体图
- 图中至少能展示节点、边、基础标签

### Phase 2：补齐 World Facts 证据层

目标：

- 节点和边可查看支撑事实
- 右侧详情面板展示事实列表

任务：

- 补充 World Facts 列表/召回接口
- 前端右侧详情面板联动
- 支持边 -> 事实、节点 -> 事实的映射展示

验收标准：

- 点击节点/边时可查看对应事实
- 事实包含摘要、来源、时间、标签等字段

### Phase 3：补齐项目级过滤与来源治理

目标：

- 确保事实图只展示当前项目相关记忆
- 统一各类 retain 数据的标签规范

任务：

- 梳理 Hermes/Wiki retain 标签策略
- 增加 `project:{id}` 约束
- 对历史数据评估是否需要补标或重灌

验收标准：

- 不同项目之间事实图不会串数据
- 同一项目中 Wiki 和 Hermes 记忆可以共图展示

### Phase 4：增强可用性

目标：

- 提供搜索、过滤、刷新、空态说明等增强能力

任务：

- 增加过滤面板
- 增加实体搜索
- 增加错误提示和空态提示
- 优化大图性能

## 10. 风险与注意事项

### 10.1 Hindsight 返回结构存在版本差异风险

需要先在本地环境中抓一次真实响应，确认以下问题：

- 实体图接口路径
- 返回字段名
- World Facts 结构
- 实体与事实之间的关联字段

因此，第一版实现前建议先做一次“接口探测脚本”。

### 10.2 当前 bank 组织方式未必天然适合项目隔离

如果 Hermes 当前把多个项目的记忆都写进同一个 bank，而又没有统一项目标签，那么事实图第一版会出现串图风险。这个问题需要在真正开发前优先确认。

### 10.3 现有前端图组件不宜硬改

当前项目结构图组件与业务实体耦合较深，如果直接在原组件上打补丁，后续维护成本会变高。应优先新建事实图组件，避免相互污染。

### 10.4 不建议第一版落库缓存

如果一开始就做缓存表、快照表、同步任务，会显著扩大实现范围，不利于尽快验证价值。建议先在线读取，后续再按性能瓶颈决定是否缓存。

## 11. 待确认事项

正式开发前建议确认以下事项：

1. 当前 Hermes 主记忆是否已经写入 Hindsight 指定 bank
2. 这些记忆是否已经带有 `project:{projectId}` 标签
3. Hindsight 本地版本是否支持目标实体图接口
4. World Facts 是否能按项目维度稳定过滤
5. 页面入口是新增“记忆事实图”，还是替换当前“知识图谱”

## 12. 推荐实施顺序

如果后续开始实现，建议按下面顺序推进：

1. 先写一个本地探测脚本，验证 Hindsight 实际返回结构
2. 再扩展后端 Hindsight 客户端和 DTO
3. 打通项目级事实图接口
4. 新建前端事实图页面
5. 最后补证据面板、过滤器和标签治理

## 13. 第一版完成标志

满足以下条件时，可认为第一版“记忆事实图”落地成功：

- 能在项目维度打开记忆事实图页面
- 页面图结构直接来自 Hindsight 实体图
- 点击节点/边可查看对应 World Facts
- 项目之间不会明显串数据
- 不依赖平台额外持久化缓存

