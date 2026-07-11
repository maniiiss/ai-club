# 编排管理并入智能体管理页面（tab 切换，参照 gitlab 管理）

## 现状
- "编排管理"是管理端主导航独立菜单项（`AppLayout.vue:881`），路由 `/execution-orchestrations`（`router/index.ts:124`），渲染 `ExecutionOrchestrationView.vue`，权限 `['execution:orchestration:manage', 'project:manage']`。
- "智能体管理"是主导航独立菜单（`AppLayout.vue:879`），路由 `/agents`（`router/index.ts:121`，顶部第6行静态 import AgentView），渲染 `AgentView.vue`，权限 `agent:view`。
- `GitlabView.vue` 用 `el-tabs` + 隐藏默认 header（`.el-tabs__header{display:none}`）+ 自定义胶囊按钮组（`.gitlab-tab-switcher/.gitlab-tab-button`，CSS 4669-4725 行）实现 tab 切换，作为参考实现。
- 全前端无其他组件通过路由名/路径跳转到编排管理（已 grep 确认），影响范围可控。

## 目标
将编排管理作为 tab 并入智能体管理页面，主导航不再显示独立"编排管理"入口，UI 行为与 gitlab 管理 tab 切换一致；编排 tab 按权限显隐（已与用户确认采用此策略）。

## 改动文件

### 1. 新建 `frontend/src/views/AgentManagementView.vue`（tab 容器）
- 复刻 GitlabView 的 tab 切换：`el-tabs` + 隐藏默认 header + 自定义胶囊按钮组。
- tab switcher 放在 `el-tabs` 外部上方，只写一次、始终可见（比 gitlab 在每个 pane 重复更简洁，因为两个子页面工具栏结构不同）。
- 两个 tab：
  - `agents`「智能体管理」→ `<AgentView />`
  - `orchestration`「执行编排」→ `<ExecutionOrchestrationView />`（`v-if="canViewOrchestration"`）
- 权限：`canViewOrchestration = computed(() => authStore.hasPermission('execution:orchestration:manage') || authStore.hasPermission('project:manage'))`。
- 默认 tab：从 `route.query.tab` 读取，若为 `orchestration` 且有权限则选中编排 tab，否则回退 `agents`。
- CSS 复刻 gitlab switcher 样式（胶囊容器 + active 白底高亮 + `var(--app-primary)`），让 `el-tabs`/pane 撑满高度。
- 不设 `lazy`，两个子组件同时挂载（与 gitlab 一致，切换无感、不重复加载）。

### 2. 修改 `frontend/src/router/index.ts`
- 顶部第6行 `import AgentView` 调整为引入 `AgentManagementView`（静态 import 或懒加载均可，保持文件风格）。
- 第121行 `/agents` 路由：component 改为 `AgentManagementView`，`meta.permission` 改为 `['agent:view', 'execution:orchestration:manage', 'project:manage']`（保证原编排权限用户仍可进入）。
- 第124行 `/execution-orchestrations` 路由：改为 `redirect: { path: '/agents', query: { tab: 'orchestration' } }`，`meta.permission` 保持原数组，兼容旧书签/链接。
- `router.beforeEach` 已支持数组 permission（任一满足即放行），无需改动。

### 3. 修改 `frontend/src/layout/AppLayout.vue`
- 第879行「智能体管理」seed：`permission` 由 `'agent:view'` 改为 `['agent:view', 'execution:orchestration:manage', 'project:manage']`，`matchNames` 保持 `['agents']`。
- 删除第881行「编排管理」seed（整个对象）。
- `buildMenuItems` 的 `uniquePermissionSeed` 检查：移除编排 seed 后，`execution:orchestration:manage` 与 `project:manage` 仅在智能体 seed 出现一次，仍判 true，菜单正确显示"智能体管理"并指向 `/agents`。

### 4. 文档更新（满足 AGENTS.md 架构同步要求）
- `docs/architecture.md` 4.7.3（第727行附近）：将"管理端'执行中心 / 编排管理'"更新为"编排管理已作为 tab 并入智能体管理页面（路径 `/agents`）"，并说明编排 tab 按 `execution:orchestration:manage`/`project:manage` 显隐、入口菜单/路由权限扩展为数组。

## 验证
- `cd frontend && npm run build`（管理端页面变更必跑）。
- `python scripts/check_encoding.py`（文档/脚本变更至少跑编码检查）。

## 不改动
- 后端 API、权限码、taxonomy 不变。
- `AgentView.vue`、`ExecutionOrchestrationView.vue` 组件内部逻辑不变（作为子组件原样嵌入）。
- 公众端、code-processing 不涉及。