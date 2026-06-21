# 模型对比测试（Benchmark）技术设计 v1

> 日期：2026-06-16
> 关联代码：`backend/.../service/benchmark/`、`backend/.../controller/ModelBenchmarkController.java`、`frontend/src/views/ModelBenchmarkView.vue`
> 关联迁移：`V80__model_benchmark.sql`

## 1. 背景与目标

平台原本的"模型管理"只能对单个模型做一次连通性测试，缺少跨模型的速度和吞吐对比能力。本设计在不影响现有模型 CRUD 与下游业务调用链路的前提下，增加一条独立的"对比测试（Benchmark）"流水线：

- 用户选择 1~8 个 CHAT 模型，配置并发数、总请求数、Prompt、是否流式；
- 后端异步并发压测，每个模型逐一执行；
- 输出失败率、平均输出 tokens、首 token 耗时（TTFT）、平均耗时、P50、P95、总 Token/s、生成 Token/s、吞吐（QPS）等指标；
- 任务和指标持久化，支持历史回看和对比。

## 2. 总体架构

```
ModelBenchmarkController        ModelBenchmarkService         BenchmarkInvoker
(REST)              ────────►   (异步编排 / 状态机 / 进度缓存) ──►  (单次调用：流式/非流式 SSE)
                                          │                         │
                                          ▼                         ▼
                                ai_model_benchmark_run        ai_model_config (复用)
                                ai_model_benchmark_metric          (ResolvedModelConfig)
```

- **异步编排在两级线程池中跑**：
  - `benchmarkRunExecutor`（core 2 / max 4）：每次 run 一个线程，串行调度各模型；
  - `benchmarkWorkerExecutor`（core 8 / max 64，SynchronousQueue）：实际发起 HTTP 请求的工作线程，承担用户配置的并发上限。
- **进度走双轨**：内存 `AtomicInteger` 缓存提供高频读取，DB 节流写入（每 5 次或模型完结后落库）。

## 3. 数据模型

### `ai_model_benchmark_run`
| 列 | 说明 |
|---|---|
| `id` | 主键 |
| `name` | 用户可填，缺省 `对比测试-{时间}` |
| `status` | `PENDING` / `RUNNING` / `SUCCESS` / `FAILED` / `CANCELED` |
| `concurrency` | 并发数（1~64） |
| `total_requests` | 每个模型的请求总数（1~500） |
| `stream_enabled` | 是否使用流式调用（影响 TTFT 准确度） |
| `max_tokens` | 单次请求 max_tokens |
| `system_prompt` / `user_prompt` | Prompt 文本 |
| `model_ids` | JSON 数组，记录原始顺序 |
| `progress_total` / `progress_done` | 总步数与已完成步数 |
| `error_message` / `created_by` / `created_at` / `updated_at` / `finished_at` | 元信息 |

### `ai_model_benchmark_metric`
- 一行 = 一个模型在该 run 中的聚合结果；
- 包含 modelName / provider / modelRealName 的 snapshot，原模型即使被改名/删除也能回看；
- `failure_rate`、`avg_output_tokens`、`avg_ttft_ms`、`avg_latency_ms`、`p50_latency_ms`、`p95_latency_ms`、`total_token_per_sec`、`gen_token_per_sec`、`throughput`、`wall_time_ms` 全部独立列；
- `token_estimated` 标记 token 数是否为按 4 字符 ≈ 1 token 估算（接口未返回 usage 时启用）。

## 4. 接口契约

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/model-benchmarks` | `model:benchmark` | 创建 run 并立即异步启动，返回初始 detail |
| GET | `/api/model-benchmarks` | `model:view` | 分页（keyword、status） |
| GET | `/api/model-benchmarks/{id}` | `model:view` | 详情，含全部指标行 |
| GET | `/api/model-benchmarks/{id}/progress` | `model:view` | 轻量进度查询（专供轮询） |
| POST | `/api/model-benchmarks/{id}/cancel` | `model:benchmark` | 设置取消标记，Runner 在每个请求边界感知 |
| DELETE | `/api/model-benchmarks/{id}` | `model:benchmark` | 删除历史（不允许删除运行中的 run） |

返回体统一是 `ApiResponse<T>`，与 `ModelConfigController` 保持一致。

## 5. 关键流程

### 5.1 创建并启动

```
POST /api/model-benchmarks
  └─ 校验 modelIds（存在 / 启用 / 类型 == CHAT / 不重复 / ≤ 8）
  └─ 校验 concurrency ≤ 64、totalRequests ≤ 500
  └─ 写入 ai_model_benchmark_run(PENDING) + 每个模型一行 PENDING metric
  └─ progressCache.put(runId, AtomicInteger(0))
  └─ CompletableFuture.runAsync(executeRun, benchmarkRunExecutor)
  └─ 立即返回初始 detail
```

### 5.2 单次 run 执行（`ModelBenchmarkService#executeRun`）

逐模型串行执行（避免不同模型互相干扰指标）：

```
for modelId in run.modelIds:
    if cancelFlag: break
    metric.status = RUNNING
    config = modelConfigService.resolveModelConfig(modelId)   // 已解密 apiKey
    results = runForModel(...)                                // 内部并发
    ModelBenchmarkMetrics.aggregate(metric, results, wallMs)
    metric.status = SUCCESS / SKIPPED
final: run.status = SUCCESS / FAILED / CANCELED
```

`runForModel` 使用 `Semaphore(concurrency)` 限制单模型并发，每个请求作为一个 `CompletableFuture.supplyAsync(..., benchmarkWorkerExecutor)`；完成后 `doneCounter.incrementAndGet()`，每 5 次刷新一次 `ai_model_benchmark_run.progress_done`。

### 5.3 单次调用（`BenchmarkInvoker`）

- **OpenAI（含兼容服务）**：始终走 `/chat/completions`，开启时附加 `stream: true` 与 `stream_options.include_usage: true`，从最末 chunk 拿 `usage`；
- **Anthropic**：走 `/messages`，流式时解析 `content_block_delta` 拿增量内容、从 `message_start` / `message_delta` 拿 `usage`；
- **TTFT**：流式下，第一个非空 delta 到达的时刻减去请求开始时刻；非流式下退化为总耗时；
- **错误兜底**：任何异常都包成 `BenchmarkInvocationResult.failure(...)`，确保单次失败不会拖垮线程。

### 5.4 指标聚合（`ModelBenchmarkMetrics.aggregate`）

- 失败率：`failure / total`，保留 4 位小数；
- 平均 TTFT / Latency / OutputTokens：仅对成功请求平均；
- P50 / P95：成功请求的 latency 升序排列后用 nearest-rank（`ceil(p * n)`）取值，小样本下行为可预期；
- 总 Token/s = `(input + output) / wallSeconds`；生成 Token/s = `output / wallSeconds`；吞吐 = `successCount / wallSeconds`；
- 任意一次成功调用没有从 usage 拿到 token，则整个 metric 标记 `token_estimated=true`，前端会显示一个"~"提示用户该值为估算。

### 5.5 取消与删除

- `cancel`：仅设置内存中的 `AtomicBoolean` 标志，Runner 在每个请求和模型边界检查，已发出的请求会保留并计入指标，最终 run 状态为 `CANCELED`；
- `delete`：禁止删除 `RUNNING` 的 run；其余状态级联删除 metric 行（`fk_ai_model_benchmark_metric_run` ON DELETE CASCADE）。

## 6. 前端

- 路由：`/model-benchmarks`（懒加载），权限 `model:view`，`activeMenu: '/models'`；
- 菜单：`AppLayout.vue` 的 `trailingMenuSeeds` 中紧跟"模型管理"追加"模型对比测试"条目；
- 列表页：桌面表格 + 移动端卡片；进度条显示 `progressDone / progressTotal`；
- 创建对话框：模型多选、并发/总请求/流式/max_tokens、System/User Prompt（提供"使用默认模板"按钮）；
- 详情抽屉：状态/进度/配置摘要 + 指标对比（桌面 11 列表格，移动端每模型一张卡片）；
- 轮询：详情打开时每 1.5s 调一次 detail，状态变成终态后停止并刷新列表。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 流式 usage 字段在不同兼容服务可能缺失 | OpenAI 显式启用 `stream_options.include_usage`；Anthropic 从 `message_delta.usage` 兜底；都不返回时按文本长度估算并打 `token_estimated` 标记 |
| 用户填超高并发把后端打挂 | concurrency ≤ 64、totalRequests ≤ 500；专用 SynchronousQueue 工作池；后端 + 前端双校验 |
| 长任务超过 HTTP 请求超时 | 创建接口立即返回 runId，执行完全放到线程池；前端通过 progress 接口轮询 |
| 进度热写数据库 | 内存 `AtomicInteger` 提供高频读，每 5 次或模型完结后落库 |
| API key 泄漏到日志 | 沿用 `ModelConfigService` + `TokenCipherService` 的现有机制；Runner / Invoker 仅记录 `runId` / `modelId` 不打印 header / body |

## 8. 开发与验证

- 编码检查：`python scripts/check_encoding.py`
- 后端单测：`mvn -s maven-settings-central.xml -Dtest=ModelBenchmarkMetricsTest test`（指标聚合纯函数测试，不依赖外部 LLM）
- 前端构建：`cd frontend && npm run build`
- 集成验收：在源码模式下选 2 个真实 CHAT 模型跑 `concurrency=4 / total=20`，确认进度刷新、流式 TTFT 合理、指标行落库且详情页可回看。
