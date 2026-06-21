# 模型对比测试 v2：配置与运行记录分离

- 版本：v2
- 日期：2026-06-16
- 关联 spec：`docs/superpowers/specs/2026-06-16-model-benchmark-config-run-split-design.md`
- 关联 V1：V80 引入对比测试时的一体化设计（无独立设计文档，仅代码注释）

## 1. 背景与动机

V80 引入"模型对比测试"时把"配置参数"与"一次运行的状态/进度/指标"压缩进同一张
`ai_model_benchmark_run` 表，列表行 = 运行行，无法对一份配置反复"修改 → 触发"。
本次（V82）把"配置"与"运行记录"拆为两层：

- **列表（管理面）**：配置维度，可重复编辑、可重复触发。
- **抽屉（观察面）**：配置摘要 + 运行记录列表 Tab + 指标对比 Tab。

## 2. 数据模型

### 2.1 新增表 `ai_model_benchmark_config`（V82）

承载可重复编辑的配置：`id / name / concurrency / total_requests / stream_enabled /
max_tokens / system_prompt / user_prompt / model_ids / created_by / created_at /
updated_at`。索引：`created_at`、`created_by`。

### 2.2 改造 `ai_model_benchmark_run`（V82）

- 新增列 `config_id BIGINT NOT NULL` + 外键到 `ai_model_benchmark_config(id)`，
  `ON DELETE` 不级联（service 层显式级联，事务边界可见）。
- 现有 `name / concurrency / total_requests / stream_enabled / max_tokens /
  system_prompt / user_prompt / model_ids` 字段全部保留，语义重新定义为
  **触发瞬间从 config 拷贝的"运行时快照"**，编辑 config 不会污染历史 run 的指标。
- 新增索引 `idx_ai_model_benchmark_run_config_created_at(config_id, created_at desc)`，
  支撑"配置列表行最近一次运行摘要"和"详情抽屉时间倒序运行记录"。

### 2.3 `ai_model_benchmark_metric`

不动，仍按 `run_id` 关联。

### 2.4 历史数据智能合并迁移（V82 同脚本内）

按"基准 name + 配置字段"分组合并去重为 config：

1. 计算每条 run 的"基准 name" = 把末尾任意层 `-重跑` 裁掉
   （`regexp_replace(name, '(-重跑)+$', '')`）。
2. 分组键 = `(基准 name, concurrency, total_requests, stream_enabled,
    max_tokens, MD5(system_prompt), MD5(user_prompt), model_ids)`。
   `system_prompt` / `user_prompt` 是 TEXT，使用 MD5 投影成定长字符串后参与
   `GROUP BY`（PostgreSQL 长 TEXT 直接分组在某些场景下会受字符集与索引限制影响）。
3. 每个分组取最早创建 run 的 `created_by / created_at` 作为 config 元信息，
   写入 `ai_model_benchmark_config`。
4. 通过同样的分组键做 `UPDATE ... FROM` 把 run 的 `config_id` 回填。
5. `ALTER COLUMN config_id SET NOT NULL` + 外键约束。

回滚策略：可写一条新迁移反向操作（删 config 表 + drop run.config_id），run 自身字段
完整保留。

## 3. 后端

### 3.1 服务拆分

| 类                            | 职责                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `ModelBenchmarkConfigService` | 配置 CRUD + 触发运行入口；强约束"同一 config 同一时刻只允许一条 active run"。           |
| `ModelBenchmarkRunService`    | 运行记录的查询 / 取消 / 删除 / 进度；只暴露子资源视图，不再有"全局 run 列表"。          |
| `ModelBenchmarkService`       | 内部执行编排：写 run + metric 行、`afterCommit` 异步提交、内存进度计数 + 取消 flag。     |

`ModelBenchmarkConfigService.update / delete / triggerRun` 命中 active run 时抛
`ActiveRunConflictException`，由 controller 映射为 HTTP 409，code 与 message
保持中文：`"配置存在进行中的运行，请先取消后再编辑"` 等。

### 3.2 REST API

| 方法    | 路径                                                | 权限              | 说明                                                                                       |
| ------- | --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| GET     | `/api/model-benchmark-configs`                      | `model:view`      | 配置分页；每行带 `latestRun + runCount`。支持 keyword + 分页。                              |
| GET     | `/api/model-benchmark-configs/{id}`                 | `model:view`      | 配置详情，含 `hasActiveRun` / `activeRunId`。                                               |
| POST    | `/api/model-benchmark-configs`                      | `model:benchmark` | 仅创建配置。                                                                                |
| PUT     | `/api/model-benchmark-configs/{id}`                 | `model:benchmark` | 编辑配置；存在 active run 时 409。                                                          |
| DELETE  | `/api/model-benchmark-configs/{id}`                 | `model:benchmark` | 删除配置 + 全部 run + metric；存在 active run 时 409。                                       |
| POST    | `/api/model-benchmark-configs/{id}/runs`            | `model:benchmark` | 触发一次运行；存在 active run 时 409。请求体可空或 `{"nameSuffix":"..."}`。返回新的配置详情。|
| GET     | `/api/model-benchmark-configs/{id}/runs`            | `model:view`      | 该 config 的 run 历史分页。                                                                |
| GET     | `/api/model-benchmarks/{id}`                        | `model:view`      | 单条 run 详情；response 增加 `configId`。                                                   |
| GET     | `/api/model-benchmarks/{id}/progress`               | `model:view`      | 单条 run 轻量进度。                                                                        |
| POST    | `/api/model-benchmarks/{id}/cancel`                 | `model:benchmark` | 取消单条 run。                                                                             |
| DELETE  | `/api/model-benchmarks/{id}`                        | `model:benchmark` | 删除单条 run + 其 metric。                                                                 |

**已删除的旧端点**：`POST /api/model-benchmarks`（创建并立即启动）、
`GET /api/model-benchmarks`（全局 run 列表）、`POST /api/model-benchmarks/{id}/rerun`
（克隆重跑）。新前端是仓库内唯一调用方，不再保留兼容入口。

### 3.3 强约束

- 同一份 config 同一时刻只允许一条 active run（PENDING/RUNNING）。
- run 的快照 `name = config.name`，不再自动追加 `-重跑`；用户如需标记，可通过
  `triggerRun` 的 `nameSuffix` 主动添加。

## 4. 前端

### 4.1 路由 / 菜单

- 路由 name 与 path 由 `model-benchmarks` → `model-benchmark-configs`，
  权限沿用 `model:view`，激活菜单仍 `/models`。
- `AppLayout.vue` 菜单 `matchNames` 同步更新。

### 4.2 视图

- `frontend/src/views/ModelBenchmarkConfigView.vue` 替换旧的
  `ModelBenchmarkView.vue`，承担列表 + 创建/编辑 Dialog + 详情抽屉三层 UI。
- 列表行：`name / 最近状态 / 最近进度（仅 RUNNING）/ 并发 / 总请求 / 模型数 /
  运行次数 / 创建人 / 更新时间 / 操作`。操作 = 运行(取消) / 编辑 / 详情 / 删除。
- 当列表中存在 active run 时按 1.5s 节奏轮询当前页；否则停止。
- 抽屉：顶部"配置摘要 + 立即运行/取消运行/编辑配置"按钮，下方
  Tab 1 "运行记录"（表格 + 删除/查看指标），Tab 2 "指标对比"
  （复用原指标表 + 最优值高亮 + 移动端卡片）。

### 4.3 API 模块

- `frontend/src/api/modelBenchmarkConfig.ts`：
  `pageBenchmarkConfigs / getBenchmarkConfigDetail / createBenchmarkConfig /
  updateBenchmarkConfig / deleteBenchmarkConfig / triggerBenchmarkConfigRun /
  pageBenchmarkConfigRuns`。
- `frontend/src/api/modelBenchmark.ts`：仅保留
  `getBenchmarkDetail / getBenchmarkProgress / cancelBenchmark / deleteBenchmark`。
- `frontend/src/types/platform.ts`：新增 `ModelBenchmarkConfigSummary /
  ModelBenchmarkConfigDetail`，`ModelBenchmarkRunSummary / ModelBenchmarkRunDetail`
  增加 `configId`。

## 5. 验证 harness

- `mvn -s maven-settings-central.xml -Dtest=ModelBenchmarkMetricsTest test`：
  6/6 通过（指标聚合纯函数测试）。
- `mvn -s maven-settings-central.xml -Dtest=AiAgentPlatformApplicationTests test`：
  通过（上下文加载 + JPA `ddl-auto: create-drop` 模式下的整体 schema 校验，
  证明本次新增/调整的 entity 与 V82 SQL 不冲突）。
- `cd frontend && npm run build`：通过（vue-tsc 类型检查 + vite 产物生成）。
- 测试环境配置 `flyway: enabled: false` + `ddl-auto: create-drop`（见
  `backend/src/test/resources/application.yml`），意味着 V82 SQL 不在测试时执行；
  生产/开发环境（PostgreSQL + Flyway）需要在首次部署时运行 V82 完成历史数据合并。
- 全量 `mvn test` 中存在与 benchmark 模块**无关**的失败用例（`PlatformStoreService`、
  `Hermes*` 等），是仓库 working tree 里其他改动导致的环境问题，不在本次范围。

## 6. 风险与回滚

- **迁移合并误判**：用户历史上"基准 name 相同 + 其他字段都相同"但实际是不同心智
  方案的运行，会被合并到同一 config。这种合并是无损的（run 自身字段保留），
  用户可在新 UI 上手动复制为多个 config，本期不做撤销机制。
- **active run 强约束**：拒绝"同一 config 并发触发"是有意设计，防止指标对比
  失去基线。
- **回滚**：V82 在生产部署前可通过新增反向迁移撤销（删 config 表 + drop
  `run.config_id`）；前端旧版本可独立回滚，依赖 controller 端点选择。

## 7. 验收

- 列表 = 配置；每行有"最近运行摘要"。
- 同一份 config 可"编辑 → 立即运行 → 取消 → 再次运行"，列表与抽屉指标实时刷新。
- 编辑 config 不污染历史 run 的快照字段。
- V82 在含历史数据的库上运行成功，两条同名 `-重跑` run 合并到同一 config。
- 后端、前端 harness 全部通过。
