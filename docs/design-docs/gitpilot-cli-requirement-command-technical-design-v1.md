# GitPilot CLI `/requirement` 命令技术设计 v1

> 状态：设计稿（待评审）
> 作者：AI Club 智能体
> 日期：2026-07-26
> 关联模块：`backend`（Spring Boot）、`gitpilot-cli`（TypeScript）

## 1. 背景与目标

### 1.1 背景

GitPilot CLI 是基于 `@earendil-works/pi-coding-agent` 二开的终端 AI Agent，已对接平台的模型推理能力（设备授权签发 `gpt_` 长期 token、`/api/cli/models` 拉模型清单、`/api/cli/model-sessions` 签发短期推理会话）。

但当前 CLI **无法读取平台的需求/任务数据**：

- `gpt_` CLI token 只被 `AuthInterceptor` 接受于 `/api/cli/*` 路径，而 `/api/tasks`（会话认证）CLI 无法直接访问。
- `GitPilotCliController` 目前只有设备授权、模型目录、模型会话三类端点，无任务/需求相关接口。

用户希望在 CLI 内直接拉取“负责人是自己”的需求列表，并基于选中需求驱动 AI 完成技术设计与开发，减少在 Web 控制台与 CLI 之间切换的成本。

### 1.2 目标

1. 新增 `/requirement` 命令：读取平台 `workItemType="需求"` 且 `assigneeUser` = 当前 CLI 登录用户 的需求列表。
2. 选中某条需求后，自动构造“技术设计 + 开发实现”指令并触发 AI 推理，进入设计开发工作流。
3. 前后端协同实现：后端新增 CLI 专用端点与查询，客户端新增命令、API 客户端与交互。

### 1.3 非目标（YAGNI）

- 不做需求的创建/编辑/删除，仅读取。
- 不做命令行参数化复杂过滤（首版仅交互式选择，`status`/`priority`/`projectId` 等过滤留作后续扩展）。
- 不覆盖 `workItemType="任务"` 类型，首版仅需求。
- 不做分页翻页 UI（首版拉首页 `size=50`，超出部分后续再做）。

## 2. 功能定义

| 项 | 说明 |
|---|---|
| 命令名 | `/requirement` |
| 触发 | 交互模式输入 `/requirement`（无需参数） |
| 列表来源 | 平台 `GET /api/cli/tasks`，强制 `workItemType=需求`、`assigneeUser=当前用户` |
| 交互 | `ctx.ui.select` 选择器展示，选中后构造指令 prompt |
| 选中后行为 | `pi.sendUserMessage(prompt)` 触发 AI 进入“技术设计 + 开发实现” |
| 取消 | Esc 取消选择则不发送任何消息 |

## 3. 后端设计（backend · Spring Boot）

### 3.1 `PlatformStoreService` 新增独立查询方法

当前任务分页查询统一在 `PlatformStoreService.pageTasks(...)`（`backend/src/main/java/com/aiclub/platform/service/PlatformStoreService.java:863`），其内部调用 `requireCurrentScope()` 叠加“项目参与人”可见性过滤，且不支持按负责人过滤。直接扩展 `pageTasks` 会污染 Web 端行为，故新增独立方法。

**新增方法签名：**

```java
/**
 * 分页查询“负责人是指定用户的需求”列表，供 GitPilot CLI 使用。
 *
 * 与 pageTasks 的差异：
 * 1. 强制 assigneeUser.id = userId（负责人过滤）；
 * 2. 强制 workItemType = "需求"（只看需求，不看任务）；
 * 3. 不叠加项目参与人可见性（requireCurrentScope / appendProjectVisibilityPredicate），
 *    因为语义是“负责人是自己的需求”，参与人过滤会导致漏看。
 *
 * @param userId   当前 CLI 登录用户 ID（作为负责人）
 * @param page     页码（1-based）
 * @param size     每页条数
 * @param status   状态过滤（可空）
 * @param priority 优先级过滤（可空）
 * @param projectId 项目 ID 过滤（可空）
 * @param keyword  名称/描述模糊（可空）
 */
public PageResponse<CliTaskSummary> pageMyRequirementTasks(
        Long userId, int page, int size,
        String status, String priority, Long projectId, String keyword);
```

**新增谓词 `cliMyTasksSpecification`**（参考 `workItemPageSpecification:1406` 的写法）：

```java
private Specification<TaskEntity> cliMyTasksSpecification(
        Long userId, String keyword, String status, String priority, Long projectId) {
    return (root, query, cb) -> {
        List<Predicate> predicates = new ArrayList<>();
        // 1. 负责人 = 当前用户
        predicates.add(cb.equal(root.get("assigneeUser").get("id"), userId));
        // 2. 工作项类型 = 需求（复用 normalizeWorkItemType，参考 workItemPageSpecification）
        predicates.add(cb.equal(root.get("workItemType"), normalizeWorkItemType("需求")));
        // 3. 可选过滤
        if (hasText(keyword)) {
            String like = "%" + keyword.trim() + "%";
            predicates.add(cb.or(
                cb.like(root.get("name"), like),
                cb.like(root.get("description"), like)
            ));
        }
        if (hasText(status)) {
            // 复用 taskSpecification:1348 现有 status 谓词写法（支持逗号分隔多状态），
            // 具体方法名在 writing-plans 阶段对照源码落实，不新增解析逻辑
            predicates.add(root.get("status").in(parseStatuses(status)));
        }
        if (hasText(priority)) {
            predicates.add(cb.equal(root.get("priority"), priority.trim()));
        }
        if (projectId != null) {
            predicates.add(cb.equal(root.get("project").get("id"), projectId));
        }
        return cb.and(predicates.toArray(new Predicate[0]));
    };
}
```

> 注意：**不调用** `requireCurrentScope()`、**不调用** `appendProjectVisibilityPredicate`，绕过项目可见性。

**新增映射 `toCliTaskSummary(TaskEntity)`**（精简字段，去掉 `prd*`、`collaborator*`、`external*` 等大/无关字段）：

```java
private CliTaskSummary toCliTaskSummary(TaskEntity entity) {
    return new CliTaskSummary(
        entity.getId(),
        entity.getWorkItemCode(),
        entity.getName(),
        entity.getStatus(),
        entity.getPriority(),
        entity.getAssignee(),
        entity.getTaskType(),
        entity.getProject() == null ? null : entity.getProject().getId(),
        entity.getProject() == null ? null : entity.getProject().getName(),
        entity.getIteration() == null ? null : entity.getIteration().getId(),
        entity.getIteration() == null ? null : entity.getIteration().getName(),
        entity.getPlanStartDate(),
        entity.getPlanEndDate(),
        entity.getRequirementMarkdown()
    );
}
```

`pageMyRequirementTasks` 方法体：

```java
public PageResponse<CliTaskSummary> pageMyRequirementTasks(
        Long userId, int page, int size,
        String status, String priority, Long projectId, String keyword) {
    Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.DESC, "id"));
    Page<CliTaskSummary> pageData = taskRepository
        .findAll(cliMyTasksSpecification(userId, keyword, status, priority, projectId), pageable)
        .map(this::toCliTaskSummary);
    return PageResponse.from(pageData);
}
```

### 3.2 `GitPilotCliController` 新增端点

文件：`backend/src/main/java/com/aiclub/platform/controller/GitPilotCliController.java`

- 构造器追加注入 `PlatformStoreService`（与 `TaskController` 一致）。
- 新增 `GET /api/cli/tasks` 端点。

```java
/** 列出当前 CLI 用户负责的需求（workItemType=需求）。 */
@GetMapping("/tasks")
public ApiResponse<PageResponse<CliDtos.CliTaskSummary>> myTasks(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "50") int size,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) Long projectId,
        @RequestParam(required = false) String keyword) {
    AuthContext ctx = AuthContextHolder.get().orElseThrow();
    cliService.requireScope(ctx.token(), GitPilotCliService.SCOPE_TASK_READ);
    Long me = ctx.userId();
    return ApiResponse.success(
        platformStoreService.pageMyRequirementTasks(me, page, size, status, priority, projectId, keyword));
}
```

> 认证链路：`AuthInterceptor` 对 `/api/cli/*` + `gpt_` token 走 `authenticateCliToken`，已注入 `AuthContext`（含 `userId`、`token`），端点直接读取。

### 3.3 `GitPilotCliService` 新增 scope

文件：`backend/src/main/java/com/aiclub/platform/service/GitPilotCliService.java`

```java
public static final String SCOPE_TASK_READ = "cli:task:read";
```

并将其加入 `DEFAULT_TOKEN_SCOPES`（新签发的 `gpt_` token 默认携带）。

> 兼容性：已存在的旧 token 不含该 scope，用户需重新 `/login gitpilot` 重新签发。客户端在端点返回 scope 缺失错误时，应提示用户重新登录。

### 3.4 `CliDtos` 新增 `CliTaskSummary` record

文件：`backend/src/main/java/com/aiclub/platform/dto/cli/CliDtos.java`

```java
/**
 * CLI 需求列表项（精简版 TaskSummary）。
 * 去掉 prd*、collaborator*、external*、requirementTask* 等大/无关字段，
 * 仅保留命令展示与“设计+开发”指令构造所需信息。
 */
public record CliTaskSummary(
    Long id,
    String workItemCode,
    String name,
    String status,
    String priority,
    String assignee,
    String taskType,
    Long projectId,
    String projectName,
    Long iterationId,
    String iterationName,
    String planStartDate,
    String planEndDate,
    String requirementMarkdown
) {}
```

## 4. 客户端设计（gitpilot-cli · TypeScript）

### 4.1 API 客户端

文件：`gitpilot-cli/src/extensions/gitpilot/api.ts`

复用现有 `requestJson`，新增：

```ts
/** 查询参数（首版仅交互式使用，全部可空） */
export interface ListMyTasksParams {
    page?: number;
    size?: number;
    status?: string;
    priority?: string;
    projectId?: number;
    keyword?: string;
}

/** 列出当前 CLI 用户负责的需求（workItemType=需求） */
export async function listMyTasks(
    platformUrl: string,
    token: string,
    params: ListMyTasksParams = {}
): Promise<PageResponse<CliTaskSummary>> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.size) query.set("size", String(params.size));
    if (params.status) query.set("status", params.status);
    if (params.priority) query.set("priority", params.priority);
    if (params.projectId) query.set("projectId", String(params.projectId));
    if (params.keyword) query.set("keyword", params.keyword);
    const qs = query.toString();
    return requestJson<PageResponse<CliTaskSummary>>(
        platformUrl,
        `/api/cli/tasks${qs ? `?${qs}` : ""}`,
        { token }
    );
}
```

### 4.2 类型定义

在 `api.ts` 或新增 `types.ts`：

```ts
/** 平台分页响应（与后端 PageResponse<T> 对应） */
export interface PageResponse<T> {
    records: T[];
    total: number;
    page: number;
    size: number;
    totalPages: number;
}

/** CLI 需求列表项（与后端 CliDtos.CliTaskSummary 对应） */
export interface CliTaskSummary {
    id: number;
    workItemCode: string;
    name: string;
    status: string;
    priority: string;
    assignee: string;
    taskType: string;
    projectId: number | null;
    projectName: string | null;
    iterationId: number | null;
    iterationName: string | null;
    planStartDate: string | null;
    planEndDate: string | null;
    requirementMarkdown: string | null;
}
```

> 若 `api.ts` 已有 `PageResponse`/类似分页类型，则复用而非重复定义。

### 4.3 命令注册

**新文件**：`gitpilot-cli/src/extensions/gitpilot/commands/requirement-list.ts`

在 `gitpilot-cli/src/extensions/gitpilot/index.ts` 的 `gitpilotPlatformExtension(pi)` 内调用注册。

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCachedCliToken, loadCliToken } from "../credentials";
import { getPlatformUrl, requirePlatformUrl } from "../config";
import { listMyTasks, type CliTaskSummary, type PageResponse } from "../api";

/**
 * 注册 /requirement 命令：列出当前用户负责的需求，
 * 选中后构造“技术设计 + 开发”指令并触发 AI 推理。
 */
export function registerRequirementCommand(pi: ExtensionAPI): void {
    pi.registerCommand("requirement", {
        description: "列出负责人是我的需求，选中后进行技术设计与开发",
        handler: async (_args, ctx) => {
            // 1. 校验平台配置与登录态
            const platformUrl = getPlatformUrl();
            if (!platformUrl) {
                ctx.ui.notify("未配置平台地址，请先设置 GITPILOT_PLATFORM_URL 或运行 /login gitpilot", "warning");
                return;
            }
            const token = getCachedCliToken() ?? (await loadCliToken(platformUrl));
            if (!token) {
                ctx.ui.notify("未登录平台，请运行 /login gitpilot", "warning");
                return;
            }

            // 2. 拉取需求首页
            let page: PageResponse<CliTaskSummary>;
            try {
                page = await listMyTasks(platformUrl, token, { page: 1, size: 50 });
            } catch (err) {
                ctx.ui.notify(`拉取需求失败：${(err as Error).message}`, "error");
                return;
            }

            // 3. 空列表
            if (!page.records.length) {
                ctx.ui.notify("暂无负责人是你的需求", "info");
                return;
            }

            // 4. 选择器展示（label 编码 workItemCode 便于回查）
            const options = page.records.map(t =>
                `[${t.workItemCode}] ${t.name} · ${t.status} · ${t.priority ?? "-"} · ${t.projectName ?? "-"}`
            );
            const selected = await ctx.ui.select("选择要设计开发的需求", options);
            if (!selected) return; // 用户取消

            // 5. 回查选中项
            const idx = options.indexOf(selected);
            const task = page.records[idx];
            if (!task) return;

            // 6. 构造“技术设计 + 开发”指令 prompt
            const prompt = buildDesignDevPrompt(task);

            // 7. 触发 AI（idle 立即发，忙则排队）
            if (ctx.isIdle()) {
                pi.sendUserMessage(prompt);
            } else {
                pi.sendUserMessage(prompt, { deliverAs: "followUp" });
                ctx.ui.notify("已排队，当前任务结束后开始", "info");
            }
        },
    });
}

/** 构造“基于需求进行技术设计与开发”的指令 prompt */
function buildDesignDevPrompt(task: CliTaskSummary): string {
    const lines: string[] = [];
    lines.push("请基于以下需求完成技术设计与开发实现：");
    lines.push("");
    lines.push(`# [${task.workItemCode}] ${task.name}`);
    lines.push(`- 状态：${task.status} | 优先级：${task.priority ?? "-"}`);
    if (task.projectName) lines.push(`- 项目：${task.projectName}`);
    if (task.iterationName) lines.push(`- 迭代：${task.iterationName}`);
    if (task.planStartDate || task.planEndDate) {
        lines.push(`- 计划周期：${task.planStartDate ?? "?"} ~ ${task.planEndDate ?? "?"}`);
    }
    lines.push("");
    lines.push("## 需求描述");
    lines.push(task.requirementMarkdown?.trim()
        ? task.requirementMarkdown.trim()
        : "（无详细需求描述，请基于需求名称与项目上下文推断，必要时先与我对齐需求范围）");
    lines.push("");
    lines.push("请先给出技术设计方案（涉及模块、接口、数据结构、风险点），再进行开发实现。");
    return lines.join("\n");
}
```

> `pi.sendUserMessage` 是官方既定模式（参考 `examples/extensions/send-user-message.ts`），将消息作为用户消息注入会话并触发一轮推理。`ctx` / `ctx.ui` 上无此方法，必须用闭包捕获的 `pi`。

### 4.4 扩展入口接入

`gitpilot-cli/src/extensions/gitpilot/index.ts`：

```ts
export default function gitpilotPlatformExtension(pi: ExtensionAPI): void {
    const platformUrl = getPlatformUrl();
    if (platformUrl) void loadCliToken(platformUrl);
    platformModelExtension(pi);
    registerRequirementCommand(pi);   // 新增
}
```

## 5. 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 命令名 | `/requirement` | ASCII，符合 `settings`/`model`/`tree` 命名习惯，终端输入方便 |
| 项目可见性 | 绕过 | 语义是“负责人是自己的需求”，独立查询路径不叠加项目参与人过滤，避免漏看 |
| workItemType | 强制“需求” | 用户明确只要需求类型 |
| 查询路径 | 新增独立 `pageMyRequirementTasks` | 避免污染 Web 端 `pageTasks` 行为与签名 |
| 返回 DTO | 新增 `CliTaskSummary` | 精简字段，去掉 `prd*`/`collaborator*`/`external*` 等大/无关字段 |
| 选中后行为 | `pi.sendUserMessage(prompt)` 直接触发 | 用户明确“根据需求设计和开发”，非发送原内容 |
| 触发方式 | idle 立即发 / 忙时 `followUp` 排队 | 复用 `send-user-message.ts` 模式 |
| scope | `cli:task:read` | 与现有 `SCOPE_MODEL_READ` 模式一致 |
| 端点路径 | `/api/cli/tasks` | 与平台 task 实体命名一致，内部强制需求类型 |
| 分页 | 首页 size=50，不做翻页 UI | YAGNI，首版够用 |

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| 平台地址未配置 | `notify("未配置平台地址...")`，引导设置或 `/login gitpilot` |
| 未登录 / token 缺失 | `notify("未登录平台，请运行 /login gitpilot")` |
| token scope 缺失（旧 token） | 后端返回 403/scope 错误 -> 客户端 `notify("权限不足，请重新 /login gitpilot")` |
| 空列表 | `notify("暂无负责人是你的需求")` |
| 网络错误 / 接口异常 | `notify("拉取需求失败：{message}", "error")` |
| 用户取消选择 | 不发送任何消息 |

## 7. 测试与验证

### 7.1 后端 JUnit
- `PlatformStoreServiceTest`（或 `GitPilotCliControllerTest`）：
  - `pageMyRequirementTasks` 只返回 `assigneeUser=userId` 且 `workItemType=需求` 的记录（构造需求+任务+他人需求，断言只命中自己的需求）。
  - 不叠加项目可见性：CLI 用户非项目参与人但作为负责人，仍可查到。
  - `status`/`priority`/`projectId`/`keyword` 过滤正确。
- `GitPilotCliController` 的 `/api/cli/tasks`：
  - `gpt_` token 认证通过，返回 `PageResponse<CliTaskSummary>`。
  - scope 缺失时返回 403。

### 7.2 客户端
- `cd gitpilot-cli && npm run build`（类型检查通过）。
- 手动验证：源码模式启动，`/login gitpilot` 登录后 `/requirement` 展示列表，选中后 AI 进入设计开发工作流。

### 7.3 端到端
- 源码模式串起 `backend` + `gitpilot-cli`，用真实 `gpt_` token 验证完整链路。

## 8. 文档更新

- 本文档：`docs/design-docs/gitpilot-cli-requirement-command-technical-design-v1.md`。
- `docs/architecture.md`：在 GitPilot CLI 章节补充“CLI 扩展命令能力（/requirement）”与 `/api/cli/tasks` 端点。

## 9. 风险与开放问题

| 风险/问题 | 影响 | 缓解 |
|---|---|---|
| 旧 `gpt_` token 无 `cli:task:read` scope | 老用户首次 `/requirement` 失败 | 客户端识别 scope 错误并提示重新 `/login gitpilot` |
| 绕过项目可见性可能让 CLI 看到非参与项目的需求 | 信息泄露面扩大 | 限定为“负责人=自己”，仅能看到分配给自己的需求，风险可控 |
| `requirementMarkdown` 为空的需求 | AI 缺乏设计依据 | prompt 里提示“基于名称与上下文推断，必要时先对齐” |
| 分页仅首页 50 条 | 超出 50 条的需求看不到 | 首版可接受，后续加翻页或关键字搜索 |
| `ctx.ui.select` 仅支持 `string[]`，无法展示 description | 列表信息密度有限 | label 内拼接关键字段（编号/名称/状态/优先级/项目）弥补 |
