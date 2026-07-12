# Requirement AI Context Async Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将需求 AI 的附件、图片和关联工作项上下文接入执行中心异步场景，同时保持管理端和公众端现有结果编辑、创建与回写交互。

**Architecture:** 新增内置执行场景 `REQUIREMENT_AI_ANALYSIS`，由 `CONTEXT_PREPARE`、`VISION_ANALYZE`、`REQUIREMENT_GENERATE` 三个固定步骤生成不可变执行产物。需求 AI 弹窗提交后订阅执行中心状态，完成时读取兼容 `TaskRequirementAiResult` 的结果产物；用户确认后的业务回写通过幂等应用服务完成并记录审计。

**Tech Stack:** Spring Boot、Spring Data JPA、Flyway、RabbitMQ 执行队列、JDK HttpClient、JUnit 5/Mockito、Vue 3/Element Plus、React/Vite/Tailwind、FastAPI/FastMCP。

---

## File structure

- `backend/.../service/RequirementAiContextService.java`：只负责从任务快照、附件和关联工作项构造一次性上下文。
- `backend/.../service/RequirementAiExecutionService.java`：执行中心三步专用执行器和产物落库。
- `backend/.../service/RequirementAiExecutionQueryService.java`：最新任务、历史任务和结果产物查询。
- `backend/.../service/RequirementAiResultApplicationService.java`：幂等回写、冲突检测和应用记录。
- `backend/.../service/RequirementAiCreditSettlementService.java`：公众端异步扣费和失败退款。
- `backend/.../dto/RequirementAiExecutionSummary.java`：弹窗恢复所需状态。
- `backend/.../dto/request/RequirementAiResultApplyRequest.java`：统一结果应用协议。
- `backend/.../domain/model/RequirementAiResultApplicationEntity.java`：回写审计记录。
- `backend/.../repository/RequirementAiResultApplicationRepository.java`：按执行任务和幂等键查询应用记录。
- `frontend/src/components/RequirementAiDialog.vue`：管理端后台运行状态、恢复、历史结果和原有编辑区。
- `frontend-public/src/pages/planning/RequirementAiDialog.tsx`：公众端同等后台运行体验，不暴露模型选择。

### Task 1: Register the execution-center scenario

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionWorkflowService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionTaskService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionWorkflowServiceTests.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionTaskServiceTests.java`

- [ ] Add failing tests asserting `REQUIREMENT_AI_ANALYSIS` produces exactly `CONTEXT_PREPARE`, `VISION_ANALYZE`, `REQUIREMENT_GENERATE`, uses the internal execution engine, and is accepted by the internal task-creation entry.
- [ ] Run `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionWorkflowServiceTests,ExecutionTaskServiceTests test` and confirm failures mention the unsupported scenario.
- [ ] Add constants and templates:

```java
public static final String SCENARIO_REQUIREMENT_AI_ANALYSIS = "REQUIREMENT_AI_ANALYSIS";
public static final String STEP_CONTEXT_PREPARE = "CONTEXT_PREPARE";
public static final String STEP_VISION_ANALYZE = "VISION_ANALYZE";
public static final String STEP_REQUIREMENT_GENERATE = "REQUIREMENT_GENERATE";
```

- [ ] Make `scenarioName`, `buildTemplates`, `usesInternalExecutionEngine`, restore logic and task-entry validation recognize the new scenario without adding it to managed orchestration.
- [ ] Re-run the focused tests and commit `feat: register requirement ai execution scenario`.

### Task 2: Add provider-specific multimodal requests

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/ModelConfigService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ModelConfigServiceIntegrationTests.java`

- [ ] Add failing HTTP-server tests for OpenAI Responses (`input_text`/`input_image`), Chat Completions (`text`/`image_url`), Anthropic (`text`/`image` base64), usage parsing, Responses 404 fallback and Responses 400 no-fallback.
- [ ] Run the focused test and confirm the missing `invokeVisionPromptWithUsage` API is the failure reason.
- [ ] Add the normalized request types:

```java
public record VisionImage(int index, String mediaType, String base64Data, String sourceName) {}

public ModelInvocation invokeVisionPromptWithUsage(
        ResolvedModelConfig config,
        String systemPrompt,
        String textPrompt,
        List<VisionImage> images,
        Integer maxTokens) {
    // provider/mode dispatch only; each payload builder remains independent.
}
```

- [ ] Reuse existing response and usage parsers; never log base64 content.
- [ ] Re-run the focused tests and commit `feat: support multimodal model requests`.

### Task 3: Add the image-understanding Agent path

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/AgentExecutionService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/repository/AgentRepository.java`
- Modify: `backend/src/main/java/com/aiclub/platform/agentusage/AgentType.java`
- Modify: `frontend/src/api/platform.ts`
- Modify: `frontend/src/views/AgentView.vue`
- Create: `backend/src/main/resources/db/migration/V118__requirement_ai_vision_agent.sql`
- Test: `backend/src/test/java/com/aiclub/platform/service/AgentExecutionServiceTests.java`

- [ ] Add failing tests for resolving `builtinCode=IMAGE_UNDERSTANDING`, rejecting disabled/wrong-access agents, batching normalized images, and recording `IMAGE_UNDERSTANDING` usage.
- [ ] Run the focused test and verify RED.
- [ ] Add `ACCESS_LLM_VISION`, `BUILTIN_IMAGE_UNDERSTANDING`, `resolveImageUnderstandingAgent()` and `runVisionAgent(...)`; require an enabled CHAT model and call `ModelConfigService.invokeVisionPromptWithUsage`.
- [ ] Seed a disabled global Agent with empty model binding, update management types/form fields, run tests plus `cd frontend && npm run build`, then commit `feat: add image understanding agent`.

### Task 4: Build reusable requirement context once

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/service/RequirementAiContextService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/TaskRequirementAiService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/WorkItemLinkService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/TaskRequirementAiServiceTests.java`
- Create: `backend/src/test/java/com/aiclub/platform/service/RequirementAiContextServiceTests.java`

- [ ] Add failing tests for five-attachment limit, 8000-character attachment limit, eight platform-image references, ten related work items, aggregate warnings and test-case fallback reusing the same context object.
- [ ] Run both tests and verify RED.
- [ ] Introduce:

```java
public record RequirementAiPreparedContext(
        String markdown,
        List<RequirementAiImageRef> images,
        Map<String, Object> stats,
        List<String> warnings) {}

public RequirementAiPreparedContext prepare(RequirementAiTaskSnapshot snapshot) { }
```

- [ ] Read task-bound attachments through a work-item-scoped loader, parse only platform asset URLs, and keep arbitrary external URLs as text.
- [ ] Refactor `TaskRequirementAiService` so prompt invocation and result parsing accept prebuilt context; re-run tests and commit `refactor: extract requirement ai context preparation`.

### Task 5: Execute the three-step workflow and persist artifacts

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/service/RequirementAiExecutionService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionDispatchService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/RequirementAiExecutionServiceTests.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionDispatchServiceTests.java`

- [ ] Add failing tests covering step order, `VISION_ANALYZE=SKIPPED`, two image batches, partial warnings, immutable artifacts, cancellation, main-model failure and final summary.
- [ ] Verify RED with the two focused test classes.
- [ ] Implement the executor following `TechnicalDesignExecutionService` event/artifact conventions. Persist artifact types `REQUIREMENT_CONTEXT`, `IMAGE_ANALYSIS`, `REQUIREMENT_AI_RESULT`; serialize the final DTO as JSON and save Markdown separately when useful.
- [ ] Dispatch `SCENARIO_REQUIREMENT_AI_ANALYSIS` to the new service, preserve partial artifacts on failure, update scenario notification names, re-run tests and commit `feat: execute requirement ai analysis workflow`.

### Task 6: Create, restore and query requirement-AI executions

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/service/RequirementAiExecutionQueryService.java`
- Create: `backend/src/main/java/com/aiclub/platform/dto/RequirementAiExecutionSummary.java`
- Modify: `backend/src/main/java/com/aiclub/platform/controller/TaskController.java`
- Modify: `backend/src/main/java/com/aiclub/platform/controller/PublicRequirementAiController.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionTaskService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/ExecutionTaskServiceTests.java`
- Create: `backend/src/test/java/com/aiclub/platform/service/RequirementAiExecutionQueryServiceTests.java`

- [ ] Add failing tests for management model selection, public model rejection, resolved model snapshot, latest/history filtering and deserializing `REQUIREMENT_AI_RESULT`.
- [ ] Verify RED.
- [ ] Change POST responses to `ExecutionTaskSummary`; add `/requirement-ai-executions/latest`, `/requirement-ai-executions`, and `/execution-tasks/{id}/requirement-ai-result` endpoints for both surfaces.
- [ ] Ensure only the currently submitted action is de-duplicated while an equivalent execution is pending/running; re-run tests and commit `feat: expose requirement ai execution APIs`.

### Task 7: Settle public credits asynchronously

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/service/RequirementAiCreditSettlementService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/controller/PublicRequirementAiController.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionDispatchService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/RequirementAiCreditSettlementServiceTests.java`

- [ ] Add failing tests for charge-before-create, refund on final failure/cancel-before-run, no refund for completed partial context, and idempotent terminal callbacks.
- [ ] Verify RED.
- [ ] Follow `TechnicalDesignCreditSettlementService` patterns, store the transaction/business key in task input/source metadata, call settlement from dispatch finalization, re-run tests and commit `feat: settle requirement ai credits asynchronously`.

### Task 8: Add idempotent edit/writeback auditing

**Files:**
- Create: `backend/src/main/resources/db/migration/V119__requirement_ai_result_application.sql`
- Create: `backend/src/main/java/com/aiclub/platform/domain/model/RequirementAiResultApplicationEntity.java`
- Create: `backend/src/main/java/com/aiclub/platform/repository/RequirementAiResultApplicationRepository.java`
- Create: `backend/src/main/java/com/aiclub/platform/dto/request/RequirementAiResultApplyRequest.java`
- Create: `backend/src/main/java/com/aiclub/platform/service/RequirementAiResultApplicationService.java`
- Create: `backend/src/main/java/com/aiclub/platform/controller/RequirementAiResultApplicationController.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/RequirementAiResultApplicationServiceTests.java`

- [ ] Add failing tests for `REPLACE_DESCRIPTION`, `APPEND_DESCRIPTION`, `POST_COMMENT`, batch child creation, test-case import, duplicate `clientRequestId`, stale `expectedTaskUpdatedAt`, and explicit force overwrite.
- [ ] Verify RED.
- [ ] Implement the application service by calling existing domain services; persist edited payload snapshot and target IDs, never mutate the original execution artifact.
- [ ] Re-run tests and commit `feat: apply requirement ai results with audit`.

### Task 9: Preserve the management UI while adding background execution

**Files:**
- Modify: `frontend/src/api/platform.ts`
- Modify: `frontend/src/types/platform.ts`
- Modify: `frontend/src/components/RequirementAiDialog.vue`
- Modify: `frontend/src/views/ExecutionTaskDetailView.vue`
- Create: `frontend/tests/requirementAiAsync.test.mjs`

- [ ] Add failing source-contract tests for the `IDLE/SUBMITTING/RUNNING/COMPLETED/FAILED` state transitions, latest/history/result API calls and preservation of the existing edit/apply labels.
- [ ] Run `cd frontend && node --test tests/requirementAiAsync.test.mjs` and verify RED.
- [ ] Keep the current result editor and buttons; replace the long POST wait with execution creation, subscribe/poll using existing execution APIs, restore the latest run on open, load history and show “查看执行详情”.
- [ ] Warn before closing edited-but-unapplied drafts; show stale-task conflict before replacement; run `npm run build` and commit `feat: add background requirement ai experience`.

### Task 10: Preserve the public UI without exposing model selection

**Files:**
- Modify: `frontend-public/src/api/requirementAi.ts`
- Modify: `frontend-public/src/types/requirementAi.ts`
- Modify: `frontend-public/src/pages/planning/RequirementAiDialog.tsx`
- Modify: `frontend-public/src/pages/execution/ExecutionTaskDetailPage.tsx`
- Create: `frontend-public/tests/requirementAiAsync.test.ts`

- [ ] Add failing source-contract and utility tests verifying no `modelConfigId` is sent, running tasks restore after reopening, completed artifacts load into the existing editor, and notification URLs reopen the correct task result.
- [ ] Run `cd frontend-public && node --import tsx --test tests/requirementAiAsync.test.ts` and verify RED.
- [ ] Implement the same state machine as management without the model selector; preserve current edit/create/import actions and call the unified apply endpoint.
- [ ] Run `npm run test` and `npm run build`, then commit `feat: add public background requirement ai experience`.

### Task 11: Expose image understanding to Hermes

**Files:**
- Modify: `code-processing/app/mcp_server.py`
- Modify: `backend/src/main/java/com/aiclub/platform/service/PlatformToolRegistry.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/PlatformToolExecutor.java`
- Test: relevant backend platform-tool tests and code-processing MCP registration tests.

- [ ] Add failing tests asserting `image.understand` is registered, accepts `documentAssetId + question`, and delegates to `runVisionAgent`.
- [ ] Verify RED.
- [ ] Implement the thin proxy and backend executor with platform-asset validation; run focused backend/Python tests and commit `feat: expose image understanding mcp tool`.

### Task 12: Architecture, full verification and review

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/design-docs/requirement-ai-context-technical-design-v1.md` only if implementation decisions differ.

- [ ] Document the new scenario, three steps, artifact flow, notification recovery, model-selection split and result application boundary.
- [ ] Run `python scripts/check_encoding.py`.
- [ ] Run `cd backend && mvn -s maven-settings-central.xml test`.
- [ ] Run `cd frontend && npm run build`.
- [ ] Run `cd frontend-public && npm run test` and `npm run build`.
- [ ] Start source mode and verify: submit while keeping the dialog open; close/reopen during execution; receive a completion notification; reopen historical output; edit and apply each action; observe public credit refund on forced failure.
- [ ] Review `git diff` for unrelated changes and run the repository code-review workflow before the final commit.
