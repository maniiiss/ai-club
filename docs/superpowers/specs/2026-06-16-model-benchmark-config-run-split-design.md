# 模型对比测试：配置与运行记录分离设计

- 日期：2026-06-16
- 范围：`backend/`、`frontend/`、Flyway 迁移、`docs/`
- 关联模块：模型管理 → 对比测试（Model Benchmark）
- 关联提交：`9f1686e Add model benchmark features and fix migration compatibility`（V80 引入对比测试时的一体化模型）

## 1. 背景

V80 引入"模型对比测试"时，把"配置参数"与"一次运行的状态/进度/指标"压缩进同一张
`ai_model_benchmark_run` 表。前端列表事实上就是 run 列表，每次"重跑"通过克隆配置造一条
新 run 实现"历史多次运行可对比"。这导致：

1. 用户无法对同一份配置反复"修改 → 触发"，每次修改都要新建一条；
2. 重跑后的 run 名字被自动追加 `-重跑`，列表语义混乱；
3. 没有"配置"这个一等概念，沉淀不下"我惯用的几组测试配置"。

本设计把"配置"与"运行记录"拆为两层：列表是配置（管理面），详情抽屉里看运行记录与
指标对比（观察面）。

## 2. 目标与非目标

### 目标
- 拆出独立的 `ai_model_benchmark_config` 实体，承载"可重复编辑、可重复触发"的配置。
- 每次触发运行生成独立 `ai_model_benchmark_run` 行，并保留触发瞬间的配置快照，
  保证历史指标的可追溯性。
- 列表页改造为配置维度，行内附带"最近一次运行摘要 + 历史运行次数"。
- 详情抽屉重构为"配置摘要 + 运行记录 Tab + 指标对比 Tab"。
- 智能合并迁移历史 run，保留全部历史指标可观察性。

### 非目标
- 不引入"单次请求"级明细表，仍只到聚合 metric 行。
- 不调整 `BenchmarkInvoker` / `ModelBenchmarkMetrics` / `BenchmarkAsyncConfig` 的实现细节。
- 不改 `code-processing` 服务（它本就没有 benchmark 接口）。
- 不变更权限码：写 = `model:benchmark`，读 = `model:view`。

## 3. 数据模型

### 3.1 新增表 `ai_model_benchmark_config`

| 字段              | 类型          | 说明                                       |
| ----------------- | ------------- | ------------------------------------------ |
| `id`              | bigint PK     |                                            |
| `name`            | varchar(128)  | 配置名，无强唯一约束（沿用 V80 现状）      |
| `concurrency`     | int           | 并发                                       |
| `total_requests`  | int           | 单模型总请求数                             |
| `stream_enabled`  | boolean       | 是否流式                                   |
| `max_tokens`      | int           |                                            |
| `system_prompt`   | text          |                                            |
| `user_prompt`     | text          |                                            |
| `model_ids`       | text          | JSON 数组字符串，沿用 V80                  |
| `created_by`      | bigint        |                                            |
| `created_at`      | timestamp     |                                            |
| `updated_at`      | timestamp     |                                            |

索引：
- `idx_benchmark_config_created_at(created_at)`
- `idx_benchmark_config_created_by(created_by)`

### 3.2 改造 `ai_model_benchmark_run`

- 新增列 `config_id bigint NOT NULL`，外键 → `ai_model_benchmark_config(id)` `ON DELETE RESTRICT`。
  级联清理由 service 层显式完成，避免 DB 隐式删除让事务边界不可见。
- 现有 `name / concurrency / total_requests / stream_enabled / max_tokens / system_prompt /
  user_prompt / model_ids` 字段全部保留，语义改为"运行时配置快照"。
- 现有 `status / progress_total / progress_done / error_message / created_by / created_at /
  updated_at / finished_at` 不动。
- 新增索引 `idx_benchmark_run_config_id_created_at(config_id, created_at desc)`，给"列表行
  最近一次运行"和"详情抽屉按时间倒序列出"用。

### 3.3 不动
- `ai_model_benchmark_metric` 完全不动，仍按 `run_id` 关联。

### 3.4 历史数据迁移（同 V81 脚本内）

按"智能合并去重"策略：

1. 用 CTE / 临时表扫描所有现存 `ai_model_benchmark_run`：
   - 计算"基准 name" = 把末尾的 `-重跑`（可能多次叠加，如 `-重跑-重跑`）逐层裁掉；
   - 分组键 = `(基准 name, concurrency, total_requests, stream_enabled, max_tokens,
     MD5(system_prompt), MD5(user_prompt), model_ids)`。`system_prompt` / `user_prompt`
     是 TEXT，必须哈希后再 GROUP BY 以兼容 MySQL `utf8mb4` 的 GROUP 长度限制；`model_ids`
     来自同一段 Java 序列化代码，字面量稳定，可直接参与分组。
2. 每个分组取最早创建 run 的 `created_by / created_at` 作为 config 元信息，向
   `ai_model_benchmark_config` 插入一条；name 用基准 name；其余配置字段直接复制该最早 run。
3. 把组内所有 run 的 `config_id` 回填到该 config 的 id；run 自身的 `name` 保持原样
   （原本带 `-重跑` 的就是历史快照名，不改）。
4. 给 `config_id` 加 `NOT NULL` 约束。

迁移完成后，旧的"重跑链"会自动收敛到一个 config 下；不同字段的 run 各自变成独立 config，
对一对一回退场景仍是无损的。

## 4. 后端模块

### 4.1 实体 / Repository

新增：
- `ModelBenchmarkConfigEntity`。
- `ModelBenchmarkConfigRepository extends JpaRepository, JpaSpecificationExecutor<...>`。

`ModelBenchmarkRunEntity` 增加 `Long configId`（保持平铺，不引入双向关联）。

`ModelBenchmarkRunRepository` 新增方法：
- `List<ModelBenchmarkRunEntity> findAllByConfigIdOrderByCreatedAtDesc(Long configId)`
- `Optional<ModelBenchmarkRunEntity> findFirstByConfigIdOrderByCreatedAtDesc(Long configId)`
- `long countByConfigId(Long configId)`
- `boolean existsByConfigIdAndStatusIn(Long configId, Collection<RunStatus> statuses)`
- `void deleteAllByConfigId(Long configId)`

### 4.2 DTO

新增：
- `ModelBenchmarkConfigCreateRequest`：字段 = 当前 `ModelBenchmarkCreateRequest`
  减去运行态字段。
- `ModelBenchmarkConfigUpdateRequest`：同上。
- `ModelBenchmarkConfigSummary`：列表行用，含 config 基本字段 +
  `latestRun: ModelBenchmarkRunSummary?` + `runCount: long`。
- `ModelBenchmarkConfigDetail`：抽屉顶部用，含 config 字段 + `hasActiveRun: boolean`。

调整：
- `ModelBenchmarkRunSummary` / `ModelBenchmarkRunDetail` 增加 `configId`。
- `ModelBenchmarkRunDetail` 中既有的配置字段在文档注释中明确"运行时快照"。
- `ModelBenchmarkCreateRequest` 保留为 service 内部数据载体，不再作为 HTTP 请求体。

### 4.3 Service 拆分

#### `ModelBenchmarkConfigService`（新增）
- `pageConfigs(filter, pageable)`：分页 config，对每条 config 用
  `findFirstByConfigIdOrderByCreatedAtDesc` + `countByConfigId` 拼出 `latestRun` /
  `runCount`。允许 N+1 在分页大小内执行；如未来出现性能问题，可在 PR 中改成单次 IN 查询。
- `getConfigDetail(id)`：返回 `ModelBenchmarkConfigDetail`。
- `createConfig(req)`：直接落库。
- `updateConfig(id, req)`：写入前调用
  `existsByConfigIdAndStatusIn(id, [PENDING, RUNNING])`，命中抛 409
  （`code = "BENCHMARK_CONFIG_HAS_ACTIVE_RUN"`）。
- `deleteConfig(id)`：见 §6 删除策略。
- `runConfig(id, nameSuffix?)`：组装 `ModelBenchmarkCreateRequest`，调用
  `ModelBenchmarkService.createAndStart(req, configId)` 触发；触发前先
  `existsByConfigIdAndStatusIn` 校验 active run。

#### `ModelBenchmarkRunService`（新增独立类）
- `pageRunsByConfig(configId, pageable)`：抽屉 Tab 1 用。
- `getRunDetail(runId)`：复用现有逻辑（迁移自旧 `ModelBenchmarkService`）。
- `cancelRun(runId)` / `deleteRun(runId)`：复用现有逻辑。

> 拆为独立类的理由：原 `ModelBenchmarkService` 已偏长；配置 CRUD 与运行编排是两层
> 关注点，分开能让每个类的职责"在一屏内能讲清楚"。

#### `ModelBenchmarkService`（保留，聚焦"执行编排"）
- `createAndStart(req, configId)`：唯一执行入口；写 run 时填 `configId`。
- 删除旧的"无 config 直接跑"重载。
- `rerunBenchmark(runId)` 的对外 endpoint 删除（见 §5），实现也删除。

### 4.4 Controller

新增 `ModelBenchmarkConfigController`，挂在 `/api/model-benchmark-configs`。
保留 `ModelBenchmarkController`，但只剩 run 维度的几个端点，删除批量列表 / 创建 / 重跑。

## 5. REST API

### 5.1 新增（配置维度）

| Method | Path                                              | 权限              | 说明                                                                                          |
| ------ | ------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/api/model-benchmark-configs`                    | `model:view`      | 分页查询 config，每行带 `latestRun` + `runCount`。本期支持 keyword + 分页。                    |
| GET    | `/api/model-benchmark-configs/{id}`               | `model:view`      | 详情 `ModelBenchmarkConfigDetail`，含 `hasActiveRun`。                                         |
| POST   | `/api/model-benchmark-configs`                    | `model:benchmark` | 仅创建配置，不触发运行。                                                                       |
| PUT    | `/api/model-benchmark-configs/{id}`               | `model:benchmark` | 编辑配置；存在 PENDING/RUNNING run 时 409。                                                    |
| DELETE | `/api/model-benchmark-configs/{id}`               | `model:benchmark` | 删除配置（级联其全部 run + metric）；存在 active run 时 409。                                  |
| POST   | `/api/model-benchmark-configs/{id}/runs`          | `model:benchmark` | 触发一次运行；存在 active run 时 409。请求体可空，可选 `{ "nameSuffix": "..." }`。返回 run summary。|
| GET    | `/api/model-benchmark-configs/{id}/runs`          | `model:view`      | 分页该 config 的运行历史（`ModelBenchmarkRunSummary[]`）。                                     |

### 5.2 调整 / 保留（run 维度）

| Method | Path                                  | 改动     | 说明                                                                  |
| ------ | ------------------------------------- | -------- | --------------------------------------------------------------------- |
| GET    | `/api/model-benchmarks/{id}`          | 保留     | run 详情，response 增加 `configId`。                                   |
| GET    | `/api/model-benchmarks/{id}/progress` | 保留     | 不变。                                                                 |
| POST   | `/api/model-benchmarks/{id}/cancel`   | 保留     | 不变。                                                                 |
| DELETE | `/api/model-benchmarks/{id}`          | 保留     | 删单条 run + 其 metric。                                               |
| POST   | `/api/model-benchmarks`               | **删除** | 旧"创建并立即启动"。前端切换到先 POST config 再 POST runs。            |
| GET    | `/api/model-benchmarks`               | **删除** | 旧"全局 run 列表"。新前端用 config 列表 + 子资源 runs。                |
| POST   | `/api/model-benchmarks/{id}/rerun`    | **删除** | 收口为 `POST /api/model-benchmark-configs/{configId}/runs`。           |

错误约定：
- 所有 409 使用统一 code = `BENCHMARK_CONFIG_HAS_ACTIVE_RUN`，message =
  "配置存在进行中的运行，请先取消后再编辑"（编辑场景）/
  "配置存在进行中的运行，无法删除/再次触发"（删除/触发场景）。

## 6. 删除 / 编辑 / 触发约束

### 编辑 config
- service 层 `existsByConfigIdAndStatusIn(PENDING, RUNNING)` 命中 → 抛 409。
- 前端编辑按钮始终可用，依赖后端 409 反馈，避免基于轮询过期状态误判。

### 删除 config
- 校验：存在 PENDING/RUNNING run → 409。
- 单事务内：`runRepository.findAllByConfigId` → `metricRepository.deleteByRunId` 批量删 →
  `runRepository.deleteAllByConfigId` → 删 config。
- 前端 confirm：
  > "删除该配置将同时删除其全部 N 次运行记录与指标数据，操作不可恢复。是否继续？"

### 删除单条 run
- 行为不变。RUNNING 拒绝；否则删 metric + run。

### 触发运行
- `POST /api/model-benchmark-configs/{id}/runs`：存在 PENDING/RUNNING run 返回 409。
- **强约束：同一份 config 同一时刻只允许一条 active run**。

### 取消运行
- 仍走 `POST /api/model-benchmarks/{runId}/cancel`，作用于 run 维度。

### 命名 / 快照
- 创建 run 时 `run.name = config.name`，不再自动追加 `-重跑`。
- 触发 run 时拷贝当时 config 的全部配置字段为快照，编辑 config 不影响历史 run。

### 权限
- 写 = `model:benchmark`，读 = `model:view`，与 V80 一致；不需要新增权限迁移。

## 7. 前端

### 7.1 路由与菜单
- 路由 name 由 `model-benchmarks` → `model-benchmark-configs`，path 同步。激活菜单仍 `/models`。
- `AppLayout.vue` 菜单 `matchNames` 同步更新。
- `ModelView.vue` 嵌入子组件由 `ModelBenchmarkView.vue` 改名为 `ModelBenchmarkConfigView.vue`
  （改名而非新建+删除，保留 git 历史）。

### 7.2 列表页 `ModelBenchmarkConfigView.vue`
- 列：name / 模型数(modelIds.length) / 并发 / 总请求 / 最近运行状态 / 最近运行进度（仅
  RUNNING 显示） / 最近运行时间 / 历史运行次数 / 创建人 / 更新时间 / 操作。
- 操作列：**运行 / 编辑 / 详情 / 删除**；当 `latestRun.status ∈ {PENDING, RUNNING}` 时
  "运行"切换为"取消"，调用 `POST /api/model-benchmarks/{latestRun.id}/cancel`。
- 顶部"新建配置"按钮 → 弹出 `ConfigEditorDialog`（create 模式）。
- 列表轮询：当前页存在 RUNNING/PENDING 行时每 1.5s 刷新；全部静止时停止。

### 7.3 `ConfigEditorDialog.vue`（新增）
- 字段集合 = 现有 `BenchmarkCreateDialog` 的字段
  （name / concurrency / totalRequests / streamEnabled / maxTokens / systemPrompt /
  userPrompt / modelIds）。
- 模式：`create` / `edit`。`edit` 收到 409 时弹错误 toast。
- 校验沿用现有规则（必填 / 范围）。

### 7.4 详情抽屉 `ModelBenchmarkConfigDrawer.vue`（替换原 `ModelBenchmarkDrawer.vue`）

#### 顶部（常驻）
- 配置摘要卡片：name / 并发 / 总请求 / 流式 / max_tokens / modelIds(chip) /
  systemPrompt / userPrompt（折叠展开）。
- 右上按钮组：
  - **编辑配置**：打开 `ConfigEditorDialog` edit 模式。
  - **立即运行**：无 active run 时直接执行 + toast；有 active run 时按钮置灰 + tooltip
    "已有运行进行中"。
  - **取消运行**：仅 active run 存在时显示，作用于该 run。

#### Tab 1 "运行记录"
- 表格列：创建时间 / 状态 / 进度 / 耗时（finishedAt - createdAt） / 操作（查看指标 / 删除）。
- 点行 = "查看指标"，把选中 run 同步到 Tab 2 并切过去。
- 顶部"刷新"按钮；存在 active run 时同样 1.5s 轮询。

#### Tab 2 "指标对比"
- 复用现有指标对比表组件（最优值高亮 / TTFT / avg / P50 / P95 / token-s / QPS 等）。
- 头部一行："当前查看：{run.name} · {createdAt} · {status}"，并提供 run 切换下拉
  （备份入口）。
- 默认进入抽屉时显示该 config 的最近一次成功 run；若无成功 run 则显示最近一次任意状态
  的 run；若一条都没有，显示空态："该配置暂未运行，点击右上角『立即运行』开始"。

### 7.5 API 模块
- 新增 `frontend/src/api/modelBenchmarkConfig.ts`：
  `pageConfigs / getConfigDetail / createConfig / updateConfig / deleteConfig /
  runConfig / pageRunsByConfig`。
- 改造 `frontend/src/api/modelBenchmark.ts`：保留
  `getBenchmarkDetail / getBenchmarkProgress / cancelBenchmark / deleteBenchmark`；
  删除 `pageBenchmarks / createBenchmark / rerunBenchmark`。
- `frontend/src/types/platform.ts`：新增 `ModelBenchmarkConfigSummary /
  ModelBenchmarkConfigDetail`；`ModelBenchmarkRunSummary` / `ModelBenchmarkRunDetail`
  增加 `configId`。

## 8. 测试与验证

### 8.1 后端 JUnit

新增 `ModelBenchmarkConfigServiceTests`：
- `createConfig` 字段持久化正确。
- `updateConfig` 正常更新；存在 RUNNING run 抛 409。
- `deleteConfig` 级联：1 config + 2 run + 4 metric → 全部清空。
- `deleteConfig` 存在 active run → 409。
- `runConfig` 写入新 run 且快照字段 = config 当时字段；存在 active run → 409。

新增 / 改造 `ModelBenchmarkServiceTests`：
- `cancelBenchmark` / `deleteBenchmark` 行为回归。
- `pageRunsByConfig` 排序与分页。
- 移除旧 `createAndStart`(无 configId) 与 `rerunBenchmark`(克隆) 测试。

新增 `ModelBenchmarkRunRepositoryTests`（`@DataJpaTest`）：
- `findFirstByConfigIdOrderByCreatedAtDesc`、`countByConfigId`、
  `existsByConfigIdAndStatusIn` 各一条用例。

新增 `ModelBenchmarkV81MigrationTests`（`@SpringBootTest`，内存库）：
- 在 V81 之前手工塞 3 条 run（其中两条同名只差 `-重跑` 后缀且其他字段相同，第三条字段
  不同）；运行 Flyway 至 V81；断言：
  - `ai_model_benchmark_config` 行数 = 2；
  - 同名两条 run 共享同一 `config_id`；
  - 所有 run 的 `config_id` 非空；
  - run 的快照字段保持原值。

### 8.2 前端
- 本期靠 `npm run build` 做类型与编译验证。
- 抽屉 Tab 切换、轮询启停、运行/取消按钮态人工冒烟。

### 8.3 编码 / 启动
- `python scripts/check_encoding.py` 兜底。
- 跨前后端 + Flyway 改动，建议执行一次 `scripts/start.ps1` 在已有数据上验证 V81。

### 8.4 文档
- 新增 `docs/model-benchmark-technical-design-v2.md`，记录新数据模型、迁移策略、API 变更、
  UI 信息架构。
- `docs/architecture.md` 模型管理小节追加一句指向 v2 文档。

## 9. 风险与回滚

- **迁移哈希分组误判**：若某用户历史上"基准 name 相同 + 其它字段都相同"但实际是用户
  心智上的不同方案，迁移会把它们合并。这种合并是无损的（run 自身字段保留），用户可在
  新 UI 上手动复制为多个 config，本期不做撤销机制。
- **active run 强约束**：极端情况下若用户期望并发触发同一 config，新行为会拒绝。这是
  有意设计，避免指标对比失去基线。
- **回滚**：V81 迁移在生产部署前可通过新增 V82__revert_model_benchmark_config_split.sql
  反向迁移（删 `ai_model_benchmark_config` + 移除 `run.config_id`）；前端旧版本可独立
  回滚。回滚后历史 run 数据保持完整。

## 10. 验收

- 列表 = 配置；每行有"最近运行摘要"。
- 同一份 config 可"编辑 → 立即运行 → 取消 → 再次运行"，列表与抽屉指标实时刷新。
- 编辑 config 不污染历史 run 的快照字段。
- V81 迁移在含历史数据的库上运行成功，两条同名 `-重跑` run 合并到同一 config。
- 后端、前端 harness 全部通过，文档同步更新。
