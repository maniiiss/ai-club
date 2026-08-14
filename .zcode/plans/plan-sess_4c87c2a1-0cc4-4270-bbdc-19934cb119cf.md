# 业主仓库绑定新增"自定义克隆地址"字段

## 目标
在业主仓库绑定（仓库镜像）上新增一个用户可手填的"克隆地址"字段。推送时**优先使用该字段**，留空则回退到测试连接自动探测的 `gitlabHttpCloneUrl`。这样用户可直接填 `http://git.hbgjkt.com/hbgj_crm/app-gj-crm.git`，让推送走 80 端口，绕开 GitLab API 返回 https clone URL 导致 443 不通的问题。

## 行为决策（采用默认，无需额外确认）
- **覆盖优先、留空回退**：填了 customCloneUrl 就用它；没填用自动探测的 gitlabHttpCloneUrl。向后兼容，老绑定行为不变。
- `testBinding` 仍回写自动探测值到 `gitlabHttpCloneUrl`，**不覆盖**用户填的 customCloneUrl（两者并存，自动探测值作兜底/展示）。
- `gitlabProjectRef` 保留（测试连接、创建 MR 仍需要）。
- code-processing 不改动：`targetRepoUrl` 透传，它已支持 http/https 回退，传 http 地址会先试 80 端口成功。

## 前置修复（必须，否则保存不了自定义地址）
**文件**：`frontend/src/api/gitlab.ts` 第 585、591、596 行
**问题**：`updateOwnerRepoBinding`/`deleteOwnerRepoBinding`/`testOwnerRepoBinding` 三个函数的 URL 模板被污染成字面量 `` `/api/gitlab/owner-repos/bindings/$glm_5.2_ark_toC` ``（应为 `$glm_5.2_ark_toC`）。这导致编辑保存、删除、测试连接三个接口路径错误。
**处理**：改为 `$glm_5.2_ark_toC`。实现时先用 `git show HEAD:frontend/src/api/gitlab.ts` 核实这是磁盘真实内容而非显示假象；同时检查同文件 GitLab 绑定（非业主）的 update/delete/test 函数是否有同类问题，若有一并修正。

## 改动清单

### 1. 数据库迁移 V148
**新建** `backend/src/main/resources/db/migration/V148__owner_repo_custom_clone_url.sql`：
```sql
-- 业主仓库绑定新增自定义克隆地址字段，非空时推送优先使用，绕过 GitLab API 返回地址不可达的情况
ALTER TABLE project_owner_repo_binding
    ADD COLUMN IF NOT EXISTS custom_clone_url VARCHAR(500);

COMMENT ON COLUMN project_owner_repo_binding.custom_clone_url IS '业主仓库自定义克隆地址，非空时推送优先使用，留空回退到自动探测的 gitlab_http_clone_url';
```
（命名与 V138/V147 一致；当前最新 V147，取 V148）

### 2. 实体 ProjectOwnerRepoBindingEntity
**文件**：`backend/src/main/java/com/aiclub/platform/domain/model/ProjectOwnerRepoBindingEntity.java`
在 `gitlabSshCloneUrl`（71-72 行）之后新增字段：
```java
/**
 * 业主仓库自定义克隆地址，非空时推送优先使用，绕过 GitLab API 返回地址不可达的情况。
 */
@Column(name = "custom_clone_url", length = 500)
private String customCloneUrl;
```
并补 getter/setter `getCustomCloneUrl()`/`setCustomCloneUrl(String)`（参照同文件 gitlabHttpCloneUrl 的 getter/setter 写法，180-185 行附近）。

### 3. 请求 DTO OwnerRepoBindingRequest
**文件**：`backend/src/main/java/com/aiclub/platform/dto/request/OwnerRepoBindingRequest.java`
record 在 `gitlabProjectRef` 之后新增：
```java
@Size(max = 500, message = "克隆地址长度不能超过500")
String customCloneUrl,
```

### 4. 返回 DTO OwnerRepoBindingSummary
**文件**：`backend/src/main/java/com/aiclub/platform/dto/OwnerRepoBindingSummary.java`
record 在 `gitlabSshCloneUrl` 之后新增 `String customCloneUrl,`

### 5. OwnerRepoBindingManagementService
**文件**：`backend/src/main/java/com/aiclub/platform/service/OwnerRepoBindingManagementService.java`
- `createBinding`（81-97 行赋值块）：加 `entity.setCustomCloneUrl(trimToNull(request.customCloneUrl()));`
- `updateBinding`（99-117 行赋值块）：加 `entity.setCustomCloneUrl(trimToNull(request.customCloneUrl()));`
- `toBindingSummary`（234-258 行）：在 `entity.getGitlabSshCloneUrl()` 之后加 `entity.getCustomCloneUrl(),`（位置与 Summary record 字段顺序一致）
- `testBinding`（119-150 行）：**保持不变**，仍回写 gitlabHttpCloneUrl，不触碰 customCloneUrl

### 6. OwnerRepoPushService 推送取址（核心）
**文件**：`backend/src/main/java/com/aiclub/platform/service/OwnerRepoPushService.java`
- 新增私有方法，集中"优先 customCloneUrl、回退 gitlabHttpCloneUrl"逻辑：
```java
/** 推送目标克隆地址：优先用户自定义地址，留空回退到测试连接探测的地址。 */
private String resolveTargetCloneUrl(ProjectOwnerRepoBindingEntity binding) {
    String custom = trimToNull(binding.getCustomCloneUrl());
    if (custom != null) {
        return custom;
    }
    return binding.getGitlabHttpCloneUrl();
}
```
- 第 108 行 `binding.getGitlabHttpCloneUrl()` 改为 `resolveTargetCloneUrl(binding)`
- `resolveDisabledReason`（174-185 行，第 181 行）：改为两者皆空才禁用：
```java
if (!hasText(binding.getCustomCloneUrl()) && !hasText(binding.getGitlabHttpCloneUrl())) {
    return "业主仓库未测试连接且未配置自定义克隆地址，缺少 Clone 地址";
}
```

### 7. 前端类型 platform.ts
**文件**：`frontend/src/types/platform.ts`
`OwnerRepoBindingItem`（1175-1197 行）在 `gitlabSshCloneUrl` 之后新增：
```ts
customCloneUrl: string | null
```

### 8. 前端 API gitlab.ts
**文件**：`frontend/src/api/gitlab.ts`
- `OwnerRepoBindingPayload`（538-547 行）新增 `customCloneUrl?: string`
- 修复第 585/591/596 行 URL 模板 `$glm_5.2_ark_toC` → `$glm_5.2_ark_toC`（前置修复）

### 9. 前端表单 GitlabView.vue
**文件**：`frontend/src/views/GitlabView.vue`
- `OwnerRepoForm` 接口（3165 行）：加 `customCloneUrl: string`
- reactive 实例（3187 行）：加 `customCloneUrl: ''`
- `ownerRepoRules`（3188 行）：加可选格式校验（允许空；非空时须以 http:// 或 https:// 开头）
- `resetOwnerRepoForm`（3292 行）：重置 `customCloneUrl: ''`
- `handleOwnerRepoEdit`（3309 行）：回填 `customCloneUrl: item.customCloneUrl ?? ''`
- `handleOwnerRepoSubmit` 的 payload（3323 行）：加 `customCloneUrl: ownerRepoForm.customCloneUrl.trim()`
- 桌面表单（2607-2609 附近，"仓库镜像" section 内，项目标识之后）新增 el-form-item：
  - label="克隆地址" prop="customCloneUrl"
  - el-input placeholder="留空则自动从 GitLab 获取；填写后推送优先使用此地址，如 http://git.example.com/group/repo.git"
- 移动表单（2662-2664 附近）：同步新增相同 el-form-item

## 不改动
- code-processing（`targetRepoUrl` 透传，已支持 http/https 回退，传 http 地址会先试 80 端口）
- `MirrorPushRequest` / `OwnerRepoMirrorPushRequest` 模型字段
- 源仓库 `ProjectGitlabBindingEntity`（不在本次范围；如未来源仓库也需手填可同款改造）

## 验证（按 AGENTS.md harness 优先级）
1. 编码检查：`python scripts/check_encoding.py`
2. 后端测试：`cd backend && mvn -s maven-settings-central.xml test`
3. 管理端构建：`cd frontend && npm run build`
4. 手动验证：在业主仓库绑定里填入 `http://git.hbgjkt.com/hbgj_crm/app-gj-crm.git`，触发推送，确认走 80 端口成功（不再 443 超时）

## 文档同步
本次属功能新增（非架构边界变化），不触发 `docs/architecture.md` 更新；如需在业主仓库推送说明里补充"自定义克隆地址"用途，可在实现后视情况补一句。
