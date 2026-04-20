package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;

/**
 * 执行调度服务。
 * 第一版使用数据库轮询方式驱动异步执行，不引入额外消息队列中间件。
 */
@Service
public class ExecutionDispatchService {

    private static final Logger log = LoggerFactory.getLogger(ExecutionDispatchService.class);
    private static final String STATUS_WAITING_CONFIRMATION = "WAITING_CONFIRMATION";

    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionWorkflowService executionWorkflowService;
    private final AgentExecutionService agentExecutionService;
    private final ExecutionWritebackService executionWritebackService;
    private final NotificationService notificationService;
    private final RepositoryScanExecutionService repositoryScanExecutionService;
    private final DevelopmentExecutionService developmentExecutionService;
    private final ExecutionEventService executionEventService;
    private final ExecutionAsyncSessionService executionAsyncSessionService;
    private final Executor executionTaskExecutor;
    private final Set<Long> dispatchingTaskIds = Collections.newSetFromMap(new ConcurrentHashMap<>());

    public ExecutionDispatchService(ExecutionTaskRepository executionTaskRepository,
                                    ExecutionRunRepository executionRunRepository,
                                    ExecutionStepRepository executionStepRepository,
                                    ExecutionArtifactRepository executionArtifactRepository,
                                    ExecutionWorkflowService executionWorkflowService,
                                    AgentExecutionService agentExecutionService,
                                    ExecutionWritebackService executionWritebackService,
                                    NotificationService notificationService,
                                    RepositoryScanExecutionService repositoryScanExecutionService,
                                    DevelopmentExecutionService developmentExecutionService,
                                    ExecutionEventService executionEventService,
                                    ExecutionAsyncSessionService executionAsyncSessionService,
                                    @Qualifier("executionTaskExecutor") Executor executionTaskExecutor) {
        this.executionTaskRepository = executionTaskRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionWorkflowService = executionWorkflowService;
        this.agentExecutionService = agentExecutionService;
        this.executionWritebackService = executionWritebackService;
        this.notificationService = notificationService;
        this.repositoryScanExecutionService = repositoryScanExecutionService;
        this.developmentExecutionService = developmentExecutionService;
        this.executionEventService = executionEventService;
        this.executionAsyncSessionService = executionAsyncSessionService;
        this.executionTaskExecutor = executionTaskExecutor;
    }

    /**
     * 周期性轮询待执行任务并依次处理。
     */
    @Scheduled(fixedDelay = 5000L)
    public void dispatchPendingTasks() {
        List<Long> pendingTaskIds = executionTaskRepository.findTop10ByStatusOrderByCreatedAtAscIdAsc("PENDING").stream()
                .map(ExecutionTaskEntity::getId)
                .toList();
        for (Long pendingTaskId : pendingTaskIds) {
            dispatchTaskAsync(pendingTaskId);
        }
    }

    public void dispatchTaskAsync(Long executionTaskId) {
        if (executionTaskId == null || !dispatchingTaskIds.add(executionTaskId)) {
            return;
        }
        executionTaskExecutor.execute(() -> {
            try {
                dispatchTaskNow(executionTaskId);
            } catch (Exception exception) {
                log.warn("执行任务调度失败: executionTaskId={}, message={}", executionTaskId, exception.getMessage(), exception);
            } finally {
                dispatchingTaskIds.remove(executionTaskId);
            }
        });
    }

    /**
     * 取消执行任务时，如果当前步骤已经进入 live runner，会先把该步骤直接收敛为取消态，
     * 这样调度线程不需要再等 runner 自然结束或超时。
     */
    @Transactional
    public boolean requestCancelRunningTask(Long executionTaskId) {
        ExecutionTaskEntity executionTask = requireExecutionTask(executionTaskId);
        ExecutionRunEntity executionRun = executionTask.getCurrentRun();
        if (executionRun == null || executionRun.getCurrentStepNo() == null) {
            return false;
        }
        ExecutionStepEntity currentStep = executionStepRepository.findByRun_IdAndStepNo(
                        executionRun.getId(),
                        executionRun.getCurrentStepNo()
                )
                .orElse(null);
        if (currentStep == null) {
            return false;
        }
        return executionAsyncSessionService.cancelLiveStep(
                executionTask,
                executionRun,
                currentStep,
                "执行任务已取消，当前步骤正在停止"
        );
    }

    /**
     * 立即执行一个待调度任务。
     * 该能力供旧兼容接口和测试场景复用。
     */
    public ExecutionRunEntity dispatchTaskNow(Long executionTaskId) {
        ExecutionTaskEntity executionTask = requireExecutionTask(executionTaskId);
        if (!"PENDING".equals(executionTask.getStatus())) {
            return executionTask.getCurrentRun();
        }
        if (executionTask.isCancelRequested()) {
            executionTask.setStatus("CANCELED");
            executionTask.setLatestSummary("执行已取消");
            executionTaskRepository.save(executionTask);
            return executionTask.getCurrentRun();
        }

        boolean resumeWaitingRun = shouldResumeWaitingDevelopmentRun(executionTask);
        ExecutionRunEntity executionRun = resumeWaitingRun ? executionTask.getCurrentRun() : createRun(executionTask);
        ExecutionTaskEntity runningTask = requireExecutionTask(executionTaskId);
        runningTask.setStatus("RUNNING");
        runningTask.setCurrentRun(executionRun);
        runningTask.setLatestSummary(resumeWaitingRun ? "执行规划已确认，继续执行" : "执行已入队，开始运行");
        executionTaskRepository.save(runningTask);
        if (resumeWaitingRun && executionRun != null) {
            executionRun.setStatus("RUNNING");
            executionRun.setUpdatedAt(LocalDateTime.now());
            executionRunRepository.save(executionRun);
        }

        TaskEntity workItem = runningTask.getWorkItem();
        ExecutionWorkflowService.WorkflowPlan workflowPlan = executionWorkflowService.restoreWorkflow(
                runningTask.getScenarioCode(),
                runningTask.getProject().getId(),
                runningTask.getAgentBindingPayload()
        );

        List<ExecutionStepEntity> completedSteps = new ArrayList<>();
        List<ExecutionArtifactEntity> writebackArtifacts = new ArrayList<>();
        int totalSteps = Math.max(workflowPlan.steps().size(), 1);

        try {
            if (ExecutionWorkflowService.SCENARIO_CODEBASE_COMPLIANCE_SCAN.equalsIgnoreCase(runningTask.getScenarioCode())) {
                return dispatchRepositoryScanTask(runningTask, executionRun, writebackArtifacts);
            }
            if (shouldUseDevelopmentExecution(runningTask, workflowPlan)) {
                return dispatchDevelopmentTask(runningTask, executionRun, workflowPlan, writebackArtifacts);
            }
            for (ExecutionWorkflowService.ExecutionStepPlan stepPlan : workflowPlan.steps()) {
                ExecutionTaskEntity latestTask = requireExecutionTask(executionTaskId);
                if (latestTask.isCancelRequested()) {
                    return finishCanceled(latestTask, executionRun, writebackArtifacts);
                }

                ExecutionStepEntity stepEntity = new ExecutionStepEntity();
                stepEntity.setRun(executionRun);
                stepEntity.setStepNo(stepPlan.stepNo());
                stepEntity.setStepCode(stepPlan.stepCode());
                stepEntity.setStepName(stepPlan.stepName());
                stepEntity.setAgent(stepPlan.agent());
                stepEntity.setStatus("RUNNING");
                stepEntity.setProgressPercent(0);
                stepEntity.setLatestMessage("执行中");
                stepEntity.setStartedAt(LocalDateTime.now());
                stepEntity.setInputSnapshot(executionWorkflowService.buildStepInput(latestTask, workItem, executionRun, stepPlan, completedSteps));
                stepEntity = executionStepRepository.save(stepEntity);

                executionRun.setStatus("RUNNING");
                executionRun.setCurrentStepNo(stepPlan.stepNo());
                executionRun.setProgressPercent(Math.max((stepPlan.stepNo() - 1) * 100 / totalSteps, 0));
                executionRun.setUpdatedAt(LocalDateTime.now());
                executionRunRepository.save(executionRun);

                latestTask.setLatestSummary("执行中：" + stepPlan.stepName());
                executionTaskRepository.save(latestTask);
                executionEventService.recordStepStarted(latestTask, executionRun, stepEntity, "执行中：" + stepPlan.stepName());

                Map<String, String> runtimeVariables = buildRuntimeVariables(latestTask, executionRun, stepEntity, workItem);
                try {
                    String output;
                    if (agentExecutionService.supportsAsyncExecution(stepPlan.agent(), stepEntity.getStepCode())) {
                        int maxRuntimeSeconds = executionAsyncSessionService.maxRuntimeSeconds(stepEntity.getStepCode());
                        AgentExecutionService.AsyncExecutionStartResult startResult = agentExecutionService.startAsyncExecution(
                                stepPlan.agent(),
                                stepEntity.getInputSnapshot(),
                                runtimeVariables,
                                executionAsyncSessionService.submitTimeoutSeconds(),
                                maxRuntimeSeconds
                        );
                        executionAsyncSessionService.bindRunnerSession(
                                latestTask,
                                executionRun,
                                stepEntity,
                                startResult.sessionId(),
                                startResult.runnerType()
                        );
                        stepEntity = executionAsyncSessionService.awaitTerminalStep(
                                stepEntity.getId(),
                                maxRuntimeSeconds
                        );
                        if ("CANCELED".equalsIgnoreCase(stepEntity.getStatus())) {
                            return finishCanceled(latestTask, executionRun, writebackArtifacts);
                        }
                        if (!"SUCCESS".equalsIgnoreCase(stepEntity.getStatus())) {
                            throw new IllegalStateException(defaultString(stepEntity.getErrorMessage()).isBlank()
                                    ? "异步步骤执行失败"
                                    : stepEntity.getErrorMessage());
                        }
                        output = defaultString(stepEntity.getOutputSnapshot());
                    } else {
                        output = agentExecutionService.runAgent(stepPlan.agent().getId(), stepEntity.getInputSnapshot(), runtimeVariables);
                    }
                    stepEntity.setStatus("SUCCESS");
                    stepEntity.setOutputSnapshot(output);
                    stepEntity.setLatestMessage(abbreviate(output, 1000));
                    stepEntity.setProgressPercent(100);
                    stepEntity.setFinishedAt(LocalDateTime.now());
                    executionStepRepository.save(stepEntity);
                    executionEventService.recordSummary(latestTask, executionRun, stepEntity, abbreviate(output, 1000));

                    ExecutionArtifactEntity artifact = createArtifact(executionRun, stepEntity, "STEP_OUTPUT", stepPlan.stepName() + " 输出", output);
                    ExecutionArtifactEntity savedArtifact = executionArtifactRepository.save(artifact);
                    writebackArtifacts.add(savedArtifact);
                    executionEventService.recordArtifactReady(latestTask, executionRun, stepEntity, savedArtifact.getId(), savedArtifact.getTitle());
                    executionEventService.recordStepFinished(latestTask, executionRun, stepEntity, stepEntity.getLatestMessage());

                    executionRun.setProgressPercent(stepPlan.stepNo() * 100 / totalSteps);
                    executionRun.setOutputSummary(abbreviate(output, 4000));
                    executionRun.setUpdatedAt(LocalDateTime.now());
                    executionRunRepository.save(executionRun);
                    completedSteps.add(stepEntity);
                } catch (RuntimeException exception) {
                    return finishFailed(latestTask, executionRun, stepEntity, exception, writebackArtifacts);
                }
            }

            return finishSuccess(requireExecutionTask(executionTaskId), executionRun, writebackArtifacts);
        } catch (RuntimeException exception) {
            log.warn("执行任务处理失败: executionTaskId={}, message={}", executionTaskId, exception.getMessage(), exception);
            return finishInfrastructureFailure(requireExecutionTask(executionTaskId), executionRun, exception, writebackArtifacts);
        }
    }

    /**
     * 多仓开发执行存在仓库级展开、失败后仍需补报告等特殊编排，交给专用执行器处理；
     * 历史三步开发任务继续走通用串行流程，保证兼容性。
     */
    private boolean shouldUseDevelopmentExecution(ExecutionTaskEntity executionTask,
                                                  ExecutionWorkflowService.WorkflowPlan workflowPlan) {
        if (!ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(executionTask.getScenarioCode())) {
            return false;
        }
        boolean hasTestStep = workflowPlan.steps().stream()
                .anyMatch(step -> ExecutionWorkflowService.STEP_TEST.equalsIgnoreCase(step.stepCode()));
        boolean hasReportStep = workflowPlan.steps().stream()
                .anyMatch(step -> ExecutionWorkflowService.STEP_REPORT.equalsIgnoreCase(step.stepCode()));
        return hasTestStep && hasReportStep;
    }

    /**
     * 仓库规范扫描场景走专用执行器，避免复用 Agent 工作流导致步骤与产物模型失真。
     */
    private ExecutionRunEntity dispatchRepositoryScanTask(ExecutionTaskEntity executionTask,
                                                          ExecutionRunEntity executionRun,
                                                          List<ExecutionArtifactEntity> writebackArtifacts) {
        try {
            RepositoryScanExecutionService.RepositoryScanExecutionResult result =
                    repositoryScanExecutionService.executeScanTask(executionTask, executionRun);
            if (result.artifacts() != null) {
                writebackArtifacts.addAll(result.artifacts());
            }
            executionRun.setOutputSummary(result.outputSummary());
            executionRun.setUpdatedAt(LocalDateTime.now());
            executionRunRepository.save(executionRun);
            if (result.canceled()) {
                return finishCanceled(requireExecutionTask(executionTask.getId()), executionRun, writebackArtifacts);
            }
            return finishSuccess(requireExecutionTask(executionTask.getId()), executionRun, writebackArtifacts);
        } catch (RepositoryScanExecutionService.RepositoryScanStepException exception) {
            if (exception.artifacts() != null) {
                writebackArtifacts.addAll(exception.artifacts());
            }
            return finishFailed(requireExecutionTask(executionTask.getId()), executionRun, exception.failedStep(), exception, writebackArtifacts);
        }
    }

    /**
     * 新版开发执行需要按仓库循环真实开发/测试，并在失败后补一份统一报告。
     */
    private ExecutionRunEntity dispatchDevelopmentTask(ExecutionTaskEntity executionTask,
                                                       ExecutionRunEntity executionRun,
                                                       ExecutionWorkflowService.WorkflowPlan workflowPlan,
                                                       List<ExecutionArtifactEntity> writebackArtifacts) {
        try {
            DevelopmentExecutionService.DevelopmentExecutionResult result =
                    developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan);
            if (result.artifacts() != null) {
                writebackArtifacts.addAll(result.artifacts());
            }
            executionRun.setOutputSummary(result.outputSummary());
            executionRun.setUpdatedAt(LocalDateTime.now());
            executionRunRepository.save(executionRun);
            if (result.awaitingConfirmation()) {
                notifyRequesterWhenDevelopmentExecutionNeedsPlanConfirmation(executionTask);
                return executionRun;
            }
            if (result.canceled()) {
                return finishCanceled(requireExecutionTask(executionTask.getId()), executionRun, writebackArtifacts);
            }
            return finishSuccess(requireExecutionTask(executionTask.getId()), executionRun, writebackArtifacts);
        } catch (DevelopmentExecutionService.DevelopmentExecutionStepException exception) {
            if (exception.artifacts() != null) {
                writebackArtifacts.addAll(exception.artifacts());
            }
            if (exception.outputSummary() != null) {
                executionRun.setOutputSummary(exception.outputSummary());
                executionRun.setUpdatedAt(LocalDateTime.now());
                executionRunRepository.save(executionRun);
            }
            return finishFailed(
                    requireExecutionTask(executionTask.getId()),
                    executionRun,
                    exception.failedStep(),
                    exception,
                    writebackArtifacts
            );
        }
    }

    @Transactional
    protected ExecutionRunEntity createRun(ExecutionTaskEntity executionTask) {
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setExecutionTask(executionTask);
        executionRun.setRunNo((int) executionRunRepository.countByExecutionTask_Id(executionTask.getId()) + 1);
        executionRun.setStatus("RUNNING");
        executionRun.setInputSnapshot(executionTask.getInputPayload());
        executionRun.setProgressPercent(0);
        executionRun.setStartedAt(LocalDateTime.now());
        return executionRunRepository.save(executionRun);
    }

    @Transactional
    protected ExecutionRunEntity finishSuccess(ExecutionTaskEntity executionTask,
                                               ExecutionRunEntity executionRun,
                                               List<ExecutionArtifactEntity> artifacts) {
        executionRun.setStatus("SUCCESS");
        executionRun.setProgressPercent(100);
        executionRun.setFinishedAt(LocalDateTime.now());
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        ExecutionArtifactEntity artifact = createArtifact(
                executionRun,
                null,
                "FINAL_SUMMARY",
                "最终摘要",
                defaultString(executionRun.getOutputSummary())
        );
        ExecutionArtifactEntity savedArtifact = executionArtifactRepository.save(artifact);
        artifacts.add(savedArtifact);
        executionEventService.recordArtifactReady(executionTask, executionRun, null, savedArtifact.getId(), savedArtifact.getTitle());

        executionTask.setStatus("SUCCESS");
        executionTask.setCancelRequested(false);
        executionTask.setCurrentRun(executionRun);
        executionTask.setLatestSummary(abbreviate(defaultString(executionRun.getOutputSummary()), 500));
        executionTaskRepository.save(executionTask);

        executionWritebackService.writeBackToWorkItem(executionTask, executionRun, artifacts);
        notifyRequesterWhenDevelopmentExecutionSucceeds(executionTask, executionRun);
        return executionRun;
    }

    @Transactional
    protected ExecutionRunEntity finishFailed(ExecutionTaskEntity executionTask,
                                              ExecutionRunEntity executionRun,
                                              ExecutionStepEntity failedStep,
                                              RuntimeException exception,
                                              List<ExecutionArtifactEntity> artifacts) {
        failedStep.setStatus("FAILED");
        failedStep.setLatestMessage(abbreviate(resolveMessage(exception, "执行步骤失败"), 1000));
        failedStep.setErrorMessage(abbreviate(resolveMessage(exception, "执行步骤失败"), 4000));
        failedStep.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(failedStep);
        executionEventService.recordSummary(executionTask, executionRun, failedStep, failedStep.getLatestMessage());

        executionRun.setStatus("FAILED");
        executionRun.setErrorMessage(abbreviate(resolveMessage(exception, "执行失败"), 4000));
        executionRun.setFinishedAt(LocalDateTime.now());
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        ExecutionArtifactEntity artifact = createArtifact(
                executionRun,
                failedStep,
                "ERROR_SUMMARY",
                failedStep.getStepName() + " 错误摘要",
                executionRun.getErrorMessage()
        );
        ExecutionArtifactEntity savedArtifact = executionArtifactRepository.save(artifact);
        artifacts.add(savedArtifact);
        executionEventService.recordArtifactReady(executionTask, executionRun, failedStep, savedArtifact.getId(), savedArtifact.getTitle());
        executionEventService.recordStepFinished(executionTask, executionRun, failedStep, executionRun.getErrorMessage());

        executionTask.setStatus("FAILED");
        executionTask.setCancelRequested(false);
        executionTask.setCurrentRun(executionRun);
        executionTask.setLatestSummary(abbreviate(resolveMessage(exception, "执行失败"), 500));
        executionTaskRepository.save(executionTask);

        executionWritebackService.writeBackToWorkItem(executionTask, executionRun, artifacts);
        return executionRun;
    }

    @Transactional
    protected ExecutionRunEntity finishInfrastructureFailure(ExecutionTaskEntity executionTask,
                                                             ExecutionRunEntity executionRun,
                                                             RuntimeException exception,
                                                             List<ExecutionArtifactEntity> artifacts) {
        executionRun.setStatus("FAILED");
        executionRun.setErrorMessage(abbreviate(resolveMessage(exception, "执行失败"), 4000));
        executionRun.setFinishedAt(LocalDateTime.now());
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        ExecutionArtifactEntity artifact = createArtifact(
                executionRun,
                null,
                "ERROR_SUMMARY",
                "基础设施错误",
                executionRun.getErrorMessage()
        );
        ExecutionArtifactEntity savedArtifact = executionArtifactRepository.save(artifact);
        artifacts.add(savedArtifact);
        executionEventService.recordArtifactReady(executionTask, executionRun, null, savedArtifact.getId(), savedArtifact.getTitle());

        executionTask.setStatus("FAILED");
        executionTask.setCancelRequested(false);
        executionTask.setCurrentRun(executionRun);
        executionTask.setLatestSummary(abbreviate(resolveMessage(exception, "执行失败"), 500));
        executionTaskRepository.save(executionTask);

        executionWritebackService.writeBackToWorkItem(executionTask, executionRun, artifacts);
        return executionRun;
    }

    @Transactional
    protected ExecutionRunEntity finishCanceled(ExecutionTaskEntity executionTask,
                                                ExecutionRunEntity executionRun,
                                                List<ExecutionArtifactEntity> artifacts) {
        executionRun.setStatus("CANCELED");
        executionRun.setFinishedAt(LocalDateTime.now());
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        ExecutionArtifactEntity artifact = createArtifact(
                executionRun,
                null,
                "FINAL_SUMMARY",
                "取消摘要",
                "执行任务已取消，未继续后续步骤。"
        );
        ExecutionArtifactEntity savedArtifact = executionArtifactRepository.save(artifact);
        artifacts.add(savedArtifact);
        executionEventService.recordArtifactReady(executionTask, executionRun, null, savedArtifact.getId(), savedArtifact.getTitle());

        executionTask.setStatus("CANCELED");
        executionTask.setCancelRequested(false);
        executionTask.setCurrentRun(executionRun);
        executionTask.setLatestSummary("执行已取消");
        executionTaskRepository.save(executionTask);

        executionWritebackService.writeBackToWorkItem(executionTask, executionRun, artifacts);
        return executionRun;
    }

    private ExecutionArtifactEntity createArtifact(ExecutionRunEntity executionRun,
                                                   ExecutionStepEntity executionStep,
                                                   String artifactType,
                                                   String title,
                                                   String contentText) {
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
        artifact.setRun(executionRun);
        artifact.setStep(executionStep);
        artifact.setArtifactType(artifactType);
        artifact.setTitle(title);
        artifact.setContentText(contentText);
        artifact.setWorkItemWritebackFlag(false);
        return artifact;
    }

    /**
     * 统一构建步骤执行变量，便于 Prompt Agent 和 Runtime Agent 同时复用。
     */
    private Map<String, String> buildRuntimeVariables(ExecutionTaskEntity executionTask,
                                                      ExecutionRunEntity executionRun,
                                                      ExecutionStepEntity executionStep,
                                                      TaskEntity workItem) {
        Map<String, String> variables = new LinkedHashMap<>();
        variables.put("execution_task_id", String.valueOf(executionTask.getId()));
        variables.put("execution_task_title", defaultString(executionTask.getTitle()));
        variables.put("execution_run_id", String.valueOf(executionRun.getId()));
        variables.put("execution_run_no", String.valueOf(executionRun.getRunNo()));
        variables.put("step_id", String.valueOf(executionStep.getId()));
        variables.put("step_code", defaultString(executionStep.getStepCode()));
        variables.put("step_name", defaultString(executionStep.getStepName()));
        variables.put("scenario_code", defaultString(executionTask.getScenarioCode()));
        variables.put("project_id", String.valueOf(executionTask.getProject().getId()));
        variables.put("project_name", defaultString(executionTask.getProject().getName()));
        // 即便创建人为空，也补齐空串，避免 HTTP_API 模板里的 {{user_id_json}} / {{user_name_json}} 残留后把请求体拼坏。
        variables.put("user_id", executionTask.getCreatedByUser() == null ? "" : String.valueOf(executionTask.getCreatedByUser().getId()));
        variables.put("user_name", executionTask.getCreatedByUser() == null
                ? ""
                : (defaultString(executionTask.getCreatedByUser().getNickname()).isBlank()
                ? defaultString(executionTask.getCreatedByUser().getUsername())
                : executionTask.getCreatedByUser().getNickname().trim()));
        if (workItem != null) {
            variables.put("task_id", String.valueOf(workItem.getId()));
            variables.put("task_name", defaultString(workItem.getName()));
            variables.put("work_item_code", defaultString(workItem.getWorkItemCode()));
            variables.put("work_item_type", defaultString(workItem.getWorkItemType()));
        }
        variables.put("session_key", "execution:" + executionTask.getId() + ":run:" + executionRun.getId());
        return variables;
    }

    private ExecutionTaskEntity requireExecutionTask(Long executionTaskId) {
        return executionTaskRepository.findWithExecutionContextById(executionTaskId)
                .orElseThrow(() -> new NoSuchElementException("执行任务不存在: " + executionTaskId));
    }

    private boolean shouldResumeWaitingDevelopmentRun(ExecutionTaskEntity executionTask) {
        return executionTask != null
                && ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(executionTask.getScenarioCode())
                && executionTask.getCurrentRun() != null
                && STATUS_WAITING_CONFIRMATION.equalsIgnoreCase(defaultString(executionTask.getCurrentRun().getStatus()));
    }

    private String resolveMessage(RuntimeException exception, String fallbackMessage) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
            return fallbackMessage;
        }
        return exception.getMessage();
    }

    private String abbreviate(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    /**
     * 开发执行成功后主动提醒发起人，避免用户必须盯着执行详情页轮询结果。
     */
    private void notifyRequesterWhenDevelopmentExecutionSucceeds(ExecutionTaskEntity executionTask,
                                                                 ExecutionRunEntity executionRun) {
        if (executionTask.getCreatedByUser() == null
                || !ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(executionTask.getScenarioCode())) {
            return;
        }
        String projectName = executionTask.getProject() == null ? "" : defaultString(executionTask.getProject().getName()).trim();
        String workItemText = executionTask.getWorkItem() == null
                ? ""
                : defaultString(executionTask.getWorkItem().getWorkItemCode()).trim()
                + (defaultString(executionTask.getWorkItem().getName()).isBlank()
                ? ""
                : " " + defaultString(executionTask.getWorkItem().getName()).trim());
        StringBuilder content = new StringBuilder();
        if (!projectName.isBlank()) {
            content.append("项目“").append(projectName).append("”的开发执行已全部通过。");
        } else {
            content.append("开发执行已全部通过。");
        }
        if (!workItemText.isBlank()) {
            content.append("关联工作项：").append(workItemText).append("。");
        }
        if (!defaultString(executionRun.getOutputSummary()).isBlank()) {
            content.append("结果摘要：").append(abbreviate(executionRun.getOutputSummary(), 180)).append("。");
        }
        content.append("可前往执行详情查看产物，并在右上角直接提交 MR。");
        notificationService.sendToUser(
                executionTask.getCreatedByUser().getId(),
                NotificationService.TYPE_TASK,
                NotificationService.LEVEL_SUCCESS,
                "开发执行已完成：" + defaultString(executionTask.getTitle()).trim(),
                content.toString(),
                "/tasks/" + executionTask.getId(),
                "DEVELOPMENT_EXECUTION_COMPLETED",
                executionTask.getId()
        );
    }

    /**
     * 规划确认模式下，PLAN 完成后立刻提醒发起人进入执行详情查看、编辑并确认继续。
     */
    private void notifyRequesterWhenDevelopmentExecutionNeedsPlanConfirmation(ExecutionTaskEntity executionTask) {
        if (executionTask.getCreatedByUser() == null
                || !ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(executionTask.getScenarioCode())) {
            return;
        }
        notificationService.sendToUser(
                executionTask.getCreatedByUser().getId(),
                NotificationService.TYPE_TASK,
                NotificationService.LEVEL_INFO,
                "开发执行待确认：" + defaultString(executionTask.getTitle()).trim(),
                "执行规划已生成，请前往执行详情查看、编辑并确认继续。",
                "/tasks/" + executionTask.getId(),
                "DEVELOPMENT_EXECUTION_PLAN_CONFIRMATION_REQUIRED",
                executionTask.getId()
        );
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
