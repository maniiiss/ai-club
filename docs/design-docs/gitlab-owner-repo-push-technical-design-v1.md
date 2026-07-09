# GitLab 推送到业主代码仓库 - 技术设计 v1

## 1. 背景与目标

平台需要将自身 GitLab 仓库的代码交付到业主方（其他 GitLab 实例）的代码仓库。第一版聚焦手动推送，支持整个分支镜像（保留完整提交历史），推送方式可选直接推送、推到新分支或创建 MR。

### 需求确认

| 维度 | 决策 |
|------|------|
| 目标平台 | GitLab（其他实例） |
| 推送内容 | 整个分支镜像，保留完整提交历史 |
| 推送方式 | DIRECT（直接推送覆盖）/ NEW_BRANCH（推到交付子分支）/ MERGE_REQUEST（推到子分支并发起 MR） |
| 凭据管理 | 按项目独立配置业主仓库地址 + Token |
| 触发方式 | 手动触发（管理端配置 + 推送，公众端推送） |

## 2. 架构决策

### 2.1 git push 能力放在 code-processing

**决策**：镜像推送的 `git clone` + `git push` 由 code-processing 执行，backend 负责编排。

理由：
1. code-processing 已有完整的 git subprocess 基础设施（3 种认证策略、URL 鉴权构造、`GIT_TERMINAL_PROMPT=0`、敏感信息脱敏）。新增 push 只是在 clone 之后加 `git push`，认证策略完全复用。
2. 符合现有架构分工：backend 做编排/凭据解密/权限/持久化，code-processing 做代码操作。大仓库 clone+push 是长任务，FastAPI 长超时模型更合适。
3. backend↔code-processing 内部调用鉴权已有 `_require_internal_service_auth`。

### 2.2 服务边界变化

code-processing 从"纯只读分析服务"扩展为"可执行代码推送"。这是合理演进：
- 凭据管理仍在 backend（AES-GCM 加密存储，调用时解密传明文给 code-processing，内部网络 + Bearer 鉴权保障安全）
- code-processing 日志/异常经 `_sanitize_sensitive_text` 脱敏（Token 和 `quote(token)` 都替换为 `***`）
- 代码写入只在业主仓库，不影响平台自身仓库

### 2.3 为何不用 GitLab REST API

GitLab Commits API 只能创建新 commit，无法推送已有的历史 commit 链。"整个分支镜像保留完整历史"必须用原生 `git push`。

## 3. 数据模型

### 3.1 `project_owner_repo_binding` - 业主仓库绑定

项目级 CRUD，一个项目可配置多个业主仓库。Token 经 AES-GCM 加密存储（复用 `TokenCipherService`）。

关键字段：
- `project_id` - 关联项目（外键 CASCADE）
- `name` - 绑定名称
- `api_base_url` / `gitlab_project_ref` - 业主 GitLab API 地址 + 仓库标识
- `gitlab_http_clone_url` - 测试连接时回写的 Clone 地址（推送时使用）
- `default_target_branch` / `default_push_mode` - 默认目标分支与推送方式
- `token_ciphertext` - AES-GCM 加密的访问 Token
- `last_push_status` / `last_push_message` / `last_pushed_at` - 最近推送状态

### 3.2 `owner_repo_push_log` - 推送历史日志

每次推送落库一条记录，包含源/目标分支、推送方式、commit SHA、MR 信息和执行状态。

### 3.3 权限种子

新增 `gitlab:owner-repo:manage`（ACTION 类型），查看复用 `gitlab:view`。超级管理员自动授权，PUBLIC_DEFAULT 角色补授以便公众端使用。

## 4. 后端实现

| 组件 | 职责 |
|------|------|
| `ProjectOwnerRepoBindingEntity` / `OwnerRepoPushLogEntity` | JPA 实体 |
| `ProjectOwnerRepoBindingRepository` / `OwnerRepoPushLogRepository` | 数据访问 |
| `OwnerRepoBindingManagementService` | 绑定 CRUD + test 连接（复用 `GitlabApiService.fetchProject`） |
| `OwnerRepoPushClientService` | 调用 code-processing 镜像推送接口（600s 超时） |
| `OwnerRepoPushService` | 推送编排：权限校验 → 解密凭据 → 调 code-processing → MERGE_REQUEST 方式调 `createMergeRequest` → 落库日志 + 更新状态 |
| `OwnerRepoController` | REST 接口 `/api/gitlab/owner-repos/*` |

推送编排参照 `GiteeTestPlanPushService` 的事务模式，失败时仍落库 FAILED 状态再返回三态结果（SUCCESS/PARTIAL/FAILED）。

## 5. code-processing 实现

| 组件 | 职责 |
|------|------|
| `owner_repo_push_service.py` | `mirror_push_to_owner_repo`：完整 clone 源仓库 → 添加目标 remote → `git push` |
| `models.py` | `OwnerRepoMirrorPushRequest` / `OwnerRepoMirrorPushResponse` |
| `routes.py` | `POST /api/code/owner-repo-push/mirror`（`@require_internal_service_auth`） |

推送流程：
1. `git clone`（完整历史，不用 `--depth 1`）源仓库指定分支，3 种认证策略依次尝试
2. 按 pushMode 计算目标分支：DIRECT 用原分支名，NEW_BRANCH/MERGE_REQUEST 用 `delivery/{branch}-{timestamp}`
3. `git push target <refspec>`，DIRECT 模式加 `--force-with-lease`
4. 获取源/目标 commit SHA，清理临时工作区

## 6. 前端实现

### 6.1 管理端（frontend, Vue 3 + Element Plus）

GitlabView.vue 新增第 5 个 Tab「业主仓库」：
- 绑定列表 + CRUD 表单 dialog（复用 `platform-form-dialog` 骨架）
- 推送表单 dialog（选源绑定 → 选源分支 → 目标分支 → 推送方式 + DIRECT 风险提示）
- 推送结果 dialog + 推送历史 drawer
- 权限控制：`canManageOwnerRepo = authStore.hasPermission('gitlab:owner-repo:manage')`

### 6.2 公众端（frontend-public, React 19 + Tailwind）

DevelopmentPage.tsx 新增第 7 个 Tab「业主仓库」：
- `OwnerRepoPushPanel.tsx` 组件：业主仓库列表 + 推送表单 SlideDrawer + 推送结果 + 推送历史
- 沿用"管理端配置、公众端操作"模式（空绑定提示"请先在管理控制台配置"）
- 复用自研组件（Select/Input/Button/SlideDrawer/ConfirmDialog/Toast），禁止原生 `<select>`
- `ownerRepoPushUtils.ts` 纯函数 + Node 原生 test runner 测试

## 7. 风险与注意事项

1. **force push 覆盖风险**：DIRECT 模式用 `--force-with-lease` 强制覆盖目标分支历史。前端必须二次确认，默认 pushMode 为 NEW_BRANCH。
2. **长任务超时**：code-processing 接口 600s，backend HttpClient 同步放大，前端推送请求单独设 600s timeout。
3. **Token 传递安全**：backend→code-processing 传明文 Token（内部网络 + Bearer 鉴权）；code-processing 日志/异常经脱敏处理。

## 8. 第一版不做

- 定时/自动推送
- 远端分支/仓库清理
- 推送到非 GitLab 平台
- 异步推送任务（第一版同步长超时，后续演进）
- 业主/客户实体分组
- 公众端配置业主仓库绑定
