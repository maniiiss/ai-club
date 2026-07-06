# 可观测性中心（日志管理 + 系统健康度监控）技术设计

## 1. 背景

平台目前已经具备**部分**可观测能力，但分散在各处、彼此割裂：

- 服务器资源监控：`ServerMonitorScheduler` 定时 SSH 探测，落 `server_metric_sample`，由 `ServerAlertService` 驱动告警。
- 用户操作审计：`operationlog` 包通过拦截器自动记录请求/响应，落 `user_operation_log`。
- 依赖组件健康：`WoodpeckerHealthSummary` 等零散摘要。
- 执行过程留痕：`ExecutionStepEventEntity` / `TaskAgentRunEntity` / 各类 `*SyncLogEntity`。

这些能力都是**面向平台自身**的。但平台的核心价值对象是「**入驻项目**」——项目通过流水线构建、`部署到服务器` 后运行。当前对「入驻项目运行起来之后到底健不健康、日志去哪看」缺少统一收口：

- 项目部署到远端服务器后产生的**应用运行日志**没有归集，排障要人工 SSH 上机器 `tail`。
- 没有**按项目维度**的健康度（存活、接口延迟、错误率、依赖可用性），只有宿主服务器的 CPU/内存。
- 流水线构建成功率、Agent 任务失败率等**执行健康趋势**散落在执行表里，没有聚合视图。
- 平台自身的可观测信号（操作审计、服务器指标、告警）没有统一大盘。

本设计把以上四块收敛为一个**可观测性中心**，采用「自建存储 + 标准埋点」路线：复用现有 PostgreSQL 与 Spring 调度做存储和采集，日志统一结构化为 JSON，指标统一走 Micrometer/Actuator，为未来对接 Grafana 保留标准出口，但本期不引入 Loki/Prometheus/ELK 等重基础设施。

## 2. 目标与非目标

### 2.1 目标

- **统一日志管理**：入驻项目运行日志、平台审计/业务日志，统一结构化模型、统一检索入口、按项目/服务隔离与权限控制。
- **入驻项目健康度**：以项目为中心，采集存活、接口延迟、错误率、依赖可用性，产出 0–100 健康分与状态（健康/亚健康/异常）。
- **执行健康聚合**：基于现有流水线/执行/Agent 数据，产出构建成功率、任务失败率、平均耗时等趋势指标。
- **平台自身可观测性大盘**：复用并整合 `server_metric_sample`、`user_operation_log`、`ServerAlert`，形成统一总览。
- **标准埋点出口**：后端暴露 `/actuator/prometheus`，结构化日志输出 JSON，未来可平滑对接外部监控栈。
- 全部新增能力遵循平台现有规范：Flyway 增量迁移、权限链路、移动端布局复用、harness 验证。

### 2.2 非目标

- 不引入 Loki / ELK / Prometheus Server / Grafana 等独立基础设施（仅保留对接口子）。
- 不做全链路分布式追踪（trace 透传仅保留 `traceId` 字段占位，不实现跨服务 span 收集）。
- 不替换或重写现有 `ServerMonitorScheduler` / `operationlog` / 告警，本期为**整合与扩展**，不是推倒重做。
- 不在入驻项目业务代码里强制植入 SDK（本期日志采集以无侵入的远端拉取为主，主动上报作为可选增强）。
- 不做日志的长期冷归档与对象存储下沉（先做热数据保留 + 定期清理，冷归档列入后续）。

## 3. 影响范围

- **影响模块**：`backend`（主要）、`frontend`（新增页面）、`docs`（本文档）；`code-processing` 暂不涉及。
- **影响链路**：
  - 新增定时采集链路（项目健康探测、执行健康聚合）。
  - 新增日志归集链路（远端 SSH 拉取 + 可选上报端点）。
  - 扩展 Dashboard 链路（统一大盘聚合查询）。
  - 权限链路：新增可观测性相关权限点。
- **影响运行配置**：
  - 新增环境变量（采集开关、间隔、保留期、单项目日志配额、上报鉴权密钥）。
  - 新增 Actuator 暴露端点 `prometheus`。
  - 新增依赖：`micrometer-registry-prometheus`、`logstash-logback-encoder`。
  - 新增 Flyway 迁移脚本（V76 起）。

## 4. 现状与问题分析

| 维度 | 现有实现 | 缺口 |
|------|---------|------|
| 服务器资源 | `ServerMonitorScheduler` + `server_metric_sample` + `ServerAlertService` | 仅宿主机粒度，无项目粒度 |
| 用户操作 | `operationlog` 包 + `user_operation_log` | 是审计日志，不是项目运行日志 |
| 依赖健康 | `*HealthSummary` DTO | 散点，无统一健康模型与历史 |
| 执行过程 | `ExecutionStepEventEntity` / `TaskAgentRunEntity` / `AiClubPipelineRunSnapshotEntity` | 有明细无聚合趋势 |
| 项目运行日志 | 无 | **完全缺失**，需人工上机器查 |
| 项目健康度 | 无 | **完全缺失** |
| 标准埋点 | 仅 `spring-boot-starter-actuator` | 未启用 prometheus 出口、日志非结构化 |

核心约束：入驻项目**运行在远端被管服务器上**（`ServerInfoEntity` + `ServerSshGateway` 已存在），平台与项目进程不在同一台机器，因此日志/项目健康采集必须跨主机。这决定了采集架构以「远端拉取 + 可选主动上报」为主，而非进程内埋点。

## 5. 设计方案

### 5.1 总体方案

新增一个逻辑上的**可观测性中心（Observability Center）**，由四个支柱 + 一个统一查询层组成，全部挂在 `backend` 既有分层（controller / service / repository / domain）之下，不新增独立服务：

```
                         ┌─────────────────────────────┐
                         │     可观测性统一大盘 (前端)        │
                         │  ObservabilityController        │
                         └───────────────┬─────────────┘
            ┌──────────────┬─────────────┼──────────────┬───────────────┐
            ▼              ▼             ▼              ▼               ▼
    ① 项目运行日志     ② 项目健康度     ③ 执行健康聚合    ④ 平台自身可观测     标准埋点出口
  ProjectLogService  ProjectHealth   ExecutionHealth   (复用)            Micrometer
                     Scheduler       Aggregator        ServerMonitor      /actuator/prometheus
        │                │               │             operationlog        结构化 JSON 日志
        ▼                ▼               ▼             ServerAlert
  project_runtime_log  project_health  pipeline/task  (现有表)
                       _snapshot       _health_daily
```

设计原则：
- **复用优先**：项目健康采集复用 `ServerSshGateway` 与调度模式；执行健康聚合复用现有执行/流水线表；平台自身大盘直接读现有表。
- **按项目隔离**：所有新表带 `project_id`，查询与权限按项目维度收口。
- **写读分离**：采集/聚合写入明细与快照表，前端查询走聚合/分页接口，避免大表全扫。
- **运行实例优先**：日志采集和健康探测不再从项目、流水线参数或部署脚本中临时推断目标，而是统一读取 `project_runtime_instance`。

### 5.1.1 项目运行实例

新增 `project_runtime_instance` 作为可观测采集的前置契约，描述“某个项目在某个环境/服务形态下运行在哪里，以及如何观测它”。第一版以 Jenkins 兼容链路为主，支持两类实例：

- **受管服务器实例**：绑定 `server_info`，可启用 SSH 日志采集，并配置一组日志路径；健康检查可配置 HTTP/TCP 目标。
- **外部地址实例**：只配置外部访问地址与健康检查目标，不启用 SSH 日志采集，适合暂未纳入服务器管理的部署。

实例来源分为 `MANUAL`、`JENKINS` 与预留的 `WOODPECKER`。Jenkins 绑定表单可维护 0–N 个运行实例；触发 Jenkins 成功进入队列时，只把关联实例标记为 `DEPLOYING`，不提前认定部署成功。后续日志采集器读取启用的受管服务器实例，健康探测读取全部启用且开启健康检查的实例。Woodpecker 当前不可用，本期仅保留来源枚举，不做自动生成。

### 5.2 关键流程

**① 入驻项目运行日志归集**
- 入口：定时任务 `ProjectLogCollectScheduler`（`@Scheduled`，间隔可配）。
- 流转：对每个「已部署且开启日志采集」的项目，通过 `ServerSshGateway` 读取其约定日志路径（部署脚本写入固定目录，如 `~/app/<project>/logs/*.log`）的增量内容（基于上次读取的字节偏移 / 行游标，存 `project_log_cursor`）。
- 解析：按行解析，优先识别 JSON 结构化行（提取 `timestamp/level/logger/traceId/message`），非结构化行整行入 `message` 并标 `raw`。
- 落库：写 `project_runtime_log`，按项目 + 时间索引。
- 配额与清理：单项目按行数/天数配额，超限丢弃最旧并记一条系统告警；定时清理超保留期数据。
- 错误处理：SSH 失败不阻塞其他项目，记录采集失败状态供大盘展示「日志采集异常」。
- **可选增强**：开放 `POST /internal/observability/logs`（密钥鉴权，仿 `InternalHermesController` 模式），允许项目主动批量上报，命中则跳过该项目的拉取。

**② 入驻项目健康度**
- 入口：定时任务 `ProjectHealthScheduler`。
- 流转：对每个项目按其 `project_health_check_config`（探针类型：HTTP/TCP/进程；目标 URL/端口；超时；阈值）执行探测。HTTP 探针记录状态码与响应耗时；依赖探针检查 DB/外部 API 可达性。
- 评分：按维度加权算 0–100 健康分（存活权重最高，其次错误率、延迟、依赖），映射为 健康(≥80)/亚健康(60–79)/异常(<60)。
- 落库：明细落 `project_health_snapshot`（时序），最新状态回写项目摘要供列表页快速展示（复用 `server_info` 的 last-summary 模式）。
- 告警：复用 `ServerAlertService` 的阈值/状态机思路，健康分跌破阈值或连续 N 次异常触发告警（接 `NotificationController` 现有通知通道）。

**③ 流水线 / Agent 执行健康聚合**
- 入口：定时任务 `ExecutionHealthAggregator`（低频，如每 10 分钟 / 每日）。
- 流转：聚合 `AiClubPipelineRunSnapshotEntity`、`ExecutionRunEntity`、`TaskAgentRunEntity` 在窗口内的成功/失败/耗时，按 项目 + 日期 落 `pipeline_health_daily` / `agent_run_health_daily`。
- 产出：构建成功率、任务失败率、平均/分位耗时、失败 Top 原因，供趋势图与大盘。
- 错误处理：聚合幂等（按 项目+日期 upsert），重跑不重复累加。

**④ 平台自身可观测性**
- 不新增采集，统一查询层聚合现有 `server_metric_sample`（资源）、`user_operation_log`（操作审计）、`ServerAlertStateEntity`（告警态），加上 Actuator 健康，组成「平台总览」卡片区。

**标准埋点出口**
- 引入 `micrometer-registry-prometheus`，`application.yml` 暴露 `management.endpoints.web.exposure.include` 增加 `prometheus`、`health`、`metrics`，端点经现有 `AuthInterceptor` 或独立内网网段保护。
- 引入 `logstash-logback-encoder`，平台后端日志输出结构化 JSON（保留控制台可读 profile，生产 profile 走 JSON），统一字段便于未来外部采集。

### 5.3 数据、接口与配置变更

**新增实体 / 表（Flyway 从 V76 起）**

| 表 | 用途 | 关键字段 |
|----|------|---------|
| `project_runtime_log` | 项目运行日志明细 | `project_id, server_id, log_level, logger, trace_id, message, raw, logged_at, collected_at` |
| `project_runtime_instance` | 项目运行实例与采集目标 | `project_id, source_type, source_binding_id, server_mode, server_id, external_base_url, log_paths_json, health_probe_type, health_target` |
| `project_log_cursor` | 日志采集游标 | `project_id, server_id, source_path, byte_offset, last_line_hash, updated_at` |
| `project_log_collect_config` | 项目日志采集配置 | `project_id, enabled, source_paths, retention_days, max_lines_per_day, push_enabled` |
| `project_health_check_config` | 项目健康检查配置 | `project_id, probe_type, target, timeout_ms, interval_seconds, warn_threshold, critical_threshold, enabled` |
| `project_health_snapshot` | 项目健康时序快照 | `project_id, probe_status, http_status, latency_ms, error_rate, dependency_status, health_score, level, sampled_at` |
| `pipeline_health_daily` | 流水线执行健康日聚合 | `project_id, stat_date, total, success, failed, avg_duration_ms, p95_duration_ms` |
| `agent_run_health_daily` | Agent 执行健康日聚合 | `project_id, stat_date, total, success, failed, avg_duration_ms, top_failure_reason` |

> 大表（`project_runtime_log`、`project_health_snapshot`）建索引 `(project_id, *_at)`；若量级偏大，后续按月分区，本期先做定期清理。

**新增接口（统一前缀 `/api/observability`，权限受控）**

- `GET /projects/{id}/logs`：分页 + 过滤（级别 / 时间窗 / 关键字 / traceId）。
- `GET /projects/{id}/logs/config` · `PUT /projects/{id}/logs/config`：日志采集配置。
- `GET /projects/{id}/health`：当前健康分 + 维度明细。
- `GET /projects/{id}/health/timeline`：健康趋势。
- `GET /projects/{id}/health/config` · `PUT /projects/{id}/health/config`：健康检查配置。
- `GET /projects/{id}/execution-health`：流水线/Agent 执行健康趋势。
- `GET /overview`：平台统一大盘聚合（资源 + 告警 + 操作审计 + 项目健康总览）。
- `POST /internal/observability/logs`：可选项目主动上报（密钥鉴权，仿 `Internal*Controller`）。

**新增服务 / 调度**

- `ProjectLogCollectScheduler` / `ProjectLogService`
- `ProjectHealthScheduler` / `ProjectHealthService`（评分逻辑 `ProjectHealthScorer`）
- `ExecutionHealthAggregator` / `ExecutionHealthService`
- `ObservabilityOverviewService`（统一查询层）

**新增环境变量**（同步 `.env.example` / `.env.server.example`）

```
PLATFORM_OBSERVABILITY_ENABLED=true
PLATFORM_PROJECT_LOG_COLLECT_INTERVAL_MS=30000
PLATFORM_PROJECT_LOG_RETENTION_DAYS=14
PLATFORM_PROJECT_LOG_MAX_LINES_PER_DAY=200000
PLATFORM_PROJECT_HEALTH_INTERVAL_MS=30000
PLATFORM_EXECUTION_HEALTH_AGGREGATE_CRON=0 */10 * * * *
PLATFORM_OBSERVABILITY_INGEST_TOKEN=<随机强密钥>
```

**配置变更**
- `management.endpoints.web.exposure.include` 增加 `prometheus,health,metrics`。
- 新增 logback 生产 profile 输出 JSON。

**前端新增**
- 「可观测性中心」一级菜单：统一大盘 / 项目日志 / 项目健康 / 执行健康。
- 项目详情页内嵌「日志」「健康」Tab。
- 遵循 `mobile-console-technical-design-v1.md` 的移动端布局与分页规则。

## 6. 方案取舍

| 决策点 | 候选 | 选择 | 理由 |
|--------|------|------|------|
| 日志采集方式 | A. SSH 远端拉取 / B. 项目内 SDK 主动上报 / C. sidecar 收集 | **A 为主，B 为可选增强** | A 复用现有 `ServerSshGateway`，对入驻项目零侵入、落地最快；B 留口子给高频/大量日志场景；C 需改部署形态，过重 |
| 存储 | PostgreSQL / 专用日志栈 | **PostgreSQL** | 复用现有库与运维，符合「自建」选型；大表用索引+清理+（后续）分区控成本 |
| 指标 | 自采字段 / Micrometer | **Micrometer + Actuator** | Actuator 已在 pom，标准化、零额外基建即可出 `/actuator/prometheus` |
| 执行健康 | 实时查明细 / 预聚合日表 | **预聚合日表** | 明细表大，趋势查询走聚合避免全扫；幂等 upsert 可重算 |
| 告警 | 新建告警系统 / 复用 ServerAlert | **复用并扩展** | 避免重复造轮子，统一告警体验 |

代价：PostgreSQL 存日志在超大规模下有压力（已用清理+分区缓解）；SSH 拉取有秒级延迟（非实时，满足排障即可，实时场景走可选上报）。

## 7. 风险与兼容性

- **大表膨胀**：`project_runtime_log` 可能快速增长。缓解：单项目日配额 + 保留期清理 + 索引；预留分区方案。上线初期监控表大小。
- **SSH 采集压力**：项目多时探测/拉取并发上升。缓解：沿用 `ServerMonitorScheduler` 的「按间隔 + 逐项目」节流，必要时限流与超时熔断；采集失败隔离不互相影响。
- **与现有 ServerMonitor 的边界**：项目健康 ≠ 服务器健康，两者独立表、独立调度，仅在大盘聚合层汇合，互不改写。
- **权限**：新增可观测性权限点，未授权用户不可见项目日志（日志可能含敏感信息）；内部上报端点用独立密钥，不走用户态。
- **敏感信息**：运行日志可能含密钥/PII。本期做：仅授权可见 + 不在 URL 传参；后续可加脱敏规则。
- **灰度/回滚**：全部能力受 `PLATFORM_OBSERVABILITY_ENABLED` 与各子开关控制，关闭即停采集；Flyway 仅新增表，不改存量表，回滚低风险。
- **依赖新增**：`micrometer-registry-prometheus`、`logstash-logback-encoder` 为成熟库，风险低；JSON 日志通过 profile 切换，开发态保持可读。

## 8. Harness 与验证

- **最小验证**：`python scripts/check_encoding.py`（文档/配置编码）。
- **后端**：`cd backend && mvn -s maven-settings-central.xml test`；重点补
  - `ProjectHealthScorer` 评分单测（边界：全绿/部分失败/全红）。
  - 日志增量游标解析单测（JSON 行 / 非结构化行 / 偏移续读）。
  - 执行健康聚合幂等单测（重跑不翻倍）。
- **前端**：`cd frontend && npm run build`。
- **集成**：源码模式起 `backend + frontend`，用一台测试服务器验证 SSH 日志拉取与健康探测端到端。
- **重点观测**：采集任务自身日志、`project_runtime_log` 增长速率、调度耗时、`/actuator/prometheus` 可访问性。

## 9. 落地计划

> 本期交付物 = 本设计文档。以下为后续实现分阶段建议。

- **阶段 0（本期）**：完成本设计文档，评审对齐四支柱边界与数据模型。交付：`observability-technical-design-v1.md` + `../architecture.md` 引用。
- **阶段 1：标准埋点底座**（依赖：无）。引入 Micrometer/Prometheus 出口、结构化 JSON 日志、新增依赖与 Actuator 配置。交付：可访问 `/actuator/prometheus`，平台日志结构化。
- **阶段 2：入驻项目运行日志归集**（依赖：阶段 1 的日志模型约定）。Flyway V76+、采集调度、游标、配置、查询接口与前端日志页。这是最痛缺口，建议作为首个 MVP。
- **阶段 3：入驻项目健康度**（依赖：阶段 2 的服务器/项目关联与调度模式）。健康探测、评分、快照、告警接入、前端健康页。
- **阶段 4：执行健康聚合**（依赖：现有执行/流水线表，可与阶段 3 并行）。日聚合任务 + 趋势接口 + 前端。
- **阶段 5：统一大盘**（依赖：阶段 2–4）。`overview` 聚合接口 + 大盘页 + 权限收口。

## 10. 待确认问题

1. **采集架构确认**：入驻项目日志是否接受「SSH 远端拉取为主」？是否所有入驻项目都通过 `部署到服务器` 跑在被管 `ServerInfoEntity` 上？存在不部署到平台被管服务器的项目吗（若有，需依赖主动上报）。
2. **日志路径约定**：部署脚本能否统一约定项目日志输出目录与文件名规范，供采集器定位？
3. **保留期与配额**：默认保留 14 天 / 单项目每日 20 万行是否合适？是否需要冷归档到 MinIO（现有依赖）？
4. **健康探针来源**：项目健康探针目标（URL/端口）由谁配置——平台管理员、项目负责人，还是从部署配置自动推导？
5. **权限粒度**：项目日志/健康的可见范围是项目成员可见，还是仅管理员？是否需要字段级脱敏。
6. **MVP 优先级**：是否同意按「阶段 2 入驻项目日志归集」作为第一个落地 MVP。


