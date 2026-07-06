# 项目工作状态存档 · 2026-07-04

> 由 Crow5 整理，基于当前会话上下文与代码仓库实际状态。

---

## 一、当前做到哪一步

### 最近一次提交

```
4f1989c Refine agent workflow and documentation
```

工作区在本次会话前是**干净状态**，无未提交改动。最近一批开发聚焦在：

1. **数据工作台（Data Workbench）** — 管理端 `DataWorkbenchView.vue` 大幅扩展（+1506 行），后端新增 `DataWorkbenchEntityParser`、`NamingCaseUtils` 等解析服务，Flyway 迁移 `V108`/`V109` 落地。
2. **Hermes 智能体增强** — `ChatHermesService` 扩展 258 行，`HermesToolOrchestrator` 增强，新增 `work-item-create` 技能 prompt。
3. **公众端 Hermes 接入** — `frontend-public` 新增 `ChatPage`、`chatUtils`、`chat.ts` 类型与测试。
4. **数据修改功能** — `DataChangeService`、`DataChangeSqlExecutor`、`DataChangeDslService` 增强。

### 本次会话已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| 数据库备份 | ✅ 已完成 | `database/backups/ai_agent_platform_backup_20260704_112750.sql`（27MB） |
| `.gitignore` 更新 | ✅ 已完成 | 排除 `database/backups/*.sql` 和 `nul` |
| `database/README.md` | ✅ 已完成 | 记录备份/恢复命令与连接信息 |
| 前后端代码提交到本地 git | ⏳ 进行中 | 改动为 `.gitignore` + `database/` 新目录 |

---

## 二、已经完成什么

### 项目整体能力盘点

| 模块 | 技术栈 | 状态 |
|------|--------|------|
| 管理端 `frontend/` | Vue 3 + Element Plus | ✅ 44 个页面视图，含可拖拽看板 |
| 公众端 `frontend-public/` | React 18 + Vite + Tailwind | ✅ 20 个页面，含聊天室/Hermes |
| 后端 `backend/` | Spring Boot 3 + JPA + Flyway | ✅ V109 迁移，含数据工作台 |
| 代码处理 `code-processing/` | FastAPI + GitNexus | ✅ MCP 工具网关 |
| Hermes | API Server + MCP | ✅ 对话式智能协作 |
| Hindsight | 记忆与检索 | ✅ 向量记忆 |
| Woodpecker | 流水线底座 | ✅ 内置 provider |
| 基础设施 | PostgreSQL/Redis/MinIO/Qdrant/Neo4j | ✅ Docker Compose 编排 |

### 管理端工作台（DashboardView.vue）已有 10 个组件

| 组件 ID | 名称 | 后端 API |
|---------|------|----------|
| `stat-project-count` | 总项目数量 | `/api/dashboard/cards/stats` |
| `stat-agent-count` | 活跃智能体 | `/api/dashboard/cards/stats` |
| `stat-task-count` | 任务总览 | `/api/dashboard/cards/stats` |
| `gitlab-quick-merge` | GitLab 快速发起 MR | `/api/gitlab/*` |
| `quick-pipeline-build` | 快速构建 | `/api/cicd/*` |
| `active-project-list` | 活跃项目 | `/api/dashboard/cards/active-projects` |
| `online-agent-list` | 在线智能体 | `/api/dashboard/cards/online-agents` |
| `recent-task-list` | 最近任务 | `/api/dashboard/cards/recent-tasks` |
| `system-shortcut-entries` | 常用系统访问入口 | `/api/dashboard/cards/shortcut-overview` |
| `quick-task-checklist` | 快捷任务 | `/api/dashboard/quick-tasks` |

管理端额外能力：**可拖拽布局编辑、组件宽高自定义、显示/隐藏组件、恢复默认、按用户持久化布局**。

### 公众端工作台（DashboardPage.tsx）已有 4 个区块

| 区块 | 数据来源 |
|------|----------|
| 统计卡片（项目/任务/智能体/仓库） | `overview.stats` |
| 我的任务统计（总数/进行中/待处理） | `overview.stats` |
| 活跃项目列表（最多 6 个） | `overview.activeProjects` |
| 最近任务列表（最多 5 条） | `overview.recentTasks` |

公众端工作台调用 `/api/dashboard/overview` 单一聚合接口。

---

## 三、还有什么待验证

| 项目 | 风险 | 验证方式 |
|------|------|----------|
| 数据工作台后端解析器 | 新增 518 行 `DataWorkbenchEntityParser` | 已有 `DataWorkbenchEntityParserTest`（293 行），需运行 `mvn test` |
| Hermes 工具编排增强 | `HermesToolOrchestrator` 变更 80 行 | 已有 `HermesToolOrchestratorTests`（100 行） |
| 公众端聊天工具函数 | `chatUtils.ts` 变更 41 行 | 已有 `chatUtils.test.ts`（59 行） |
| 数据库备份完整性 | 27MB SQL 文件 | 建议在空库上做一次恢复演练 |
| 公众端工作台数据展示 | `onlineAgents` 后端已返回但前端未消费 | 需前端验证 |

---

## 四、公众端工作台差距分析

### 后端已支持但公众端未使用的功能

后端 `DashboardController` 的 9 个接口都只需要 `dashboard:view` 权限，公众端用户具备该权限。`DashboardOverview` 后端 DTO 已返回 `onlineAgents`、`shortcutOverview` 字段，但公众端 `DashboardOverview` TS 类型未声明、页面未渲染。

### 可引入公众端的功能清单（按优先级排序）

| 优先级 | 功能模块 | 后端 API 状态 | 公众端类型定义 | 公众端页面 | 工作量评估 |
|--------|----------|--------------|---------------|-----------|-----------|
| **P0** | 在线智能体列表 | ✅ `/api/dashboard/cards/online-agents` 已返回 `AgentSummary[]` | ❌ 缺 `onlineAgents` 字段 | ❌ 未渲染 | 小 — 补类型 + 渲染卡片 |
| **P0** | 我的任务卡片增强 | ✅ `overview` 已返回 `myTasks` | ❌ 缺 `myTasks` 字段 | ❌ 当前仅用 stats 统计 | 小 — 补类型 + 任务列表 |
| **P1** | 快捷任务清单 | ✅ `/api/dashboard/quick-tasks` GET/PUT | ❌ 无 | ❌ 未渲染 | 中 — 新增组件 + CRUD |
| **P1** | 常用系统访问入口 | ✅ `/api/dashboard/shortcut-entries` GET/PUT | ❌ 无 | ❌ 未渲染 | 中 — 新增组件 + CRUD |
| **P2** | GitLab 快速入口 | ✅ 公众端已有 GitLab 绑定能力 | ✅ `development.ts` 已有类型 | ⚠️ 仅在项目详情内 | 中 — 提取到工作台快捷入口 |
| **P2** | 流水线快捷构建 | ✅ `/api/cicd/pipeline-center` | ✅ `release.ts` 已有类型 | ⚠️ 仅在 Release 页面 | 中 — 提取到工作台 |
| **P3** | 可拖拽布局编辑 | N/A（前端能力） | ❌ 无 | ❌ 无 | 大 — 需引入拖拽库 + 布局持久化 |

### 具体差距说明

**管理端 vs 公众端工作台对比：**

```
管理端（10 个组件 + 布局编辑）         公众端（4 个区块 + 静态布局）
┌──────────────────────────┐          ┌──────────────────────────┐
│ stat-project-count       │          │ 统计卡片 x4              │
│ stat-agent-count         │          │ (项目/任务/智能体/仓库)   │
│ stat-task-count          │          │                          │
│ gitlab-quick-merge       │ ← 缺失   │ 我的任务统计              │
│ quick-pipeline-build     │ ← 缺失   │ (总数/进行中/待处理)      │
│ active-project-list      │          │ 活跃项目 (最多6个)       │
│ online-agent-list        │ ← 缺失   │                          │
│ recent-task-list         │          │ 最近任务 (最多5条)       │
│ system-shortcut-entries  │ ← 缺失   │                          │
│ quick-task-checklist     │ ← 缺失   │                          │
│ + 拖拽布局编辑           │ ← 缺失   │                          │
└──────────────────────────┘          └──────────────────────────┘
```

**关键发现：后端 `/api/dashboard/overview` 已经返回了 `onlineAgents` 和 `shortcutOverview`，但公众端 TS 类型 `DashboardOverview`（`frontend-public/src/types/dashboard.ts:22`）没有声明这些字段，导致数据被丢弃。**

---

## 五、下一步建议

### 短期（P0 — 快速补齐）

1. **公众端工作台补"在线智能体"卡片**
   - 修改 `frontend-public/src/types/dashboard.ts`：`DashboardOverview` 增加可选 `onlineAgents` 字段
   - 修改 `frontend-public/src/pages/dashboard/DashboardPage.tsx`：渲染在线智能体列表
   - 后端零改动（已返回数据）

2. **公众端工作台补"我的任务"列表**
   - `DashboardOverview` 增加可选 `myTasks` 字段
   - 将当前的"我的任务统计"区块下方追加任务列表

### 中期（P1 — 功能对齐）

3. **公众端补"快捷任务"组件**
   - 新增 `QuickTaskWidget.tsx`，调用 `/api/dashboard/quick-tasks`
   - 支持新增、勾选、删除、排序

4. **公众端补"常用系统访问入口"组件**
   - 新增 `ShortcutEntriesWidget.tsx`，调用 `/api/dashboard/shortcut-entries`
   - 支持系统入口展示 + 个人入口 CRUD

### 长期（P2-P3 — 体验升级）

5. **公众端工作台引入"GitLab 快速入口"和"快速构建"**
   - 从现有 `DevelopmentPage` / `ReleasePage` 提取快捷操作到工作台
6. **公众端工作台引入可拖拽布局**
   - 引入 `@dnd-kit/core` 或 `react-grid-layout`
   - 复用管理端布局定义思路，实现按用户持久化

---

## 六、环境与端口信息

| 服务 | 端口 | 状态 |
|------|------|------|
| 管理端前端 | 5173 | ✅ |
| 公众端前端 | 5175 | ✅ |
| 后端 | 8080 | ✅ |
| 代码处理 | 9000 | ✅ |
| Hermes | 18080 | ✅ |
| PostgreSQL | 5432 | ✅ |
| Woodpecker | 18000 | ✅ |

数据库备份文件：`database/backups/ai_agent_platform_backup_20260704_112750.sql`
