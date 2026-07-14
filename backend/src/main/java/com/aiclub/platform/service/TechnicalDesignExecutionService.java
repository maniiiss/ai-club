package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 技术设计 Runtime 专用编排器。
 * 业务边界是只读理解仓库并依次生成代码上下文、技术设计和设计自检产物，绝不进入代码实现链路。
 */
@Service
public class TechnicalDesignExecutionService {

    public static final String ARTIFACT_CODE_CONTEXT = "CODE_CONTEXT_MARKDOWN";
    public static final String ARTIFACT_TECHNICAL_DESIGN = "TECHNICAL_DESIGN_MARKDOWN";
    public static final String ARTIFACT_DESIGN_REVIEW = "DESIGN_REVIEW_MARKDOWN";

    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final AgentExecutionService agentExecutionService;
    private final ExecutionEventService executionEventService;
    private final ExecutionAsyncSessionService executionAsyncSessionService;
    private final TokenCipherService tokenCipherService;
    private final ObjectMapper objectMapper;

    public TechnicalDesignExecutionService(ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                           ExecutionStepRepository executionStepRepository,
                                           ExecutionRunRepository executionRunRepository,
                                           ExecutionArtifactRepository executionArtifactRepository,
                                           ExecutionTaskRepository executionTaskRepository,
                                           AgentExecutionService agentExecutionService,
                                           ExecutionEventService executionEventService,
                                           ExecutionAsyncSessionService executionAsyncSessionService,
                                           TokenCipherService tokenCipherService,
                                           ObjectMapper objectMapper) {
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.agentExecutionService = agentExecutionService;
        this.executionEventService = executionEventService;
        this.executionAsyncSessionService = executionAsyncSessionService;
        this.tokenCipherService = tokenCipherService;
        this.objectMapper = objectMapper;
    }

    /**
     * 顺序执行三步 Runtime，并把前一步 Markdown 作为下一步的明确输入证据。
     */
    public TechnicalDesignExecutionResult executeTechnicalDesignTask(ExecutionTaskEntity executionTask,
                                                                      ExecutionRunEntity executionRun,
                                                                      ExecutionWorkflowService.WorkflowPlan workflowPlan) {
        if (workflowPlan.steps().size() != 3) {
            throw new IllegalStateException("技术设计工作流必须包含代码理解、方案生成、设计自检三个步骤");
        }
        TechnicalDesignPayload payload = readPayload(executionTask.getInputPayload());
        List<ResolvedRepository> repositories = resolveRepositories(executionTask.getProject().getId(), payload.repositories());
        if (repositories.isEmpty()) {
            throw new IllegalStateException("技术设计生成至少需要一个仓库上下文");
        }

        List<ExecutionArtifactEntity> artifacts = new ArrayList<>();
        List<ExecutionStepEntity> completedSteps = new ArrayList<>();
        for (ExecutionWorkflowService.ExecutionStepPlan stepPlan : workflowPlan.steps()) {
            if (isCancelRequested(executionTask.getId())) {
                return new TechnicalDesignExecutionResult("执行任务已取消，未继续生成技术设计。", artifacts, true);
            }
            String input = buildStepInput(executionTask, stepPlan, payload, repositories, completedSteps);
            ExecutionStepEntity step = beginStep(executionTask, executionRun, stepPlan, input, workflowPlan.steps().size());
            try {
                String output = executeAgent(executionTask, executionRun, stepPlan, step, repositories, input);
                completeStep(executionTask, executionRun, stepPlan, step, output, workflowPlan.steps().size());
                ExecutionArtifactEntity artifact = saveArtifact(executionTask, executionRun, step, stepPlan.stepCode(), output);
                artifacts.add(artifact);
                completedSteps.add(step);
            } catch (TechnicalDesignCanceledException exception) {
                // 异步 Runtime 可能在步骤内部收到取消信号，必须收口为 CANCELED，不能误报为执行失败。
                failStep(executionTask, executionRun, step, exception);
                return new TechnicalDesignExecutionResult(resolveMessage(exception, "技术设计执行已取消"), artifacts, true);
            } catch (RuntimeException exception) {
                failStep(executionTask, executionRun, step, exception);
                throw new TechnicalDesignExecutionException(step, artifacts, exception);
            }
        }
        String summary = completedSteps.isEmpty()
                ? "技术设计生成已完成"
                : abbreviate(defaultString(completedSteps.get(completedSteps.size() - 1).getOutputSnapshot()), 4000);
        executionRun.setOutputSummary(summary);
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);
        return new TechnicalDesignExecutionResult(summary, artifacts, false);
    }

    private ExecutionStepEntity beginStep(ExecutionTaskEntity task,
                                          ExecutionRunEntity run,
                                          ExecutionWorkflowService.ExecutionStepPlan plan,
                                          String input,
                                          int totalSteps) {
        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setRun(run);
        step.setStepNo(plan.stepNo());
        step.setStepCode(plan.stepCode());
        step.setStepName(plan.stepName());
        step.setAgent(plan.agent());
        step.setStatus("RUNNING");
        step.setProgressPercent(0);
        step.setLatestMessage("执行中");
        step.setInputSnapshot(input);
        step.setStartedAt(LocalDateTime.now());
        step = executionStepRepository.save(step);

        run.setStatus("RUNNING");
        run.setCurrentStepNo(plan.stepNo());
        run.setProgressPercent(Math.max((plan.stepNo() - 1) * 100 / Math.max(totalSteps, 1), 0));
        run.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(run);
        task.setLatestSummary("执行中：" + plan.stepName());
        executionTaskRepository.save(task);
        executionEventService.recordStepStarted(task, run, step, "执行中：" + plan.stepName());
        return step;
    }

    private String executeAgent(ExecutionTaskEntity task,
                                ExecutionRunEntity run,
                                ExecutionWorkflowService.ExecutionStepPlan plan,
                                ExecutionStepEntity step,
                                List<ResolvedRepository> repositories,
                                String input) {
        Map<String, String> variables = buildRuntimeVariables(task, run, step, repositories);
        if (plan.timeoutSeconds() != null) variables.put("orchestration_timeout_seconds", String.valueOf(plan.timeoutSeconds()));
        boolean supportsAsync = hasText(variables.get("runtime_registry_code"))
                ? agentExecutionService.supportsAsyncExecution(plan.agent(), step.getStepCode(), variables)
                : agentExecutionService.supportsAsyncExecution(plan.agent(), step.getStepCode());
        if (!supportsAsync) {
            return agentExecutionService.runAgent(plan.agent().getId(), input, variables);
        }
        int maxRuntimeSeconds = plan.timeoutSeconds() == null
                ? executionAsyncSessionService.maxRuntimeSeconds(step.getStepCode(), task.getInputPayload())
                : plan.timeoutSeconds();
        AgentExecutionService.AsyncExecutionStartResult startResult = agentExecutionService.startAsyncExecution(
                plan.agent(), input, variables, executionAsyncSessionService.submitTimeoutSeconds(), maxRuntimeSeconds
        );
        executionAsyncSessionService.bindRunnerSession(
                task, run, step, startResult.sessionId(), startResult.runnerType(), startResult.workspaceRoot()
        );
        ExecutionStepEntity completed = executionAsyncSessionService.awaitTerminalStep(step.getId(), maxRuntimeSeconds);
        if ("CANCELED".equalsIgnoreCase(completed.getStatus())) {
            throw new TechnicalDesignCanceledException(defaultString(completed.getLatestMessage()));
        }
        if (!"SUCCESS".equalsIgnoreCase(completed.getStatus())) {
            throw new IllegalStateException(hasText(completed.getErrorMessage()) ? completed.getErrorMessage() : plan.stepName() + "执行失败");
        }
        return defaultString(completed.getOutputSnapshot());
    }

    private void completeStep(ExecutionTaskEntity task,
                              ExecutionRunEntity run,
                              ExecutionWorkflowService.ExecutionStepPlan plan,
                              ExecutionStepEntity step,
                              String output,
                              int totalSteps) {
        step.setStatus("SUCCESS");
        step.setOutputSnapshot(output);
        step.setLatestMessage(abbreviate(output, 1000));
        step.setProgressPercent(100);
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionEventService.recordSummary(task, run, step, step.getLatestMessage());
        executionEventService.recordStepFinished(task, run, step, step.getLatestMessage());

        run.setProgressPercent(plan.stepNo() * 100 / Math.max(totalSteps, 1));
        run.setOutputSummary(abbreviate(output, 4000));
        run.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(run);
    }

    private void failStep(ExecutionTaskEntity task, ExecutionRunEntity run, ExecutionStepEntity step, RuntimeException exception) {
        step.setStatus(exception instanceof TechnicalDesignCanceledException ? "CANCELED" : "FAILED");
        step.setErrorMessage(resolveMessage(exception, "技术设计步骤执行失败"));
        step.setLatestMessage(step.getErrorMessage());
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionEventService.recordStepFinished(task, run, step, step.getLatestMessage());
    }

    private ExecutionArtifactEntity saveArtifact(ExecutionTaskEntity task,
                                                  ExecutionRunEntity run,
                                                  ExecutionStepEntity step,
                                                  String stepCode,
                                                  String output) {
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
        artifact.setRun(run);
        artifact.setStep(step);
        artifact.setArtifactType(resolveArtifactType(stepCode));
        artifact.setTitle(resolveArtifactTitle(stepCode));
        artifact.setContentText(output);
        artifact.setWorkItemWritebackFlag(false);
        artifact = executionArtifactRepository.save(artifact);
        executionEventService.recordArtifactReady(task, run, step, artifact.getId(), artifact.getTitle());
        return artifact;
    }

    private String resolveArtifactType(String stepCode) {
        return switch (defaultString(stepCode).trim().toUpperCase()) {
            case ExecutionWorkflowService.STEP_CODE_CONTEXT -> ARTIFACT_CODE_CONTEXT;
            case ExecutionWorkflowService.STEP_DESIGN_DRAFT -> ARTIFACT_TECHNICAL_DESIGN;
            case ExecutionWorkflowService.STEP_DESIGN_REVIEW -> ARTIFACT_DESIGN_REVIEW;
            default -> throw new IllegalArgumentException("未知技术设计步骤: " + stepCode);
        };
    }

    private String resolveArtifactTitle(String stepCode) {
        return switch (defaultString(stepCode).trim().toUpperCase()) {
            case ExecutionWorkflowService.STEP_CODE_CONTEXT -> "代码理解 Markdown";
            case ExecutionWorkflowService.STEP_DESIGN_DRAFT -> "技术设计 Markdown";
            case ExecutionWorkflowService.STEP_DESIGN_REVIEW -> "设计自检 Markdown";
            default -> "技术设计产物";
        };
    }

    private String buildStepInput(ExecutionTaskEntity task,
                                  ExecutionWorkflowService.ExecutionStepPlan plan,
                                  TechnicalDesignPayload payload,
                                  List<ResolvedRepository> repositories,
                                  List<ExecutionStepEntity> previousSteps) {
        TaskEntity workItem = task.getWorkItem();
        StringBuilder builder = new StringBuilder();
        builder.append("执行任务：").append(defaultString(task.getTitle())).append('\n')
                .append("场景：技术设计生成\n")
                .append("步骤：").append(defaultString(plan.stepName())).append("\n\n");
        if (workItem != null) {
            builder.append("## 工作项上下文\n")
                    .append("编号：").append(defaultString(workItem.getWorkItemCode())).append('\n')
                    .append("标题：").append(defaultString(workItem.getName())).append('\n')
                    .append("类型：").append(defaultString(workItem.getWorkItemType())).append(" / ").append(defaultString(workItem.getTaskType())).append('\n')
                    .append("说明：").append(defaultString(workItem.getDescription())).append("\n\n");
        }
        if (hasText(payload.requirementContextMarkdown())) {
            builder.append("## 关联需求上下文\n")
                    .append(payload.requirementContextMarkdown().trim())
                    .append("\n\n");
        }
        builder.append("## 仓库范围\n");
        repositories.forEach(repository -> builder.append("- ")
                .append(repository.displayName()).append(" @ ").append(repository.targetBranch()).append('\n'));
        if (hasText(payload.inputText())) {
            builder.append("\n## 用户补充说明\n").append(payload.inputText().trim()).append("\n");
        }
        if (!previousSteps.isEmpty()) {
            builder.append("\n## 前序产物\n");
            previousSteps.forEach(previous -> builder.append("### ")
                    .append(defaultString(previous.getStepName())).append('\n')
                    .append(defaultString(previous.getOutputSnapshot())).append("\n\n"));
        }
        builder.append("\n## 当前步骤业务约束\n")
                .append(stepInstruction(plan.stepCode(), payload.preferGitNexus()));
        return builder.toString().trim();
    }

    private String stepInstruction(String stepCode, boolean preferGitNexus) {
        return switch (defaultString(stepCode).trim().toUpperCase()) {
            case ExecutionWorkflowService.STEP_CODE_CONTEXT -> "优先使用 GitNexus：" + preferGitNexus
                    + "。输出代码模块、执行流、调用链、upstream impact、风险等级、现有测试和最小 harness，并固定包含“GitNexus 使用情况”。不得修改代码。";
            case ExecutionWorkflowService.STEP_DESIGN_DRAFT -> "只生成技术设计 Markdown，固定包含背景与目标、现状与约束、方案概览、影响范围、接口与数据变更、兼容性与迁移、风险与回滚、Harness 与验证、开发执行输入。";
            case ExecutionWorkflowService.STEP_DESIGN_REVIEW -> "检查源码证据、影响范围、测试策略和回滚方案，标注人工确认项；不得把建议命令写成已通过事实。";
            default -> "完成技术设计步骤，不得修改代码。";
        };
    }

    private Map<String, String> buildRuntimeVariables(ExecutionTaskEntity task,
                                                       ExecutionRunEntity run,
                                                       ExecutionStepEntity step,
                                                       List<ResolvedRepository> repositories) {
        Map<String, String> variables = new LinkedHashMap<>();
        variables.put("execution_task_id", String.valueOf(task.getId()));
        variables.put("execution_task_title", defaultString(task.getTitle()));
        variables.put("execution_run_id", String.valueOf(run.getId()));
        variables.put("execution_run_no", String.valueOf(run.getRunNo()));
        variables.put("step_id", String.valueOf(step.getId()));
        variables.put("step_code", defaultString(step.getStepCode()));
        variables.put("step_name", defaultString(step.getStepName()));
        variables.put("scenario_code", defaultString(task.getScenarioCode()));
        variables.put("runtime_registry_code", defaultString(task.getRuntimeRegistryCodeSnapshot()));
        variables.put("project_id", String.valueOf(task.getProject().getId()));
        variables.put("project_name", defaultString(task.getProject().getName()));
        variables.put("session_key", "execution:" + task.getId() + ":run:" + run.getId() + ":step:" + step.getId());
        variables.put("user_id", task.getCreatedByUser() == null ? "" : String.valueOf(task.getCreatedByUser().getId()));
        variables.put("user_name", task.getCreatedByUser() == null ? "" : defaultString(task.getCreatedByUser().getUsername()));
        variables.put("development_repositories_json", toJson(repositories.stream().map(repository -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("bindingId", repository.bindingId());
            item.put("displayName", repository.displayName());
            item.put("projectRef", repository.projectRef());
            item.put("projectPath", repository.projectPath());
            item.put("repoUrl", repository.repoUrl());
            item.put("targetBranch", repository.targetBranch());
            item.put("apiBaseUrl", repository.apiBaseUrl());
            item.put("authToken", repository.authToken());
            return item;
        }).toList()));
        return variables;
    }

    private TechnicalDesignPayload readPayload(String inputPayload) {
        try {
            JsonNode root = objectMapper.readTree(defaultString(inputPayload));
            List<RepositoryRequest> repositories = new ArrayList<>();
            for (JsonNode repository : root.path("repositories")) {
                repositories.add(new RepositoryRequest(
                        repository.path("bindingId").asLong(),
                        repository.path("targetBranch").asText("")
                ));
            }
            return new TechnicalDesignPayload(
                    root.path("inputText").asText(""),
                    root.path("preferGitNexus").asBoolean(true),
                    repositories,
                    buildRequirementContextMarkdown(root.path("requirementContext"))
            );
        } catch (Exception exception) {
            throw new IllegalStateException("技术设计输入载荷解析失败", exception);
        }
    }

    /** 将创建阶段固化的需求快照转换为每一步都可读的 Markdown 上下文。 */
    private String buildRequirementContextMarkdown(JsonNode context) {
        if (context == null || context.isMissingNode() || context.isEmpty()) {
            return "";
        }
        return "需求编号：" + context.path("workItemCode").asText("") + '\n'
                + "需求标题：" + context.path("name").asText("") + '\n'
                + "需求状态：" + context.path("status").asText("") + '\n'
                + "需求优先级：" + context.path("priority").asText("") + '\n'
                + "需求描述：\n" + context.path("description").asText("") + '\n'
                + "需求文档：\n" + context.path("requirementMarkdown").asText("") + '\n'
                + "原型链接：" + context.path("prototypeUrl").asText("");
    }

    private List<ResolvedRepository> resolveRepositories(Long projectId, List<RepositoryRequest> requests) {
        List<ResolvedRepository> repositories = new ArrayList<>();
        for (RepositoryRequest request : requests) {
            ProjectGitlabBindingEntity binding = projectGitlabBindingRepository.findById(request.bindingId())
                    .orElseThrow(() -> new NoSuchElementException("GitLab 绑定不存在: " + request.bindingId()));
            if (!projectId.equals(binding.getProject().getId())) {
                throw new IllegalArgumentException("技术设计仓库必须属于当前项目");
            }
            if (!Boolean.TRUE.equals(binding.getEnabled())) {
                throw new IllegalArgumentException("所选 GitLab 绑定已停用");
            }
            String repoUrl = hasText(binding.getGitlabHttpCloneUrl())
                    ? binding.getGitlabHttpCloneUrl().trim()
                    : defaultString(binding.getGitlabProjectWebUrl()).trim();
            if (hasText(repoUrl) && !repoUrl.endsWith(".git")) {
                repoUrl += ".git";
            }
            if (!hasText(repoUrl)) {
                throw new IllegalArgumentException("技术设计仓库缺少 HTTP Clone 地址");
            }
            repositories.add(new ResolvedRepository(
                    binding.getId(),
                    hasText(binding.getGitlabProjectPath()) ? binding.getGitlabProjectPath().trim() : defaultString(binding.getGitlabProjectRef()),
                    defaultString(binding.getGitlabProjectRef()),
                    defaultString(binding.getGitlabProjectPath()),
                    repoUrl,
                    request.targetBranch().trim(),
                    defaultString(binding.getApiBaseUrl()),
                    tokenCipherService.decrypt(binding.getTokenCiphertext())
            ));
        }
        return repositories;
    }

    private boolean isCancelRequested(Long executionTaskId) {
        return executionTaskRepository.findById(executionTaskId)
                .map(ExecutionTaskEntity::isCancelRequested)
                .orElse(false);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("技术设计 Runtime 上下文序列化失败", exception);
        }
    }

    private String resolveMessage(RuntimeException exception, String fallback) {
        return exception == null || !hasText(exception.getMessage()) ? fallback : exception.getMessage().trim();
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value).trim();
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    public record TechnicalDesignExecutionResult(String summary,
                                                 List<ExecutionArtifactEntity> artifacts,
                                                 boolean canceled) {
    }

    public static class TechnicalDesignExecutionException extends RuntimeException {
        private final ExecutionStepEntity failedStep;
        private final List<ExecutionArtifactEntity> artifacts;

        public TechnicalDesignExecutionException(ExecutionStepEntity failedStep,
                                                 List<ExecutionArtifactEntity> artifacts,
                                                 RuntimeException cause) {
            super(cause == null ? "技术设计步骤执行失败" : cause.getMessage(), cause);
            this.failedStep = failedStep;
            this.artifacts = List.copyOf(artifacts);
        }

        public ExecutionStepEntity failedStep() {
            return failedStep;
        }

        public List<ExecutionArtifactEntity> artifacts() {
            return artifacts;
        }
    }

    private static class TechnicalDesignCanceledException extends RuntimeException {
        private TechnicalDesignCanceledException(String message) {
            super(message == null || message.isBlank() ? "技术设计执行已取消" : message);
        }
    }

    private record TechnicalDesignPayload(String inputText,
                                          boolean preferGitNexus,
                                          List<RepositoryRequest> repositories,
                                          String requirementContextMarkdown) {
    }

    private record RepositoryRequest(Long bindingId, String targetBranch) {
    }

    private record ResolvedRepository(Long bindingId,
                                      String displayName,
                                      String projectRef,
                                      String projectPath,
                                      String repoUrl,
                                      String targetBranch,
                                      String apiBaseUrl,
                                      String authToken) {
    }
}
