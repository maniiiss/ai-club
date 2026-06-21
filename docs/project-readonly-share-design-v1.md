# 项目只读分享页设计 v1

> 版本：v1
> 适用模块：`backend.GitlabManagementService` / `frontend.ProjectView` / `frontend.GitlabAutoMergePublicView`
> 关联表：`gitlab_auto_merge_project_share`（迁移 `V87`、`V88`）

## 1. 背景

「代码仓库管理 - 自动合并中心」原本以"自动合并策略"为单位提供只读分享页，但项目对外的真实诉求是：

- 分享对象是**项目**，不是某条策略；
- 除了"AI 自动合并日志"之外，相关方还希望看到这个项目对外发布的**流水线运行记录**；
- 链接管理动作（生成 / 刷新 / 失效 / 复制）只应出现一次，不应在多个入口重复维护。

为此，本版本把分享入口从「自动合并中心」迁移到「项目管理列表」，并将同一份分享链接的内容扩展到两类只读视图。

## 2. 数据模型

复用既有表 `gitlab_auto_merge_project_share`，**不引入新迁移**：

| 字段 | 含义 |
|---|---|
| `project_id` | 唯一外键，1 项目 1 条 |
| `token_ciphertext` | 通过 `TokenCipherService` 加密的随机 token，明文不入库 |
| `expires_at` | 过期时间；`NULL` 表示永久有效（V88 起） |
| `enabled` | 失效时置为 `false`，token 仍保留以便审计 |

虽然表名仍含 `auto_merge`，从语义上已升级为"项目只读分享 token"。考虑到不破坏存量数据，我们保留表名与原 `/api/gitlab/projects/{projectId}/auto-merge-share` 鉴权接口签名，新增的能力以**新公开端点**形式扩展，避免破坏性升级。

## 3. 后端 API

### 3.1 已有（保持不变）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/gitlab/projects/{projectId}/auto-merge-share` | 鉴权：读取当前 share 状态 |
| POST | `/api/gitlab/projects/{projectId}/auto-merge-share` | 鉴权：生成或刷新 token |
| DELETE | `/api/gitlab/projects/{projectId}/auto-merge-share` | 鉴权：让 token 立即失效 |
| GET | `/api/gitlab/public/projects/{projectId}/auto-merge-logs/{token}` | 公开：分页拉取自动合并日志 |

### 3.2 本版本新增

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/gitlab/public/projects/{projectId}/pipelines/{token}` | 公开：列出该项目绑定的 Woodpecker + Jenkins 流水线（脱敏摘要） |
| GET | `/api/gitlab/public/projects/{projectId}/pipelines/{token}/runs?kind=&pipelineId=&page=&size=` | 公开：分页拉取选中流水线的运行历史摘要 |

所有公开端点统一通过 `AuthInterceptor.isPublicPath` 中的 `/api/gitlab/public/` 前缀放行，无登录态。

### 3.3 校验链路

`GitlabManagementService.requireValidProjectShare(projectId, token)` 是唯一入口：

1. 项目必须存在；
2. share 必须存在且 `enabled = true`；
3. `expires_at` 为空（永久）或晚于当前时间；
4. 解密 `token_ciphertext` 与请求 token 字符串等值。

任何一步失败均抛 `IllegalArgumentException`，前端公开页统一展示"链接当前不可用"。流水线接口在 token 校验通过后，**额外校验** `pipelineId` 是否归属当前 `projectId`，防止越权读取其它项目的流水线 run。

## 4. 双源流水线聚合

平台同时支持两类流水线绑定：

| 来源 | 实体 | 历史是否落库 |
|---|---|---|
| Woodpecker（AI Club 内置） | `AiClubPipelineEntity` | 是（`ai_club_pipeline_run_snapshot` 摘要表 + 实时调用 Woodpecker API） |
| Jenkins（外部 CI 绑定） | `ProjectPipelineBindingEntity` | 否，每次实时调用 Jenkins API |

公开页通过 `kind` 路由：

```
WOODPECKER → cicdManagementService.listAiClubPipelineRuns(pipelineId, limit) → 映射 AiClubPipelineRunSummary → ProjectPublicPipelineRunSummary
JENKINS    → cicdManagementService.listPipelineBuilds(pipelineId, limit)    → 映射 JenkinsBuildSummary       → ProjectPublicPipelineRunSummary
```

公开调用是匿名的，`ProjectDataPermissionService.currentScopeOrNull()` 返回 `null`，因此 cicd service 内部的项目可见性校验自动放行；安全闸由本服务 `requireValidProjectShare` + `pipelineId` 归属校验承担。

## 5. 数据脱敏白名单

公开 DTO 严格白名单字段：

`ProjectPublicPipelineSummary`（流水线摘要）：
- `id, kind, name, defaultBranch, lastStatus, lastTriggeredAt, lastUrl`

`ProjectPublicPipelineRunSummary`（单次运行摘要，6 字段）：
- `runNumber, status, branch, event, triggeredAt, runUrl`

**显式不暴露**：commit message、提交者用户名 / 邮箱、控制台日志、构建参数、Webhook payload、Woodpecker yaml、Jenkins job 完整 URL 之外的服务器信息等。

Woodpecker 原始 `AiClubPipelineRunSummary` 含 `message / commit` 字段——映射时**直接丢弃**，单元测试 `GitlabPublicPipelineShareTests#shouldMapWoodpeckerRunsToPublicSummary` 守住。

Jenkins 原始 `JenkinsBuildSummary` 含 `description` —— 同样丢弃；`building=true` 时状态映射为 `RUNNING`，分支取绑定的 `defaultBranch`，事件统一为 `MANUAL`（Jenkins 没有事件类型概念）。

## 6. 错误兜底

| 场景 | 行为 |
|---|---|
| Token 无效 / 过期 / disabled | 返回 4xx，前端显示"链接不可用" |
| `pipelineId` 不属于当前项目 | 抛 `NoSuchElementException`，前端 404 处理 |
| Woodpecker / Jenkins API 调用失败 | 后端 200 + 空 `runs` + `warning`，前端在表格上方展示警告，不影响其它内容（含自动合并日志 tab） |

## 7. 前端结构

- **入口**：`frontend/src/views/ProjectView.vue` 列表行的「只读分享」按钮（桌面 + 移动端均有）。
- **状态管理**：`frontend/src/composables/useProjectReadonlyShare.ts`，封装 dialog 状态、open / refresh / disable / copy / close 五个动作；GitlabView 已彻底删除原分享按钮、dialog 与脚本。
- **公开页**：`frontend/src/views/GitlabAutoMergePublicView.vue`（命名保留以兼容旧链接；内部已升级为 tab 版）。
  - tab1：自动合并日志（旧体验保留）；
  - tab2：流水线发布记录（新增）。
- **路由**：
  - 旧路径 `/gitlab/public/projects/:projectId/auto-merge-logs/:token` 保留为权威路径，旧 token 链接保持有效；
  - 新别名 `/public/projects/:projectId/readonly/:token`，渲染同一组件，未来可作为统一对外入口逐步替换；
  - 路由 query `?tab=pipelines` 直接落地到流水线 tab，便于未来生成"特定 tab 的深链分享"。

## 8. 测试

### 8.1 单元测试 `GitlabPublicPipelineShareTests`

| 用例 | 守住的行为 |
|---|---|
| `shouldAggregateWoodpeckerAndJenkinsPipelinesForShare` | 双源合并、字段顺序、defaultBranch 透传 |
| `shouldRejectListingPipelinesWhenShareDisabled` | disabled token 拒绝列表，repository 不被调用 |
| `shouldRejectWoodpeckerPipelineFromOtherProject` | `pipelineId` 越权场景 |
| `shouldMapWoodpeckerRunsToPublicSummary` | Woodpecker 映射不带 message / commit |
| `shouldFallbackWhenJenkinsApiFails` | Jenkins 异常 → 空列表 + warning |
| `shouldMapJenkinsBuildsToPublicSummary` | building=true 映射为 RUNNING、event=MANUAL |

### 8.2 既有 share 测试回归

`GitlabManagementGitlabActionsTests` 中 3 个 share 用例已同步更新：补 `projectRepository.findById` stub、纠正 share URL 断言为前端路径、移除多余的 `tokenCipherService.decrypt` stub。

## 9. 后续演进

1. share 表后续可考虑改名为 `project_readonly_share` 或拆分 `share_scope` 字段以支持"按内容粒度限制可见性"。
2. 流水线发布记录目前只展示运行编号，未来可以叠加"上线版本号 / 关联 MR"等业务语义，沉淀为真正的"发布记录"概念表（区别于运行历史）。
3. 公开 API 目前没有 rate-limit，必要时可加 IP 维度限频，避免有人通过暴力穷举 token 攻击。
