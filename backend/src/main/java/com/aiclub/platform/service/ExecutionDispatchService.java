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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 执行调度服务。
 * 第一版使用数据库轮询方式驱动异步执行，不引入额外消息队列中间件。
 */
@Service
public class ExecutionDispatchService {

    private static final Logger log = LoggerFactory.getLogger(ExecutionDispatchService.class);

    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionWorkflowService executionWorkflowService;
    private final AgentExecutionService agentExecutionService;
    private final ExecutionWritebackService executionWritebackService;

    public ExecutionDispatchService(ExecutionTaskRepository executionTaskRepository,
                                    ExecutionRunRepository executionRunRepository,
                                    ExecutionStepRepository executionStepRepository,
                                    ExecutionArtifactRepository executionArtifactRepository,
                                    ExecutionWorkflowService executionWorkflowService,
                                    AgentExecutionService agentExecutionService,
                                    ExecutionWritebackService executionWritebackService) {
        this.executionTaskRepository = executionTaskRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionWorkflowService = executionWorkflowService;
        this.agentExecutionService = agentExecutionService;
        this.executionWritebackService = executionWritebackService;
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
            try {
                dispatchTaskNow(pendingTaskId);
            } catch (Exception exception) {
                log.warn("执行任务调度失败: executionTaskId={}, message={}", pendingTaskId, exception.getMessage(), exception);
            }
        }
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

        ExecutionRunEntity executionRun = createRun(executionTask);
        ExecutionTaskEntity runningTask = requireExecutionTask(executionTaskId);
        runningTask.setStatus("RUNNING");
        runningTask.setCurrentRun(executionRun);
        runningTask.setLatestSummary("执行已入队，开始运行");
        executionTaskRepository.save(runningTask);

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

                Map<String, String> runtimeVariables = buildRuntimeVariables(latestTask, executionRun, stepEntity, workItem);
                try {
                    String output = agentExecutionService.runAgent(stepPlan.agent().getId(), stepEntity.getInputSnapshot(), runtimeVariables);
                    stepEntity.setStatus("SUCCESS");
                    stepEntity.setOutputSnapshot(output);
                    stepEntity.setFinishedAt(LocalDateTime.now());
                    executionStepRepository.save(stepEntity);

                    ExecutionArtifactEntity artifact = createArtifact(executionRun, stepEntity, "STEP_OUTPUT", stepPlan.stepName() + " 输出", output);
                    writebackArtifacts.add(executionArtifactRepository.save(artifact));

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
        artifacts.add(executionArtifactRepository.save(artifact));

        executionTask.setStatus("SUCCESS");
        executionTask.setCancelRequested(false);
        executionTask.setCurrentRun(executionRun);
        executionTask.setLatestSummary(abbreviate(defaultString(executionRun.getOutputSummary()), 500));
        executionTaskRepository.save(executionTask);

        executionWritebackService.writeBackToWorkItem(executionTask, executionRun, artifacts);
        return executionRun;
    }

    @Transactional
    protected ExecutionRunEntity finishFailed(ExecutionTaskEntity executionTask,
                                              ExecutionRunEntity executionRun,
                                              ExecutionStepEntity failedStep,
                                              RuntimeException exception,
                                              List<ExecutionArtifactEntity> artifacts) {
        failedStep.setStatus("FAILED");
        failedStep.setErrorMessage(abbreviate(resolveMessage(exception, "执行步骤失败"), 4000));
        failedStep.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(failedStep);

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
        artifacts.add(executionArtifactRepository.save(artifact));

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
        artifacts.add(executionArtifactRepository.save(artifact));

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
        artifacts.add(executionArtifactRepository.save(artifact));

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
        if (workItem != null) {
            variables.put("task_id", String.valueOf(workItem.getId()));
            variables.put("task_name", defaultString(workItem.getName()));
            variables.put("work_item_code", defaultString(workItem.getWorkItemCode()));
            variables.put("work_item_type", defaultString(workItem.getWorkItemType()));
        }
        if (executionTask.getCreatedByUser() != null) {
            variables.put("user_id", String.valueOf(executionTask.getCreatedByUser().getId()));
            variables.put("user_name", defaultString(executionTask.getCreatedByUser().getNickname()).isBlank()
                    ? defaultString(executionTask.getCreatedByUser().getUsername())
                    : executionTask.getCreatedByUser().getNickname().trim());
        }
        variables.put("session_key", "execution:" + executionTask.getId() + ":run:" + executionRun.getId());
        return variables;
    }

    private ExecutionTaskEntity requireExecutionTask(Long executionTaskId) {
        return executionTaskRepository.findById(executionTaskId)
                .orElseThrow(() -> new NoSuchElementException("执行任务不存在: " + executionTaskId));
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

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
