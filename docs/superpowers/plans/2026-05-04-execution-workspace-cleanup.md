# Execution Workspace Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为执行中心所有返回 `workspaceRoot` 的异步执行链路补齐“终态后保留 24 小时并自动删除本地工作区”的闭环，并把删除提示只展示在执行详情与结果通知中。

**Architecture:** 后端新增独立的工作区清理记录表和调度服务，负责登记 `workspaceRoot`、在 run 终态时排期、到期后调用 `code-processing` 删除目录并沉淀删除结果。`code-processing` 新增安全删除接口，前端只消费任务级清理摘要，在执行详情页显示保留期/删除状态提示；结果通知继续复用现有消息中心，仅补充正文文案。

**Tech Stack:** Spring Boot、Spring Data JPA、Flyway、JUnit 5、Mockito、FastAPI、Pydantic、pytest、Vue 3、TypeScript、Element Plus

---

### Task 1: 建立 backend 工作区清理持久化底座

**Files:**
- Create: `backend/src/main/resources/db/migration/V58__execution_workspace_cleanup.sql`
- Create: `backend/src/main/java/com/aiclub/platform/domain/model/ExecutionWorkspaceCleanupEntity.java`
- Create: `backend/src/main/java/com/aiclub/platform/repository/ExecutionWorkspaceCleanupRepository.java`
- Create: `backend/src/main/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupServiceTests.java`

- [ ] **Step 1: 写出 backend 工作区登记与排期的失败测试**

```java
@Test
void shouldRegisterWorkspaceRootOncePerRun() {
    ExecutionWorkspaceCleanupEntity first = workspaceCleanupService.registerWorkspace(
            99L, 301L, 401L, "session-1", "C:/workspace/task-99/run-301/repo-demo"
    );
    ExecutionWorkspaceCleanupEntity second = workspaceCleanupService.registerWorkspace(
            99L, 301L, 402L, "session-2", "C:/workspace/task-99/run-301/repo-demo"
    );

    assertThat(second.getId()).isEqualTo(first.getId());
    assertThat(repository.findAll()).hasSize(1);
}

@Test
void shouldScheduleActiveWorkspacesAfterRunFinishes() {
    workspaceCleanupService.registerWorkspace(99L, 301L, 401L, "session-1", "C:/workspace/a");

    workspaceCleanupService.scheduleCleanupForRun(301L, "SUCCESS", LocalDateTime.of(2026, 5, 4, 10, 0));

    ExecutionWorkspaceCleanupEntity entity = repository.findAll().get(0);
    assertThat(entity.getStatus()).isEqualTo("SCHEDULED");
    assertThat(entity.getExecutionResultStatus()).isEqualTo("SUCCESS");
    assertThat(entity.getExpiresAt()).isEqualTo(LocalDateTime.of(2026, 5, 5, 10, 0));
}
```

- [ ] **Step 2: 运行定向测试确认先失败**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionWorkspaceCleanupServiceTests test`
Expected: FAIL，提示缺少 `ExecutionWorkspaceCleanupServiceTests`、实体、仓储或排期逻辑

- [ ] **Step 3: 写最小迁移脚本、实体、仓储与服务实现**

```sql
CREATE TABLE IF NOT EXISTS execution_workspace_cleanup (
    id BIGSERIAL PRIMARY KEY,
    execution_task_id BIGINT NOT NULL,
    execution_run_id BIGINT NOT NULL,
    execution_step_id BIGINT,
    runner_session_id VARCHAR(120),
    workspace_root TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    execution_result_status VARCHAR(20),
    retention_hours INTEGER NOT NULL DEFAULT 24,
    scheduled_at TIMESTAMP,
    expires_at TIMESTAMP,
    deleted_at TIMESTAMP,
    delete_failed_at TIMESTAMP,
    delete_error_message TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_execution_workspace_cleanup_run_root UNIQUE (execution_run_id, workspace_root)
);

CREATE INDEX IF NOT EXISTS idx_execution_workspace_cleanup_run_status
    ON execution_workspace_cleanup(execution_run_id, status);

CREATE INDEX IF NOT EXISTS idx_execution_workspace_cleanup_status_expires_at
    ON execution_workspace_cleanup(status, expires_at);
```

```java
@Entity
@Table(name = "execution_workspace_cleanup")
public class ExecutionWorkspaceCleanupEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "execution_task_id", nullable = false)
    private Long executionTaskId;

    @Column(name = "execution_run_id", nullable = false)
    private Long executionRunId;

    @Column(name = "execution_step_id")
    private Long executionStepId;

    @Column(name = "runner_session_id", length = 120)
    private String runnerSessionId;

    @Column(name = "workspace_root", nullable = false, columnDefinition = "TEXT")
    private String workspaceRoot = "";

    @Column(nullable = false, length = 20)
    private String status = "ACTIVE";

    @Column(name = "execution_result_status", length = 20)
    private String executionResultStatus;

    @Column(name = "retention_hours", nullable = false)
    private Integer retentionHours = 24;

    @Column(name = "scheduled_at")
    private LocalDateTime scheduledAt;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "delete_failed_at")
    private LocalDateTime deleteFailedAt;

    @Column(name = "delete_error_message", columnDefinition = "TEXT")
    private String deleteErrorMessage;
}
```

```java
public ExecutionWorkspaceCleanupEntity registerWorkspace(Long taskId,
                                                         Long runId,
                                                         Long stepId,
                                                         String sessionId,
                                                         String workspaceRoot) {
    return repository.findByExecutionRunIdAndWorkspaceRoot(runId, workspaceRoot)
            .map(existing -> touchExistingWorkspace(existing, stepId, sessionId))
            .orElseGet(() -> repository.save(buildActiveRecord(taskId, runId, stepId, sessionId, workspaceRoot)));
}

public int scheduleCleanupForRun(Long runId, String resultStatus, LocalDateTime scheduledAt) {
    List<ExecutionWorkspaceCleanupEntity> records = repository.findAllByExecutionRunIdAndStatus(runId, "ACTIVE");
    for (ExecutionWorkspaceCleanupEntity record : records) {
        record.setStatus("SCHEDULED");
        record.setExecutionResultStatus(normalizeResultStatus(resultStatus));
        record.setScheduledAt(scheduledAt);
        record.setExpiresAt(scheduledAt.plusHours(record.getRetentionHours()));
        record.setDeleteErrorMessage(null);
    }
    repository.saveAll(records);
    return records.size();
}
```

- [ ] **Step 4: 运行定向测试确认转绿**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionWorkspaceCleanupServiceTests test`
Expected: PASS

- [ ] **Step 5: 提交这一阶段**

```bash
git add backend/src/main/resources/db/migration/V58__execution_workspace_cleanup.sql backend/src/main/java/com/aiclub/platform/domain/model/ExecutionWorkspaceCleanupEntity.java backend/src/main/java/com/aiclub/platform/repository/ExecutionWorkspaceCleanupRepository.java backend/src/main/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupService.java backend/src/test/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupServiceTests.java
git commit -m "feat: add execution workspace cleanup persistence"
```

### Task 2: 接入异步 Runner 工作区登记与终态排期

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionAsyncSessionService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionDispatchService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/DevelopmentExecutionService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/TestAutomationExecutionService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionDispatchServiceTests.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/DevelopmentExecutionServiceTests.java`

- [ ] **Step 1: 写出绑定 `workspaceRoot` 与终态排期的失败测试**

```java
@Test
void shouldScheduleWorkspaceCleanupWhenExecutionSucceeds() {
    executionDispatchService.finishSuccess(executionTask, executionRun, new ArrayList<>());

    verify(workspaceCleanupService).scheduleCleanupForRun(eq(301L), eq("SUCCESS"), any(LocalDateTime.class));
}

@Test
void shouldBindWorkspaceRootWhenAsyncImplementationStarts() {
    when(agentExecutionService.startAsyncExecution(...))
            .thenReturn(new AgentExecutionService.AsyncExecutionStartResult(
                    "session-implement", true, "CLI", "C:/workspace/task-99/run-301/repo-demo", "2026-04-18T12:00:00Z"
            ));

    developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan);

    verify(executionAsyncSessionService).bindRunnerSession(
            any(), any(), any(), eq("session-implement"), eq("CLI"), eq("C:/workspace/task-99/run-301/repo-demo")
    );
}
```

- [ ] **Step 2: 运行定向测试确认先失败**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionDispatchServiceTests,DevelopmentExecutionServiceTests test`
Expected: FAIL，提示 `bindRunnerSession` 签名缺少 `workspaceRoot` 或终态未调度清理服务

- [ ] **Step 3: 修改 session 绑定签名，并在各调用方传入 `workspaceRoot`**

```java
public void bindRunnerSession(ExecutionTaskEntity task,
                              ExecutionRunEntity run,
                              ExecutionStepEntity step,
                              String sessionId,
                              String runnerType,
                              String workspaceRoot) {
    step.setRunnerSessionId(sessionId);
    step.setRunnerType(defaultString(runnerType));
    step.setHasLiveStream(true);
    step.setLastHeartbeatAt(LocalDateTime.now());
    executionStepRepository.save(step);
    if (hasText(workspaceRoot)) {
        executionWorkspaceCleanupService.registerWorkspace(
                task.getId(),
                run.getId(),
                step.getId(),
                sessionId,
                workspaceRoot.trim()
        );
    }
    executionEventService.recordSummary(task, run, step, "已提交到 " + defaultString(runnerType).trim() + " runner");
}
```

```java
executionAsyncSessionService.bindRunnerSession(
        latestTask,
        executionRun,
        stepEntity,
        startResult.sessionId(),
        startResult.runnerType(),
        startResult.workspaceRoot()
);
```

- [ ] **Step 4: 在四个终态收口方法里统一排期**

```java
workspaceCleanupService.scheduleCleanupForRun(
        executionRun.getId(),
        RESULT_STATUS_SUCCESS,
        LocalDateTime.now()
);
```

对 `finishFailed(...)`、`finishInfrastructureFailure(...)`、`finishCanceled(...)` 分别传入 `FAILED`、`FAILED`、`CANCELED`。

- [ ] **Step 5: 运行定向测试确认转绿**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionDispatchServiceTests,DevelopmentExecutionServiceTests test`
Expected: PASS

- [ ] **Step 6: 提交这一阶段**

```bash
git add backend/src/main/java/com/aiclub/platform/service/ExecutionAsyncSessionService.java backend/src/main/java/com/aiclub/platform/service/ExecutionDispatchService.java backend/src/main/java/com/aiclub/platform/service/DevelopmentExecutionService.java backend/src/main/java/com/aiclub/platform/service/TestAutomationExecutionService.java backend/src/test/java/com/aiclub/platform/service/ExecutionDispatchServiceTests.java backend/src/test/java/com/aiclub/platform/service/DevelopmentExecutionServiceTests.java
git commit -m "feat: register execution workspaces for async runners"
```

### Task 3: 实现 backend 到期清理调度与 `code-processing` 删除客户端

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupClientService.java`
- Create: `backend/src/main/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupScheduler.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupSchedulerTests.java`

- [ ] **Step 1: 写出到期删除成功与失败的失败测试**

```java
@Test
void shouldMarkWorkspaceDeletedWhenCleanupEndpointSucceeds() {
    ExecutionWorkspaceCleanupEntity record = scheduledRecord("C:/workspace/task-99/run-301/repo-demo");
    when(clientService.cleanupWorkspace("C:/workspace/task-99/run-301/repo-demo")).thenReturn();

    scheduler.cleanupExpiredExecutionWorkspaces();

    assertThat(record.getStatus()).isEqualTo("DELETED");
    assertThat(record.getDeletedAt()).isNotNull();
}

@Test
void shouldMarkWorkspaceDeleteFailedWithoutRetryWhenCleanupEndpointFails() {
    ExecutionWorkspaceCleanupEntity record = scheduledRecord("C:/workspace/task-99/run-301/repo-demo");
    doThrow(new IllegalStateException("目录被占用")).when(clientService).cleanupWorkspace(anyString());

    scheduler.cleanupExpiredExecutionWorkspaces();

    assertThat(record.getStatus()).isEqualTo("DELETE_FAILED");
    assertThat(record.getDeleteErrorMessage()).contains("目录被占用");
}
```

- [ ] **Step 2: 运行定向测试确认先失败**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionWorkspaceCleanupSchedulerTests test`
Expected: FAIL，提示缺少调度器或删除客户端

- [ ] **Step 3: 写最小客户端和调度器实现**

```java
public void cleanupWorkspace(String workspaceRoot) {
    Map<String, Object> payload = Map.of("workspaceRoot", workspaceRoot);
    post("/api/execution-workspaces/cleanup", payload, Void.class, 30);
}
```

```java
@Scheduled(fixedDelay = 300000L)
public void cleanupExpiredExecutionWorkspaces() {
    List<ExecutionWorkspaceCleanupEntity> expired = workspaceCleanupService.findExpiredScheduledWorkspaces(LocalDateTime.now(), 20);
    for (ExecutionWorkspaceCleanupEntity record : expired) {
        try {
            cleanupClientService.cleanupWorkspace(record.getWorkspaceRoot());
            workspaceCleanupService.markDeleted(record.getId(), LocalDateTime.now());
        } catch (RuntimeException exception) {
            workspaceCleanupService.markDeleteFailed(record.getId(), LocalDateTime.now(), exception.getMessage());
        }
    }
}
```

- [ ] **Step 4: 运行定向测试确认转绿**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionWorkspaceCleanupSchedulerTests test`
Expected: PASS

- [ ] **Step 5: 提交这一阶段**

```bash
git add backend/src/main/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupClientService.java backend/src/main/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupScheduler.java backend/src/test/java/com/aiclub/platform/service/ExecutionWorkspaceCleanupSchedulerTests.java
git commit -m "feat: add execution workspace cleanup scheduler"
```

### Task 4: 新增 `code-processing` 安全删除接口

**Files:**
- Modify: `code-processing/app/models.py`
- Modify: `code-processing/app/api/routes.py`
- Create: `code-processing/tests/test_execution_workspace_cleanup.py`

- [ ] **Step 1: 写出 `code-processing` 目录删除接口的失败测试**

```python
def test_should_delete_execution_workspace_within_allowed_root():
    request = ExecutionWorkspaceCleanupRequest(workspaceRoot=str(workspace_dir))
    cleanup_execution_workspace(request)
    assert not workspace_dir.exists()

def test_should_reject_workspace_outside_execution_root():
    request = ExecutionWorkspaceCleanupRequest(workspaceRoot="C:/other-root/demo")
    with pytest.raises(ValueError, match="不允许删除执行工作区根目录之外的路径"):
        cleanup_execution_workspace(request)
```

- [ ] **Step 2: 运行定向测试确认先失败**

Run: `cd code-processing && python -m pytest tests/test_execution_workspace_cleanup.py -q`
Expected: FAIL，提示缺少请求模型、服务函数或路由实现

- [ ] **Step 3: 添加请求模型、服务函数与路由**

```python
class ExecutionWorkspaceCleanupRequest(BaseModel):
    workspaceRoot: str

    @field_validator("workspaceRoot", mode="before")
    @classmethod
    def normalize_workspace_root(cls, value: Any) -> str:
        return "" if value is None else str(value).strip()
```

```python
def cleanup_execution_workspace(request: ExecutionWorkspaceCleanupRequest) -> None:
    target_dir = Path(request.workspaceRoot).expanduser().resolve()
    execution_root = Path(settings.execution_workspace_root).resolve()
    if not request.workspaceRoot:
        raise ValueError("执行工作区路径不能为空")
    if not target_dir.is_absolute():
        raise ValueError("执行工作区路径必须是绝对路径")
    if target_dir == execution_root or execution_root not in target_dir.parents:
        raise ValueError("不允许删除执行工作区根目录之外的路径")
    _remove_directory_with_retry(target_dir, None, f"execution-workspace:{target_dir.name}")
```

```python
@router.post("/execution-workspaces/cleanup")
def cleanup_execution_workspace_endpoint(request_http: Request,
                                         payload: ExecutionWorkspaceCleanupRequest) -> dict[str, str]:
    _require_internal_service_auth(request_http)
    cleanup_execution_workspace(payload)
    return {"status": "deleted"}
```

- [ ] **Step 4: 运行定向测试确认转绿**

Run: `cd code-processing && python -m pytest tests/test_execution_workspace_cleanup.py -q`
Expected: PASS

- [ ] **Step 5: 提交这一阶段**

```bash
git add code-processing/app/models.py code-processing/app/api/routes.py code-processing/tests/test_execution_workspace_cleanup.py
git commit -m "feat: add execution workspace cleanup endpoint"
```

### Task 5: 暴露执行详情清理摘要并补充结果通知文案

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/dto/ExecutionTaskDetail.java`
- Create: `backend/src/main/java/com/aiclub/platform/dto/ExecutionWorkspaceCleanupSummary.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionTaskService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionDispatchService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionTaskServiceTests.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionDispatchServiceTests.java`

- [ ] **Step 1: 写出详情摘要与通知文案的失败测试**

```java
@Test
void shouldIncludeWorkspaceCleanupSummaryInTaskDetail() {
    when(workspaceCleanupService.buildTaskSummary(99L)).thenReturn(
            new ExecutionWorkspaceCleanupSummary(true, 24, "SCHEDULED", "SUCCESS",
                    "2026-05-05 10:00:00", null, null, null, 2,
                    "本次执行产生的本地工作区将在 24 小时后自动删除；如需走 MR，请在保留期内完成处理。")
    );

    ExecutionTaskDetail detail = executionTaskService.getExecutionTask(99L);

    assertThat(detail.workspaceCleanup()).isNotNull();
    assertThat(detail.workspaceCleanup().status()).isEqualTo("SCHEDULED");
}

@Test
void shouldAppendWorkspaceRetentionNoticeToDevelopmentSuccessNotification() {
    executionDispatchService.finishSuccess(executionTask, executionRun, new ArrayList<>());

    verify(notificationService).sendToUser(
            eq(77L),
            eq(NotificationService.TYPE_TASK),
            eq(NotificationService.LEVEL_SUCCESS),
            eq("开发执行已完成：开发执行任务"),
            contains("本地工作区将在 24 小时后自动删除；如需走 MR，请在保留期内完成处理。"),
            eq("/tasks/99"),
            eq("DEVELOPMENT_EXECUTION_COMPLETED"),
            eq(99L)
    );
}
```

- [ ] **Step 2: 运行定向测试确认先失败**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionTaskServiceTests,ExecutionDispatchServiceTests test`
Expected: FAIL，提示 DTO 缺少 `workspaceCleanup` 或通知正文未追加保留期文案

- [ ] **Step 3: 添加 DTO、详情组装和通知文案实现**

```java
public record ExecutionWorkspaceCleanupSummary(
        boolean enabled,
        Integer retentionHours,
        String status,
        String executionResultStatus,
        String expiresAt,
        String deletedAt,
        String deleteFailedAt,
        String deleteErrorMessage,
        Integer trackedWorkspaceCount,
        String message
) {
}
```

```java
return new ExecutionTaskDetail(
        executionTask.getId(),
        executionTask.getTitle(),
        ...
        planConfirmationPending && canCurrentUserConfirmPlan(executionTask),
        runs,
        executionWorkspaceCleanupService.buildTaskSummary(executionTask.getId())
);
```

```java
content.append("本地工作区将在 24 小时后自动删除；如需走 MR，请在保留期内完成处理。");
```

对于 `FAILED/CANCELED`，使用：

```java
content.append("本地工作区将在 24 小时后自动删除；如需保留代码或继续处理，请在保留期内完成。");
```

- [ ] **Step 4: 运行定向测试确认转绿**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionTaskServiceTests,ExecutionDispatchServiceTests test`
Expected: PASS

- [ ] **Step 5: 提交这一阶段**

```bash
git add backend/src/main/java/com/aiclub/platform/dto/ExecutionTaskDetail.java backend/src/main/java/com/aiclub/platform/dto/ExecutionWorkspaceCleanupSummary.java backend/src/main/java/com/aiclub/platform/service/ExecutionTaskService.java backend/src/main/java/com/aiclub/platform/service/ExecutionDispatchService.java backend/src/test/java/com/aiclub/platform/service/ExecutionTaskServiceTests.java backend/src/test/java/com/aiclub/platform/service/ExecutionDispatchServiceTests.java
git commit -m "feat: expose execution workspace cleanup summary"
```

### Task 6: 在执行详情页展示保留期提示并完成全量验证

**Files:**
- Modify: `frontend/src/types/platform.ts`
- Modify: `frontend/src/views/ExecutionTaskDetailView.vue`
- Test: `scripts/check_encoding.py`

- [ ] **Step 1: 先改前端类型并写出最小展示逻辑**

```ts
export interface ExecutionWorkspaceCleanupSummaryItem {
  enabled: boolean
  retentionHours: number
  status: 'NONE' | 'ACTIVE' | 'SCHEDULED' | 'DELETED' | 'DELETE_FAILED'
  executionResultStatus: string | null
  expiresAt: string | null
  deletedAt: string | null
  deleteFailedAt: string | null
  deleteErrorMessage: string | null
  trackedWorkspaceCount: number
  message: string
}
```

```ts
const workspaceCleanupAlertType = computed(() => {
  const status = taskDetail.value?.workspaceCleanup?.status
  if (status === 'DELETE_FAILED') return 'error'
  if (status === 'DELETED') return 'success'
  return 'warning'
})
```

```vue
<el-alert
  v-if="taskDetail?.workspaceCleanup?.enabled"
  class="execution-run-alert"
  :type="workspaceCleanupAlertType"
  :closable="false"
  show-icon
  :title="taskDetail.workspaceCleanup.message"
/>
```

- [ ] **Step 2: 运行前端构建确认类型与模板先失败或提示缺口**

Run: `cd frontend && npm run build`
Expected: 若字段未接通 backend 类型会先报类型错误；补齐实现后应转绿

- [ ] **Step 3: 补齐脚本自检与最终验证**

Run: `python scripts/check_encoding.py`
Expected: PASS

Run: `cd backend && mvn -s maven-settings-central.xml test`
Expected: PASS

Run: `cd code-processing && python -m pytest`
Expected: PASS

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 提交最终集成结果**

```bash
git add frontend/src/types/platform.ts frontend/src/views/ExecutionTaskDetailView.vue
git commit -m "feat: show execution workspace cleanup notice"
```

- [ ] **Step 5: 收尾复查**

```bash
git status --short
```

Expected: 工作区干净，或只剩明确可解释的非本任务改动

## Self-Review

- 规格覆盖检查：
  - 独立清理表、24 小时排期、到期删除、失败保留目录、详情提示、结果通知文案、MR 不影响删除时点，均已对应到 Task 1-6。
  - `code-processing` 安全删除边界校验对应 Task 4。
  - 详情页只展示、不扩散到列表页，对应 Task 5-6。
- 占位词检查：
  - 计划中没有 `TODO`、`TBD`、`later`、`适当处理` 之类占位表述。
- 类型一致性检查：
  - 统一使用 `ExecutionWorkspaceCleanupSummary` / `ExecutionWorkspaceCleanupSummaryItem`
  - 统一状态值为 `ACTIVE`、`SCHEDULED`、`DELETED`、`DELETE_FAILED`
  - 统一删除接口路径为 `/api/execution-workspaces/cleanup`
