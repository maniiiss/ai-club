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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 开发执行专用编排器。
 * 第一版负责把多仓开发执行拆解为：规划 -> 按仓库开发/测试 -> 交付报告。
 */
@Service
public class DevelopmentExecutionService {

    private static final int IMPLEMENT_PLAN_CONTEXT_MAX_LENGTH = 4000;
    private static final String STATUS_WAITING_CONFIRMATION = "WAITING_CONFIRMATION";
    private static final String PLAN_ARTIFACT_TYPE = "PLAN_MARKDOWN";
    private static final String PLAN_ARTIFACT_TITLE = "执行规划 Markdown";
    private static final String STRUCTURING_SUCCESS_MESSAGE = "仓库结构化已完成";
    private static final String PLAN_CONFIRMATION_SUMMARY = "执行规划已生成，等待发起人确认";

    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final AgentExecutionService agentExecutionService;
    private final ExecutionEventService executionEventService;
    private final ExecutionAsyncSessionService executionAsyncSessionService;
    private final RepositoryStructuringClientService repositoryStructuringClientService;
    private final TokenCipherService tokenCipherService;
    private final GitlabApiService gitlabApiService;
    private final ObjectMapper objectMapper;

    public DevelopmentExecutionService(ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                       ExecutionStepRepository executionStepRepository,
                                       ExecutionRunRepository executionRunRepository,
                                       ExecutionArtifactRepository executionArtifactRepository,
                                       ExecutionTaskRepository executionTaskRepository,
                                       AgentExecutionService agentExecutionService,
                                       ExecutionEventService executionEventService,
                                       ExecutionAsyncSessionService executionAsyncSessionService,
                                       RepositoryStructuringClientService repositoryStructuringClientService,
                                       TokenCipherService tokenCipherService,
                                       GitlabApiService gitlabApiService,
                                       ObjectMapper objectMapper) {
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.agentExecutionService = agentExecutionService;
        this.executionEventService = executionEventService;
        this.executionAsyncSessionService = executionAsyncSessionService;
        this.repositoryStructuringClientService = repositoryStructuringClientService;
        this.tokenCipherService = tokenCipherService;
        this.gitlabApiService = gitlabApiService;
        this.objectMapper = objectMapper;
    }

    /**
     * 执行多仓开发闭环；若中间仓库失败，会在生成报告后抛出步骤异常，交由上层统一收口为失败态。
     */
    public DevelopmentExecutionResult executeDevelopmentTask(ExecutionTaskEntity executionTask,
                                                             ExecutionRunEntity executionRun,
                                                             ExecutionWorkflowService.WorkflowPlan workflowPlan) {
        DevelopmentTaskPayload payload = readPayload(executionTask.getInputPayload());
        List<ResolvedRepositoryContext> repositories = resolveRepositories(executionTask.getProject().getId(), payload.repositories());
        if (repositories.isEmpty()) {
            throw new IllegalStateException("开发执行至少需要一个仓库上下文");
        }
        if (workflowPlan.steps().size() != 2 + repositories.size() * 2 + 1) {
            throw new IllegalStateException("开发执行步骤快照与仓库数量不匹配");
        }

        List<ExecutionArtifactEntity> artifacts = new ArrayList<>();
        TaskEntity workItem = executionTask.getWorkItem();
        int totalSteps = workflowPlan.steps().size();
        int pointer = 0;
        String planMarkdown = "";
        StructuringStepResult structuringResult = StructuringStepResult.empty();
        FailureContext failureContext = null;
        List<RepositoryExecutionState> repositoryStates = new ArrayList<>();
        List<ResolvedRepositoryContext> skippedRepositories = new ArrayList<>();

        ExecutionWorkflowService.ExecutionStepPlan structuringStep = workflowPlan.steps().get(pointer++);
        ExecutionStepEntity existingStructuringStep = executionStepRepository.findByRun_IdAndStepNo(executionRun.getId(), structuringStep.stepNo())
                .orElse(null);
        boolean reuseStructuring = hasSuccessfulStep(existingStructuringStep, structuringStep);
        if (reuseStructuring) {
            structuringResult = resolvePersistedStructuringResult(existingStructuringStep);
            repositories = applyStructuringResult(repositories, structuringResult);
        } else {
            try {
                String structuringInput = buildStructuringInput(executionTask, workItem, repositories, payload.inputText());
                structuringResult = executeStructuringStep(
                        executionTask,
                        executionRun,
                        workItem,
                        structuringStep,
                        repositories,
                        structuringInput,
                        totalSteps
                );
                repositories = applyStructuringResult(repositories, structuringResult);
            } catch (DevelopmentExecutionCanceledException exception) {
                return canceledResult(artifacts);
            } catch (RuntimeException exception) {
                String structuringInput = buildStructuringInput(executionTask, workItem, repositories, payload.inputText());
                failureContext = markFailure(executionTask, executionRun, structuringStep, totalSteps, structuringInput, exception);
                skippedRepositories.addAll(repositories);
            }
        }
        if (failureContext == null && isCancelRequested(executionTask.getId())) {
            return canceledResult(artifacts);
        }

        ExecutionWorkflowService.ExecutionStepPlan planStep = workflowPlan.steps().get(pointer++);
        ExecutionStepEntity existingPlanStep = executionStepRepository.findByRun_IdAndStepNo(executionRun.getId(), planStep.stepNo())
                .orElse(null);
        boolean reuseExistingPlan = hasSuccessfulStep(existingPlanStep, planStep);
        if (reuseExistingPlan) {
            planMarkdown = resolvePersistedPlanMarkdown(executionRun, existingPlanStep);
        } else if (failureContext == null) {
            String planInput = buildPlanInput(executionTask, workItem, repositories, payload.inputText(), structuringResult);
            try {
                planMarkdown = executePlanStep(executionTask, executionRun, workItem, planStep, repositories, planInput, totalSteps, artifacts, structuringResult);
            } catch (DevelopmentExecutionCanceledException exception) {
                return canceledResult(artifacts);
            } catch (RuntimeException exception) {
                failureContext = markFailure(executionTask, executionRun, planStep, totalSteps, planInput, exception);
                skippedRepositories.addAll(repositories);
            }
            if (failureContext == null && payload.planConfirmationRequired()) {
                pauseForPlanConfirmation(executionTask, executionRun, planStep, totalSteps);
                return new DevelopmentExecutionResult(PLAN_CONFIRMATION_SUMMARY, artifacts, false, true);
            }
        }

        for (int index = 0; index < repositories.size(); index++) {
            ResolvedRepositoryContext repository = repositories.get(index);
            ExecutionWorkflowService.ExecutionStepPlan implementStep = workflowPlan.steps().get(pointer++);
            ExecutionWorkflowService.ExecutionStepPlan testStep = workflowPlan.steps().get(pointer++);
            if (failureContext != null) {
                if (!skippedRepositories.contains(repository)) {
                    skippedRepositories.add(repository);
                }
                continue;
            }
            if (isCancelRequested(executionTask.getId())) {
                return new DevelopmentExecutionResult("执行任务已取消，未继续后续仓库。", artifacts, true, false);
            }

            RepositoryExecutionState state = new RepositoryExecutionState(repository, index + 1, repositories.size());
            repositoryStates.add(state);
            String implementInput = buildImplementInput(executionTask, workItem, repository, state.index(), state.total(), payload.inputText(), planMarkdown, structuringResult);
            try {
                ImplementationStepResult implementationResult = executeImplementStep(
                        executionTask, executionRun, workItem, implementStep, repository, state.index(), state.total(), implementInput, totalSteps, artifacts
                );
                state.setImplementationResult(implementationResult);
            } catch (DevelopmentExecutionCanceledException exception) {
                return canceledResult(artifacts);
            } catch (RuntimeException exception) {
                failureContext = markFailure(executionTask, executionRun, implementStep, totalSteps, implementInput, exception);
                skippedRepositories.addAll(repositories.subList(index + 1, repositories.size()));
                break;
            }
            if (isCancelRequested(executionTask.getId())) {
                return canceledResult(artifacts);
            }

            String testInput = buildTestInput(executionTask, workItem, repository, state, payload.inputText(), structuringResult);
            try {
                TestStepResult testResult = executeTestStep(
                        executionTask, executionRun, workItem, testStep, repository, state, testInput, totalSteps, artifacts
                );
                state.setTestResult(testResult);
            } catch (DevelopmentExecutionCanceledException exception) {
                return canceledResult(artifacts);
            } catch (RuntimeException exception) {
                failureContext = markFailure(executionTask, executionRun, testStep, totalSteps, testInput, exception);
                skippedRepositories.addAll(repositories.subList(index + 1, repositories.size()));
                break;
            }
        }

        if (isCancelRequested(executionTask.getId())) {
            return canceledResult(artifacts);
        }

        ExecutionWorkflowService.ExecutionStepPlan reportStep = workflowPlan.steps().get(workflowPlan.steps().size() - 1);
        String reportInput = buildReportInput(executionTask, workItem, repositories, repositoryStates, skippedRepositories, payload.inputText(), planMarkdown, structuringResult, failureContext);
        String reportSummary = "";
        try {
            reportSummary = executeReportStep(executionTask, executionRun, workItem, reportStep, reportInput, totalSteps, artifacts);
        } catch (DevelopmentExecutionCanceledException exception) {
            return canceledResult(artifacts);
        } catch (RuntimeException exception) {
            FailureContext reportFailure = markFailure(executionTask, executionRun, reportStep, totalSteps, reportInput, exception);
            if (failureContext == null) {
                failureContext = reportFailure;
            } else {
                failureContext = failureContext.appendReportFailure(resolveMessage(exception, "交付报告生成失败"));
            }
        }

        String summary = hasText(reportSummary)
                ? reportSummary
                : buildFallbackSummary(repositoryStates, skippedRepositories, failureContext);
        executionRun.setOutputSummary(summary);
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        if (failureContext != null) {
            throw new DevelopmentExecutionStepException(failureContext.failedStep(), failureContext.exception(), artifacts, summary);
        }
        return new DevelopmentExecutionResult(summary, artifacts, false, false);
    }

    private String executePlanStep(ExecutionTaskEntity executionTask,
                                   ExecutionRunEntity executionRun,
                                   TaskEntity workItem,
                                   ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                   List<ResolvedRepositoryContext> repositories,
                                   String input,
                                   int totalSteps,
                                   List<ExecutionArtifactEntity> artifacts,
                                   StructuringStepResult structuringResult) {
        ExecutionStepEntity step = beginStep(executionTask, executionRun, stepPlan, totalSteps, input);
        Map<String, String> variables = buildPlanRuntimeVariables(executionTask, executionRun, step, workItem, repositories, structuringResult);
        String output = executeStepAgent(stepPlan, executionTask, executionRun, step, input, variables);
        completeStep(executionTask, executionRun, stepPlan, totalSteps, step, output, "执行规划已完成");
        artifacts.add(saveArtifact(executionTask, executionRun, step, "PLAN_MARKDOWN", "执行规划 Markdown", output));
        return output;
    }

    private ImplementationStepResult executeImplementStep(ExecutionTaskEntity executionTask,
                                                          ExecutionRunEntity executionRun,
                                                          TaskEntity workItem,
                                                          ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                                          ResolvedRepositoryContext repository,
                                                          int repositoryIndex,
                                                          int repositoryTotal,
                                                          String input,
                                                          int totalSteps,
                                                          List<ExecutionArtifactEntity> artifacts) {
        ExecutionStepEntity step = beginStep(executionTask, executionRun, stepPlan, totalSteps, input);
        Map<String, String> variables = buildRuntimeVariables(executionTask, executionRun, step, workItem, repository, repositoryIndex, repositoryTotal, List.of());
        String output = executeStepAgent(stepPlan, executionTask, executionRun, step, input, variables);
        ImplementationStepResult result = parseImplementationResult(output);
        validateImplementationResult(result);
        String displayMarkdown = buildImplementationDisplayMarkdown(result);
        completeStep(executionTask, executionRun, stepPlan, totalSteps, step, displayMarkdown, defaultSuccessMessage(result.summary(), repository.repositoryDisplayName(), "开发实现"));
        artifacts.add(saveArtifact(executionTask, executionRun, step, "IMPLEMENT_RESULT_MARKDOWN", "实现结果 · " + repository.repositoryDisplayName(), displayMarkdown));
        artifacts.add(saveArtifact(executionTask, executionRun, step, "IMPLEMENT_RESULT_JSON", "实现结果 JSON · " + repository.repositoryDisplayName(), prettyJson(toJson(result))));
        artifacts.add(saveArtifact(executionTask, executionRun, step, "IMPLEMENT_LOG", "开发实现日志 · " + repository.repositoryDisplayName(), defaultString(result.log())));
        return result;
    }

    private TestStepResult executeTestStep(ExecutionTaskEntity executionTask,
                                           ExecutionRunEntity executionRun,
                                           TaskEntity workItem,
                                           ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                           ResolvedRepositoryContext repository,
                                           RepositoryExecutionState repositoryState,
                                           String input,
                                           int totalSteps,
                                           List<ExecutionArtifactEntity> artifacts) {
        List<String> commands = buildHarnessCommands(repositoryState.requireImplementationResult().changedFiles());
        TestExecutionPlan testPlan = buildTestPlan(repository, commands);
        ExecutionStepEntity step = beginStep(executionTask, executionRun, stepPlan, totalSteps, input);
        Map<String, String> variables = buildRuntimeVariables(executionTask, executionRun, step, workItem, repository, repositoryState.index(), repositoryState.total(), commands);
        variables.put("test_plan_json", prettyJson(toJson(testPlan)));
        variables.put("test_plan_markdown", buildTestPlanMarkdown(testPlan));
        artifacts.add(saveArtifact(
                executionTask,
                executionRun,
                step,
                "TEST_PLAN_JSON",
                "测试计划 JSON · " + repository.repositoryDisplayName(),
                prettyJson(toJson(testPlan))
        ));
        String output = executeStepAgent(stepPlan, executionTask, executionRun, step, input, variables);
        TestStepResult result = parseTestResult(output);
        artifacts.add(saveArtifact(
                executionTask,
                executionRun,
                step,
                "TEST_SUITE_RESULT_MARKDOWN",
                "测试 Suite 结果 · " + repository.repositoryDisplayName(),
                buildSuiteResultMarkdown(result)
        ));
        artifacts.add(saveArtifact(
                executionTask,
                executionRun,
                step,
                "TEST_SUITE_RESULT_JSON",
                "测试 Suite 结果 JSON · " + repository.repositoryDisplayName(),
                prettyJson(toJson(result.suiteResults()))
        ));
        artifacts.add(saveArtifact(executionTask, executionRun, step, "TEST_RESULT_MARKDOWN", "测试结果 · " + repository.repositoryDisplayName(), buildTestResultMarkdown(result)));
        artifacts.add(saveArtifact(executionTask, executionRun, step, "TEST_RESULT_JSON", "测试结果 JSON · " + repository.repositoryDisplayName(), prettyJson(output)));
        artifacts.add(saveArtifact(executionTask, executionRun, step, "TEST_LOG", "测试日志 · " + repository.repositoryDisplayName(), buildTestLog(result)));
        validateTestResult(result);
        completeStep(executionTask, executionRun, stepPlan, totalSteps, step, output, defaultSuccessMessage(result.summary(), repository.repositoryDisplayName(), "执行测试"));
        return result;
    }

    private String executeReportStep(ExecutionTaskEntity executionTask,
                                     ExecutionRunEntity executionRun,
                                     TaskEntity workItem,
                                     ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                     String input,
                                     int totalSteps,
                                     List<ExecutionArtifactEntity> artifacts) {
        ExecutionStepEntity step = beginStep(executionTask, executionRun, stepPlan, totalSteps, input);
        Map<String, String> variables = buildRuntimeVariables(executionTask, executionRun, step, workItem, null, 0, 0, List.of());
        String output = executeStepAgent(stepPlan, executionTask, executionRun, step, input, variables);
        completeStep(executionTask, executionRun, stepPlan, totalSteps, step, output, "交付报告已生成");
        artifacts.add(saveArtifact(executionTask, executionRun, step, "REPORT_MARKDOWN", "交付报告 Markdown", output));
        return extractReportSummary(output);
    }

    private StructuringStepResult executeStructuringStep(ExecutionTaskEntity executionTask,
                                                         ExecutionRunEntity executionRun,
                                                         TaskEntity workItem,
                                                         ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                                         List<ResolvedRepositoryContext> repositories,
                                                         String input,
                                                         int totalSteps) {
        ExecutionStepEntity step = beginStep(executionTask, executionRun, stepPlan, totalSteps, input);
        RepositoryStructuringClientService.StructuringSessionAcceptedResponse startResult =
                repositoryStructuringClientService.startStructuring(buildStructuringRequest(executionTask, executionRun, step, repositories, input));
        executionAsyncSessionService.bindRunnerSession(executionTask, executionRun, step, startResult.sessionId(), startResult.runnerType());
        ExecutionStepEntity completedStep = executionAsyncSessionService.awaitTerminalStep(
                step.getId(),
                executionAsyncSessionService.maxRuntimeSeconds(stepPlan.stepCode())
        );
        if ("CANCELED".equalsIgnoreCase(completedStep.getStatus())) {
            throw new DevelopmentExecutionCanceledException(resolveCanceledMessage(completedStep));
        }
        if (!"SUCCESS".equalsIgnoreCase(completedStep.getStatus())) {
            throw new IllegalStateException(defaultString(completedStep.getErrorMessage()).isBlank()
                    ? "仓库结构化失败"
                    : completedStep.getErrorMessage());
        }
        StructuringStepResult result = parseStructuringResult(defaultString(completedStep.getOutputSnapshot()));
        completeStep(
                executionTask,
                executionRun,
                stepPlan,
                totalSteps,
                completedStep,
                defaultString(completedStep.getOutputSnapshot()),
                hasText(result.summary()) ? result.summary() : STRUCTURING_SUCCESS_MESSAGE
        );
        return result;
    }

    private RepositoryStructuringClientService.RepositoryStructuringRequest buildStructuringRequest(ExecutionTaskEntity executionTask,
                                                                                                    ExecutionRunEntity executionRun,
                                                                                                    ExecutionStepEntity step,
                                                                                                    List<ResolvedRepositoryContext> repositories,
                                                                                                    String input) {
        List<RepositoryStructuringClientService.StructuringRepository> repositoryPayload = repositories.stream()
                .map(repository -> new RepositoryStructuringClientService.StructuringRepository(
                        String.valueOf(repository.bindingId()),
                        defaultString(repository.repositoryDisplayName()),
                        defaultString(repository.projectRef()),
                        defaultString(repository.projectPath()),
                        defaultString(repository.cloneUrl()),
                        defaultString(repository.targetBranch()),
                        trimToNull(repository.commitSha()),
                        defaultString(repository.apiBaseUrl()),
                        defaultString(repository.accessToken())
                ))
                .toList();
        return new RepositoryStructuringClientService.RepositoryStructuringRequest(
                defaultString(input),
                repositoryPayload,
                new RepositoryStructuringClientService.StructuringExecutionContext(
                        String.valueOf(executionTask.getId()),
                        String.valueOf(executionRun.getId()),
                        String.valueOf(step.getId()),
                        defaultString(step.getStepCode()),
                        defaultString(step.getStepName()),
                        String.valueOf(executionTask.getProject().getId()),
                        defaultString(executionTask.getProject().getName()),
                        "execution:" + executionTask.getId() + ":run:" + executionRun.getId() + ":step:" + step.getId(),
                        executionTask.getCreatedByUser() == null ? "" : String.valueOf(executionTask.getCreatedByUser().getId()),
                        resolveUserName(executionTask)
                ),
                executionAsyncSessionService.maxRuntimeSeconds(step.getStepCode())
        );
    }

    private boolean hasSuccessfulStep(ExecutionStepEntity existingStep,
                                      ExecutionWorkflowService.ExecutionStepPlan stepPlan) {
        return existingStep != null
                && "SUCCESS".equalsIgnoreCase(existingStep.getStatus())
                && stepPlan.stepNo().equals(existingStep.getStepNo())
                && defaultString(stepPlan.stepCode()).equalsIgnoreCase(existingStep.getStepCode());
    }

    private StructuringStepResult resolvePersistedStructuringResult(ExecutionStepEntity existingStructuringStep) {
        if (existingStructuringStep == null || !hasText(existingStructuringStep.getOutputSnapshot())) {
            return StructuringStepResult.empty();
        }
        return parseStructuringResult(existingStructuringStep.getOutputSnapshot());
    }

    /**
     * 结构化步骤只补充仓库快照与代码理解上下文，不改动仓库绑定、目标分支等业务字段。
     */
    private List<ResolvedRepositoryContext> applyStructuringResult(List<ResolvedRepositoryContext> repositories,
                                                                  StructuringStepResult structuringResult) {
        if (repositories == null || repositories.isEmpty() || structuringResult == null || structuringResult.repositories().isEmpty()) {
            return repositories;
        }
        Map<Long, RepositoryStructuringSummary> resultMap = new LinkedHashMap<>();
        for (RepositoryStructuringSummary item : structuringResult.repositories()) {
            if (item.bindingId() != null) {
                resultMap.put(item.bindingId(), item);
            }
        }
        List<ResolvedRepositoryContext> resolved = new ArrayList<>();
        for (ResolvedRepositoryContext repository : repositories) {
            RepositoryStructuringSummary item = resultMap.get(repository.bindingId());
            if (item == null) {
                resolved.add(repository);
                continue;
            }
            resolved.add(new ResolvedRepositoryContext(
                    repository.bindingId(),
                    repository.targetBranch(),
                    repository.repositoryDisplayName(),
                    repository.projectRef(),
                    repository.projectPath(),
                    repository.cloneUrl(),
                    repository.webUrl(),
                    repository.apiBaseUrl(),
                    repository.accessToken(),
                    repository.testProfileJson(),
                    hasText(item.commitSha()) ? item.commitSha() : repository.commitSha(),
                    hasText(item.structureMarkdown()) ? item.structureMarkdown() : repository.structureMarkdown(),
                    hasText(item.structureJson()) ? item.structureJson() : repository.structureJson(),
                    hasText(structuringResult.crossRepoContextMarkdown()) ? structuringResult.crossRepoContextMarkdown() : repository.crossRepoContextMarkdown(),
                    hasText(structuringResult.crossRepoContextJson()) ? structuringResult.crossRepoContextJson() : repository.crossRepoContextJson(),
                    item.degraded(),
                    hasText(item.degradationSummary()) ? item.degradationSummary() : repository.structuringMessage(),
                    item.harnessHints().isEmpty() ? repository.harnessHints() : item.harnessHints()
            ));
        }
        return resolved;
    }

    /**
     * 规划确认后恢复执行时，后续 IMPLEMENT / REPORT 必须读取用户最终保存的规划正文，
     * 不能退回到第一次 PLAN 运行时的临时内存副本。
     */
    private String resolvePersistedPlanMarkdown(ExecutionRunEntity executionRun,
                                               ExecutionStepEntity existingPlanStep) {
        if (existingPlanStep != null && hasText(existingPlanStep.getOutputSnapshot())) {
            return existingPlanStep.getOutputSnapshot();
        }
        return executionArtifactRepository.findFirstByRun_IdAndArtifactTypeAndTitle(
                        executionRun.getId(),
                        PLAN_ARTIFACT_TYPE,
                        PLAN_ARTIFACT_TITLE
                )
                .map(ExecutionArtifactEntity::getContentText)
                .filter(this::hasText)
                .orElse("");
    }

    /**
     * 规划确认模式只允许 PLAN 自动执行；规划完成后把任务和运行一起置为待确认，
     * 后端不再继续 IMPLEMENT / TEST / REPORT，直到发起人进入详情页确认。
     */
    private void pauseForPlanConfirmation(ExecutionTaskEntity executionTask,
                                          ExecutionRunEntity executionRun,
                                          ExecutionWorkflowService.ExecutionStepPlan planStep,
                                          int totalSteps) {
        executionRun.setStatus(STATUS_WAITING_CONFIRMATION);
        executionRun.setCurrentStepNo(planStep.stepNo());
        executionRun.setProgressPercent(planStep.stepNo() * 100 / Math.max(totalSteps, 1));
        executionRun.setOutputSummary(PLAN_CONFIRMATION_SUMMARY);
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        executionTask.setStatus(STATUS_WAITING_CONFIRMATION);
        executionTask.setCurrentRun(executionRun);
        executionTask.setLatestSummary("执行规划已完成，等待发起人确认");
        executionTaskRepository.save(executionTask);
    }

    private FailureContext markFailure(ExecutionTaskEntity executionTask,
                                       ExecutionRunEntity executionRun,
                                       ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                       int totalSteps,
                                       String inputSnapshot,
                                       RuntimeException exception) {
        ExecutionStepEntity step = beginStep(executionTask, executionRun, stepPlan, totalSteps, inputSnapshot);
        step.setStatus("FAILED");
        step.setProgressPercent(100);
        step.setLatestMessage(resolveMessage(exception, "执行失败"));
        step.setErrorMessage(resolveMessage(exception, "执行失败"));
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionEventService.recordSummary(executionTask, executionRun, step, step.getLatestMessage());
        executionEventService.recordStepFinished(executionTask, executionRun, step, step.getLatestMessage());
        executionRun.setCurrentStepNo(stepPlan.stepNo());
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);
        return new FailureContext(step, exception, null);
    }

    private ExecutionStepEntity beginStep(ExecutionTaskEntity executionTask,
                                          ExecutionRunEntity executionRun,
                                          ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                          int totalSteps,
                                          String inputSnapshot) {
        ExecutionStepEntity existingStep = executionStepRepository.findByRun_IdAndStepNo(executionRun.getId(), stepPlan.stepNo())
                .orElse(null);
        if (existingStep != null) {
            // 同一 run 内 stepNo 受唯一约束保护；重复进入同一步时必须复用旧记录，
            // 这样 async 失败回调和后续收口逻辑才能落在同一条步骤数据上。
            return existingStep;
        }

        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setRun(executionRun);
        step.setStepNo(stepPlan.stepNo());
        step.setStepCode(stepPlan.stepCode());
        step.setStepName(stepPlan.stepName());
        step.setAgent(stepPlan.agent());
        step.setStatus("RUNNING");
        step.setProgressPercent(0);
        step.setLatestMessage("执行中");
        step.setStartedAt(LocalDateTime.now());
        step.setInputSnapshot(defaultString(inputSnapshot));
        step = executionStepRepository.save(step);

        executionRun.setStatus("RUNNING");
        executionRun.setCurrentStepNo(stepPlan.stepNo());
        executionRun.setProgressPercent(Math.max((stepPlan.stepNo() - 1) * 100 / Math.max(totalSteps, 1), 0));
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        executionTask.setLatestSummary("执行中：" + stepPlan.stepName());
        executionTaskRepository.save(executionTask);
        executionEventService.recordStepStarted(executionTask, executionRun, step, "执行中：" + stepPlan.stepName());
        return step;
    }

    private void completeStep(ExecutionTaskEntity executionTask,
                              ExecutionRunEntity executionRun,
                              ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                              int totalSteps,
                              ExecutionStepEntity step,
                              String output,
                              String latestMessage) {
        step.setStatus("SUCCESS");
        step.setProgressPercent(100);
        step.setLatestMessage(limitMessage(latestMessage));
        step.setOutputSnapshot(defaultString(output));
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionEventService.recordSummary(executionTask, executionRun, step, step.getLatestMessage());

        executionRun.setCurrentStepNo(stepPlan.stepNo());
        executionRun.setProgressPercent(stepPlan.stepNo() * 100 / Math.max(totalSteps, 1));
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        executionTask.setLatestSummary(limitMessage(latestMessage));
        executionTaskRepository.save(executionTask);
        executionEventService.recordStepFinished(executionTask, executionRun, step, step.getLatestMessage());
    }

    private ExecutionArtifactEntity saveArtifact(ExecutionTaskEntity executionTask,
                                                 ExecutionRunEntity executionRun,
                                                 ExecutionStepEntity step,
                                                 String artifactType,
                                                 String title,
                                                 String contentText) {
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
        artifact.setRun(executionRun);
        artifact.setStep(step);
        artifact.setArtifactType(artifactType);
        artifact.setTitle(title);
        artifact.setContentText(contentText);
        artifact.setWorkItemWritebackFlag(false);
        ExecutionArtifactEntity savedArtifact = executionArtifactRepository.save(artifact);
        executionEventService.recordArtifactReady(executionTask, executionRun, step, savedArtifact.getId(), savedArtifact.getTitle());
        return savedArtifact;
    }

    private String executeStepAgent(ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                    ExecutionTaskEntity executionTask,
                                    ExecutionRunEntity executionRun,
                                    ExecutionStepEntity step,
                                    String input,
                                    Map<String, String> variables) {
        if (!agentExecutionService.supportsAsyncExecution(stepPlan.agent(), stepPlan.stepCode())) {
            return agentExecutionService.runAgent(stepPlan.agent().getId(), input, variables);
        }
        int maxRuntimeSeconds = executionAsyncSessionService.maxRuntimeSeconds(stepPlan.stepCode());
        AgentExecutionService.AsyncExecutionStartResult startResult = agentExecutionService.startAsyncExecution(
                stepPlan.agent(),
                input,
                variables,
                executionAsyncSessionService.submitTimeoutSeconds(),
                maxRuntimeSeconds
        );
        executionAsyncSessionService.bindRunnerSession(executionTask, executionRun, step, startResult.sessionId(), startResult.runnerType());
        ExecutionStepEntity completedStep = executionAsyncSessionService.awaitTerminalStep(
                step.getId(),
                maxRuntimeSeconds
        );
        if ("CANCELED".equalsIgnoreCase(completedStep.getStatus())) {
            throw new DevelopmentExecutionCanceledException(resolveCanceledMessage(completedStep));
        }
        if (!"SUCCESS".equalsIgnoreCase(completedStep.getStatus())) {
            throw new IllegalStateException(defaultString(completedStep.getErrorMessage()).isBlank()
                    ? "异步步骤执行失败"
                    : completedStep.getErrorMessage());
        }
        return defaultString(completedStep.getOutputSnapshot());
    }

    private DevelopmentExecutionResult canceledResult(List<ExecutionArtifactEntity> artifacts) {
        return new DevelopmentExecutionResult("执行任务已取消，未继续后续步骤。", artifacts, true, false);
    }

    private String resolveCanceledMessage(ExecutionStepEntity step) {
        if (step == null) {
            return "执行任务已取消";
        }
        if (hasText(step.getLatestMessage())) {
            return step.getLatestMessage();
        }
        if (hasText(step.getErrorMessage())) {
            return step.getErrorMessage();
        }
        return "执行任务已取消";
    }

    /**
     * 输入快照只保留可见上下文；敏感仓库凭据通过运行时变量透传，不回写到 UI 可见区域。
     */
    private Map<String, String> buildRuntimeVariables(ExecutionTaskEntity executionTask,
                                                      ExecutionRunEntity executionRun,
                                                      ExecutionStepEntity executionStep,
                                                      TaskEntity workItem,
                                                      ResolvedRepositoryContext repository,
                                                      int repositoryIndex,
                                                      int repositoryTotal,
                                                      List<String> commands) {
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
        variables.put("session_key", "execution:" + executionTask.getId() + ":run:" + executionRun.getId() + ":step:" + executionStep.getId());
        // HTTP_API 模板里会直接引用用户上下文字段；这里即使没有创建人也要补空串，避免残留 {{user_id_json}} 之类占位符把 JSON 拼坏。
        variables.put("user_id", executionTask.getCreatedByUser() == null ? "" : String.valueOf(executionTask.getCreatedByUser().getId()));
        variables.put("user_name", resolveUserName(executionTask));
        if (workItem != null) {
            variables.put("task_id", String.valueOf(workItem.getId()));
            variables.put("task_name", defaultString(workItem.getName()));
            variables.put("work_item_code", defaultString(workItem.getWorkItemCode()));
            variables.put("work_item_type", defaultString(workItem.getWorkItemType()));
        }
        if (repository != null) {
            variables.put("repo_binding_id", String.valueOf(repository.bindingId()));
            variables.put("repo_display_name", defaultString(repository.repositoryDisplayName()));
            variables.put("repo_target_branch", defaultString(repository.targetBranch()));
            variables.put("repo_project_ref", defaultString(repository.projectRef()));
            variables.put("repo_project_path", defaultString(repository.projectPath()));
            variables.put("repo_http_clone_url", defaultString(repository.cloneUrl()));
            variables.put("repo_web_url", defaultString(repository.webUrl()));
            variables.put("repo_api_base_url", defaultString(repository.apiBaseUrl()));
            variables.put("repo_access_token", defaultString(repository.accessToken()));
            variables.put("repo_commit_sha", defaultString(repository.commitSha()));
            variables.put("repo_index", String.valueOf(repositoryIndex));
            variables.put("repo_total", String.valueOf(repositoryTotal));
            variables.put("repo_structure_markdown", defaultString(repository.structureMarkdown()));
            variables.put("repo_structure_json", defaultString(repository.structureJson()));
            variables.put("repo_cross_repo_context_markdown", defaultString(repository.crossRepoContextMarkdown()));
            variables.put("repo_cross_repo_context_json", defaultString(repository.crossRepoContextJson()));
            variables.put("repo_structuring_degraded", String.valueOf(repository.structuringDegraded()));
            variables.put("repo_structuring_message", defaultString(repository.structuringMessage()));
            if (repository.harnessHints() != null && !repository.harnessHints().isEmpty()) {
                variables.put("repo_harness_hints_markdown", buildCommandMarkdown(repository.harnessHints()));
                variables.put("repo_harness_hints_json", toJson(repository.harnessHints()));
            }
        }
        if (commands != null && !commands.isEmpty()) {
            variables.put("test_commands_markdown", buildCommandMarkdown(commands));
            variables.put("test_commands_json", toJson(commands));
        }
        return variables;
    }

    /**
     * Claude Code 规划步骤需要一次性拿到全部仓库的结构化上下文，避免只靠 Markdown 输入再次做字符串解析。
     */
    private Map<String, String> buildPlanRuntimeVariables(ExecutionTaskEntity executionTask,
                                                          ExecutionRunEntity executionRun,
                                                          ExecutionStepEntity executionStep,
                                                          TaskEntity workItem,
                                                          List<ResolvedRepositoryContext> repositories,
                                                          StructuringStepResult structuringResult) {
        Map<String, String> variables = buildRuntimeVariables(
                executionTask,
                executionRun,
                executionStep,
                workItem,
                null,
                0,
                repositories == null ? 0 : repositories.size(),
                List.of()
        );
        List<Map<String, Object>> repositoryPayload = new ArrayList<>();
        if (repositories != null) {
            for (ResolvedRepositoryContext repository : repositories) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("bindingId", repository.bindingId());
                item.put("displayName", defaultString(repository.repositoryDisplayName()));
                item.put("projectRef", defaultString(repository.projectRef()));
                item.put("projectPath", defaultString(repository.projectPath()));
                item.put("repoUrl", defaultString(repository.cloneUrl()));
                item.put("webUrl", defaultString(repository.webUrl()));
                item.put("targetBranch", defaultString(repository.targetBranch()));
                item.put("commitSha", defaultString(repository.commitSha()));
                item.put("apiBaseUrl", defaultString(repository.apiBaseUrl()));
                item.put("authToken", defaultString(repository.accessToken()));
                item.put("structureMarkdown", defaultString(repository.structureMarkdown()));
                item.put("structureJson", defaultString(repository.structureJson()));
                item.put("crossRepoContextMarkdown", defaultString(repository.crossRepoContextMarkdown()));
                item.put("crossRepoContextJson", defaultString(repository.crossRepoContextJson()));
                item.put("structuringDegraded", repository.structuringDegraded());
                item.put("structuringMessage", defaultString(repository.structuringMessage()));
                item.put("harnessHints", repository.harnessHints() == null ? List.of() : repository.harnessHints());
                repositoryPayload.add(item);
            }
        }
        variables.put("development_repositories_json", toJson(repositoryPayload));
        variables.put("development_repository_count", String.valueOf(repositoryPayload.size()));
        variables.put("repository_structuring_json", structuringResult == null ? "" : defaultString(structuringResult.rawOutput()));
        variables.put("cross_repo_context_markdown", structuringResult == null ? "" : defaultString(structuringResult.crossRepoContextMarkdown()));
        variables.put("cross_repo_context_json", structuringResult == null ? "" : defaultString(structuringResult.crossRepoContextJson()));
        variables.put("structuring_degraded", String.valueOf(structuringResult != null && structuringResult.degraded()));
        variables.put("structuring_summary", structuringResult == null ? "" : defaultString(structuringResult.summary()));
        return variables;
    }

    private String buildStructuringInput(ExecutionTaskEntity executionTask,
                                         TaskEntity workItem,
                                         List<ResolvedRepositoryContext> repositories,
                                         String inputText) {
        StringBuilder builder = new StringBuilder();
        appendTaskContext(builder, executionTask, workItem);
        if (hasText(inputText)) {
            builder.append("## 用户补充说明\n")
                    .append(inputText.trim())
                    .append("\n\n");
        }
        builder.append("## 待结构化仓库\n");
        for (int index = 0; index < repositories.size(); index++) {
            ResolvedRepositoryContext repository = repositories.get(index);
            builder.append(index + 1)
                    .append(". ")
                    .append(defaultString(repository.repositoryDisplayName()))
                    .append(" / 目标分支：")
                    .append(defaultString(repository.targetBranch()))
                    .append('\n');
        }
        builder.append("\n## 输出要求\n")
                .append("- 拉取仓库并固定 commit SHA\n")
                .append("- 优先使用 GitNexus 生成模块、符号与影响范围摘要\n")
                .append("- 为每个仓库输出结构化 JSON 与 Markdown 摘要\n")
                .append("- GitNexus 不可用时允许降级，但要明确说明降级原因\n");
        return builder.toString().trim();
    }

    private String buildPlanInput(ExecutionTaskEntity executionTask,
                                  TaskEntity workItem,
                                  List<ResolvedRepositoryContext> repositories,
                                  String inputText,
                                  StructuringStepResult structuringResult) {
        StringBuilder builder = new StringBuilder();
        appendTaskContext(builder, executionTask, workItem);
        if (hasText(inputText)) {
            builder.append("## 用户补充说明\n")
                    .append(inputText.trim())
                    .append("\n\n");
        }
        appendStructuringContext(builder, repositories, structuringResult, true);
        builder.append("## 涉及仓库\n");
        for (int index = 0; index < repositories.size(); index++) {
            ResolvedRepositoryContext repository = repositories.get(index);
            builder.append(index + 1)
                    .append(". ")
                    .append(defaultString(repository.repositoryDisplayName()))
                    .append(" / 目标分支：")
                    .append(defaultString(repository.targetBranch()));
            if (hasText(repository.commitSha())) {
                builder.append(" / 固定提交：").append(repository.commitSha().trim());
            }
            builder.append('\n');
        }
        builder.append("\n## 输出要求\n")
                .append("- 使用 Markdown\n")
                .append("- 先给出总体实施路径和仓库执行顺序\n")
                .append("- 每个仓库都要指出候选改动目录、文件或模块，以及预期改动类型\n")
                .append("- 明确跨仓依赖、风险、待人工确认项和后续 IMPLEMENT / TEST 的关注点\n")
                .append("- 如果暂时无法确定修改位置，也要写出已检查过的目录和当前不确定点\n");
        if (structuringResult != null && structuringResult.degraded()) {
            builder.append("- 仓库结构化存在降级结果，请明确标记哪些判断仍需人工复核\n");
        }
        return builder.toString().trim();
    }

    private String buildImplementInput(ExecutionTaskEntity executionTask,
                                       TaskEntity workItem,
                                       ResolvedRepositoryContext repository,
                                       int repositoryIndex,
                                       int repositoryTotal,
                                       String inputText,
                                       String planMarkdown,
                                       StructuringStepResult structuringResult) {
        String implementPlanContext = buildImplementPlanContext(planMarkdown, repository);
        StringBuilder builder = new StringBuilder();
        appendTaskContext(builder, executionTask, workItem);
        builder.append("## 当前仓库\n")
                .append("仓库：").append(defaultString(repository.repositoryDisplayName())).append('\n')
                .append("仓库序号：").append(repositoryIndex).append(" / ").append(repositoryTotal).append('\n')
                .append("目标分支：").append(defaultString(repository.targetBranch())).append('\n')
                .append("项目标识：").append(defaultString(repository.projectRef())).append('\n')
                .append("Clone 地址：").append(defaultString(repository.cloneUrl())).append('\n');
        if (hasText(repository.commitSha())) {
            builder.append("固定提交：").append(repository.commitSha().trim()).append('\n');
        }
        builder.append('\n');
        if (hasText(inputText)) {
            builder.append("## 用户补充说明\n")
                    .append(inputText.trim())
                    .append("\n\n");
        }
        appendRepositoryStructuringContext(builder, repository, structuringResult);
        if (hasText(implementPlanContext)) {
            builder.append("## 执行规划摘要\n")
                    .append(implementPlanContext.trim())
                    .append('\n');
        }
        if (builder.length() > 0 && builder.charAt(builder.length() - 1) != '\n') {
            builder.append('\n');
        }
        builder.append("## 输出要求\n")
                .append("请直接返回 Markdown 说明，不要返回 JSON，也不要把 JSON 放进代码块。\n")
                .append("- 先写执行状态（SUCCESS 或 FAILED）和结果摘要\n")
                .append("- 按文件或模块说明改了哪里、为什么改\n")
                .append("- 列出实际执行过的验证命令；未执行验证也要说明原因\n")
                .append("- 写清风险、阻塞项或后续建议\n")
                .append("- 平台会自动基于工作区 git 状态整理 changedFiles、workBranch、commitSha，无需你手写结构化字段\n");
        return builder.toString().trim();
    }

    /**
     * IMPLEMENT 只需要当前仓库的关键信息；这里提炼总体结论和当前仓库段落，避免把整份规划原文直接塞给 Codex 导致超时。
     */
    private String buildImplementPlanContext(String planMarkdown, ResolvedRepositoryContext repository) {
        String normalized = defaultString(planMarkdown).trim();
        if (normalized.isBlank()) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        String overallSection = extractTopLevelSection(normalized, "# 总体结论", "# 仓库执行顺序");
        if (hasText(overallSection)) {
            builder.append("### 总体结论\n")
                    .append(limitContent(overallSection, 1200))
                    .append("\n\n");
        }
        String repositorySection = extractRepositoryPlanningSection(normalized, repository.repositoryDisplayName());
        if (hasText(repositorySection)) {
            builder.append("### 当前仓库规划\n")
                    .append(limitContent(repositorySection, 2200))
                    .append("\n\n");
        }
        if (builder.length() == 0) {
            builder.append(limitContent(normalized, IMPLEMENT_PLAN_CONTEXT_MAX_LENGTH));
        }
        if (builder.length() > IMPLEMENT_PLAN_CONTEXT_MAX_LENGTH) {
            return limitContent(builder.toString().trim(), IMPLEMENT_PLAN_CONTEXT_MAX_LENGTH);
        }
        return builder.toString().trim();
    }

    private String extractTopLevelSection(String markdown, String startHeading, String nextHeading) {
        int startIndex = markdown.indexOf(startHeading);
        if (startIndex < 0) {
            return "";
        }
        int contentStart = startIndex + startHeading.length();
        int endIndex = markdown.indexOf(nextHeading, contentStart);
        String section = endIndex >= 0 ? markdown.substring(contentStart, endIndex) : markdown.substring(contentStart);
        return section.trim();
    }

    private String extractRepositoryPlanningSection(String markdown, String repositoryDisplayName) {
        if (!hasText(repositoryDisplayName)) {
            return "";
        }
        String[] lines = markdown.split("\\R");
        boolean inRepositoryPlanning = false;
        boolean capturing = false;
        StringBuilder builder = new StringBuilder();
        for (String line : lines) {
            String trimmed = line.trim();
            if ("# 仓库规划".equals(trimmed)) {
                inRepositoryPlanning = true;
                continue;
            }
            if (!inRepositoryPlanning) {
                continue;
            }
            if (trimmed.startsWith("# ") && !"# 仓库规划".equals(trimmed)) {
                break;
            }
            if (trimmed.startsWith("## ")) {
                if (capturing) {
                    break;
                }
                if (trimmed.contains(repositoryDisplayName)) {
                    capturing = true;
                }
            }
            if (capturing) {
                builder.append(line).append('\n');
            }
        }
        return builder.toString().trim();
    }

    private String limitContent(String content, int maxLength) {
        String normalized = defaultString(content).trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        int safeLength = Math.max(maxLength - 18, 0);
        return normalized.substring(0, safeLength).trim() + "\n\n[规划摘要已截断]";
    }

    private String buildTestInput(ExecutionTaskEntity executionTask,
                                  TaskEntity workItem,
                                  ResolvedRepositoryContext repository,
                                  RepositoryExecutionState repositoryState,
                                  String inputText,
                                  StructuringStepResult structuringResult) {
        List<String> commands = buildHarnessCommands(repositoryState.requireImplementationResult().changedFiles());
        TestExecutionPlan testPlan = buildTestPlan(repository, commands);
        StringBuilder builder = new StringBuilder();
        appendTaskContext(builder, executionTask, workItem);
        builder.append("## 当前仓库\n")
                .append("仓库：").append(defaultString(repository.repositoryDisplayName())).append('\n')
                .append("目标分支：").append(defaultString(repository.targetBranch())).append('\n');
        if (hasText(repository.commitSha())) {
            builder.append("固定提交：").append(repository.commitSha().trim()).append('\n');
        }
        builder.append('\n');
        if (hasText(inputText)) {
            builder.append("## 用户补充说明\n")
                    .append(inputText.trim())
                    .append("\n\n");
        }
        appendRepositoryStructuringContext(builder, repository, structuringResult);
        builder.append("## 开发实现结果\n")
                .append(prettyJson(repositoryState.implementationRawOutput()))
                .append("\n\n")
                .append("## 仓库结构化给出的 Harness 提示\n")
                .append(buildCommandMarkdown(repository.harnessHints()))
                .append("\n")
                .append("## 平台建议执行的 Harness 命令\n")
                .append(buildCommandMarkdown(commands))
                .append("\n")
                .append("## 平台生成的测试计划\n")
                .append(buildTestPlanMarkdown(testPlan))
                .append("\n")
                .append("## 输出要求\n")
                .append("请返回 JSON，不要输出 Markdown 代码块围栏。字段必须包含：\n")
                .append("- status\n")
                .append("- summary\n")
                .append("- suiteResults[]，每项必须包含 suiteId/type/status/summary/checks/artifacts/commandResults\n")
                .append("- rawArtifacts[]，用于补充 sidecar 生成的截图、trace 和日志文件摘要\n");
        return builder.toString().trim();
    }

    private String buildReportInput(ExecutionTaskEntity executionTask,
                                    TaskEntity workItem,
                                    List<ResolvedRepositoryContext> repositories,
                                    List<RepositoryExecutionState> repositoryStates,
                                    List<ResolvedRepositoryContext> skippedRepositories,
                                    String inputText,
                                    String planMarkdown,
                                    StructuringStepResult structuringResult,
                                    FailureContext failureContext) {
        StringBuilder builder = new StringBuilder();
        appendTaskContext(builder, executionTask, workItem);
        if (hasText(inputText)) {
            builder.append("## 用户补充说明\n")
                    .append(inputText.trim())
                    .append("\n\n");
        }
        if (hasText(planMarkdown)) {
            builder.append("## 执行规划\n")
                    .append(planMarkdown.trim())
                    .append("\n\n");
        }
        appendStructuringContext(builder, repositories, structuringResult, false);
        builder.append("## 仓库执行结果\n");
        for (RepositoryExecutionState state : repositoryStates) {
            builder.append("### ")
                    .append(defaultString(state.repository().repositoryDisplayName()))
                    .append('\n')
                    .append("- 开发摘要：")
                    .append(state.implementationResult() == null ? "未执行或执行失败" : defaultString(state.implementationResult().summary()))
                    .append('\n')
                    .append("- 测试摘要：")
                    .append(state.testResult() == null ? "未执行或执行失败" : defaultString(state.testResult().summary()))
                    .append('\n');
            if (hasText(state.implementationRawOutput())) {
                builder.append("- 开发结果 JSON：").append(prettyJson(state.implementationRawOutput())).append('\n');
            }
            if (hasText(state.testRawOutput())) {
                builder.append("- 测试结果 JSON：").append(prettyJson(state.testRawOutput())).append('\n');
            }
        }
        if (failureContext != null) {
            builder.append("\n## 失败信息\n")
                    .append("- 失败步骤：").append(defaultString(failureContext.failedStep().getStepName())).append('\n')
                    .append("- 失败原因：").append(resolveMessage(failureContext.exception(), "执行失败")).append('\n');
        }
        if (!skippedRepositories.isEmpty()) {
            builder.append("\n## 未执行仓库\n");
            for (ResolvedRepositoryContext repository : skippedRepositories) {
                builder.append("- ")
                        .append(defaultString(repository.repositoryDisplayName()))
                        .append(" / 目标分支：")
                        .append(defaultString(repository.targetBranch()))
                        .append('\n');
            }
        } else if (!repositories.isEmpty()) {
            builder.append("\n## 执行覆盖说明\n- 所选仓库均已完成预期步骤\n");
        }
        builder.append("\n## 报告要求\n")
                .append("- 使用 Markdown\n")
                .append("- 先给出结论，再说明每个仓库的开发与测试结果\n")
                .append("- 明确失败仓库、失败步骤和剩余风险\n")
                .append("- 明确注明：第一版未执行源码模式跨服务联调\n");
        return builder.toString().trim();
    }

    private void appendStructuringContext(StringBuilder builder,
                                          List<ResolvedRepositoryContext> repositories,
                                          StructuringStepResult structuringResult,
                                          boolean includePerRepositoryMarkdown) {
        if ((repositories == null || repositories.isEmpty())
                && (structuringResult == null || !hasText(structuringResult.crossRepoContextMarkdown()))) {
            return;
        }
        builder.append("## 仓库结构化结果\n");
        if (structuringResult != null && hasText(structuringResult.summary())) {
            builder.append("- 结构化摘要：").append(structuringResult.summary().trim()).append('\n');
        }
        if (structuringResult != null && structuringResult.degraded()) {
            builder.append("- 结构化状态：存在降级，请对 GitNexus 结论保留人工复核\n");
        } else {
            builder.append("- 结构化状态：已生成可复用的代码上下文\n");
        }
        if (repositories != null) {
            for (ResolvedRepositoryContext repository : repositories) {
                builder.append("- ")
                        .append(defaultString(repository.repositoryDisplayName()))
                        .append(" / 目标分支：")
                        .append(defaultString(repository.targetBranch()));
                if (hasText(repository.commitSha())) {
                    builder.append(" / 固定提交：").append(repository.commitSha().trim());
                }
                if (repository.structuringDegraded()) {
                    builder.append(" / 降级：").append(defaultString(repository.structuringMessage()));
                }
                builder.append('\n');
            }
        }
        builder.append('\n');
        if (structuringResult != null && hasText(structuringResult.crossRepoContextMarkdown())) {
            builder.append("### 跨仓上下文\n")
                    .append(structuringResult.crossRepoContextMarkdown().trim())
                    .append("\n\n");
        }
        if (includePerRepositoryMarkdown && repositories != null) {
            for (ResolvedRepositoryContext repository : repositories) {
                if (!hasText(repository.structureMarkdown())) {
                    continue;
                }
                builder.append("### 仓库结构化 · ")
                        .append(defaultString(repository.repositoryDisplayName()))
                        .append('\n')
                        .append(repository.structureMarkdown().trim())
                        .append("\n\n");
            }
        }
    }

    private void appendRepositoryStructuringContext(StringBuilder builder,
                                                    ResolvedRepositoryContext repository,
                                                    StructuringStepResult structuringResult) {
        if (repository == null) {
            return;
        }
        builder.append("## 仓库结构化摘要\n");
        if (repository.structuringDegraded()) {
            builder.append("- 状态：已降级，需人工复核\n")
                    .append("- 原因：").append(defaultString(repository.structuringMessage())).append('\n');
        } else {
            builder.append("- 状态：结构化成功\n");
        }
        if (hasText(repository.commitSha())) {
            builder.append("- 固定提交：").append(repository.commitSha().trim()).append('\n');
        }
        if (repository.harnessHints() != null && !repository.harnessHints().isEmpty()) {
            builder.append("- Harness 提示：\n")
                    .append(buildCommandMarkdown(repository.harnessHints()))
                    .append('\n');
        }
        if (hasText(repository.structureMarkdown())) {
            builder.append('\n')
                    .append(repository.structureMarkdown().trim())
                    .append("\n\n");
        } else if (structuringResult != null && structuringResult.degraded()) {
            builder.append("- 未生成该仓库的细粒度结构摘要，请结合真实代码二次确认\n\n");
        } else {
            builder.append('\n');
        }
        if (hasText(repository.crossRepoContextMarkdown())) {
            builder.append("### 跨仓提示\n")
                    .append(repository.crossRepoContextMarkdown().trim())
                    .append("\n\n");
        }
    }

    private StructuringStepResult parseStructuringResult(String rawOutput) {
        String normalized = trimToNull(rawOutput);
        if (normalized == null) {
            return StructuringStepResult.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(normalized);
            List<RepositoryStructuringSummary> repositories = new ArrayList<>();
            for (JsonNode repositoryNode : root.path("repositories")) {
                repositories.add(new RepositoryStructuringSummary(
                        asLong(repositoryNode.path("repoBindingId")),
                        repositoryNode.path("repoDisplayName").asText(""),
                        repositoryNode.path("targetBranch").asText(""),
                        repositoryNode.path("commitSha").asText(""),
                        repositoryNode.path("degraded").asBoolean(false),
                        repositoryNode.path("degradationSummary").asText(""),
                        repositoryNode.path("structureMarkdown").asText(""),
                        prettyJson(repositoryNode.toString()),
                        readStringList(repositoryNode.path("harnessHints"))
                ));
            }
            return new StructuringStepResult(
                    root.path("summary").asText(""),
                    root.path("degraded").asBoolean(false),
                    root.path("crossRepoContextMarkdown").asText(""),
                    root.path("crossRepoContextJson").isMissingNode() ? "" : prettyJson(root.path("crossRepoContextJson").toString()),
                    repositories,
                    normalized
            );
        } catch (Exception exception) {
            throw new IllegalStateException("仓库结构化步骤未返回合法 JSON", exception);
        }
    }

    private void appendTaskContext(StringBuilder builder, ExecutionTaskEntity executionTask, TaskEntity workItem) {
        builder.append("执行任务：").append(defaultString(executionTask.getTitle())).append('\n')
                .append("场景：开发执行\n\n");
        if (workItem != null) {
            builder.append("## 工作项上下文\n")
                    .append("标题：").append(defaultString(workItem.getName())).append('\n')
                    .append("编号：").append(defaultString(workItem.getWorkItemCode())).append('\n')
                    .append("类型：").append(defaultString(workItem.getWorkItemType())).append('\n')
                    .append("状态：").append(defaultString(workItem.getStatus())).append('\n')
                    .append("优先级：").append(defaultString(workItem.getPriority())).append('\n')
                    .append("负责人：").append(defaultString(workItem.getAssignee())).append('\n')
                    .append("说明：").append(defaultString(workItem.getDescription())).append("\n\n");
        }
    }

    private DevelopmentTaskPayload readPayload(String inputPayload) {
        try {
            JsonNode node = objectMapper.readTree(inputPayload);
            List<RepositoryRequest> repositories = new ArrayList<>();
            for (JsonNode repositoryNode : node.path("repositories")) {
                repositories.add(new RepositoryRequest(
                        repositoryNode.path("bindingId").asLong(),
                        repositoryNode.path("targetBranch").asText("")
                ));
            }
            return new DevelopmentTaskPayload(
                    node.path("inputText").asText(""),
                    node.path("planConfirmationRequired").asBoolean(false),
                    repositories
            );
        } catch (Exception exception) {
            throw new IllegalStateException("开发执行输入载荷解析失败", exception);
        }
    }

    private List<ResolvedRepositoryContext> resolveRepositories(Long projectId, List<RepositoryRequest> repositories) {
        List<ResolvedRepositoryContext> result = new ArrayList<>();
        for (RepositoryRequest request : repositories) {
            ProjectGitlabBindingEntity binding = requireBinding(projectId, request.bindingId());
            String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
            ProjectGitlabBindingEntity refreshedBinding = refreshCloneUrlsIfRequired(binding, token);
            result.add(new ResolvedRepositoryContext(
                    refreshedBinding.getId(),
                    request.targetBranch().trim(),
                    resolveRepositoryDisplayName(refreshedBinding),
                    defaultString(refreshedBinding.getGitlabProjectRef()),
                    defaultString(refreshedBinding.getGitlabProjectPath()),
                    defaultString(resolveCloneUrl(refreshedBinding)),
                    defaultString(refreshedBinding.getGitlabProjectWebUrl()),
                    defaultString(refreshedBinding.getApiBaseUrl()),
                    token,
                    defaultString(refreshedBinding.getTestProfileJson()),
                    "",
                    "",
                    "",
                    "",
                    "",
                    false,
                    "",
                    List.of()
            ));
        }
        return result;
    }

    /**
     * 如果绑定仓库还没有 clone 地址，这里即时回源 GitLab 刷新一次，避免真实开发执行缺少仓库入口。
     */
    private ProjectGitlabBindingEntity refreshCloneUrlsIfRequired(ProjectGitlabBindingEntity binding, String token) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding;
        }
        GitlabApiService.GitlabProject project = gitlabApiService.fetchProject(binding.getApiBaseUrl(), token, binding.getGitlabProjectRef());
        binding.setGitlabProjectId(project.id());
        binding.setGitlabProjectName(project.name());
        binding.setGitlabProjectPath(project.pathWithNamespace());
        binding.setGitlabProjectWebUrl(project.webUrl());
        binding.setGitlabHttpCloneUrl(project.httpCloneUrl());
        binding.setGitlabSshCloneUrl(project.sshCloneUrl());
        if (!hasText(binding.getDefaultTargetBranch()) && hasText(project.defaultBranch())) {
            binding.setDefaultTargetBranch(project.defaultBranch());
        }
        return projectGitlabBindingRepository.save(binding);
    }

    private ProjectGitlabBindingEntity requireBinding(Long projectId, Long bindingId) {
        ProjectGitlabBindingEntity binding = projectGitlabBindingRepository.findById(bindingId)
                .orElseThrow(() -> new NoSuchElementException("GitLab 绑定不存在: " + bindingId));
        if (!binding.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("开发执行仓库必须属于当前项目");
        }
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            throw new IllegalArgumentException("所选 GitLab 绑定已停用");
        }
        return binding;
    }

    private String resolveCloneUrl(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding.getGitlabHttpCloneUrl().trim();
        }
        if (hasText(binding.getGitlabProjectWebUrl())) {
            String webUrl = binding.getGitlabProjectWebUrl().trim();
            return webUrl.endsWith(".git") ? webUrl : webUrl + ".git";
        }
        return null;
    }

    private String resolveRepositoryDisplayName(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabProjectPath())) {
            return binding.getGitlabProjectPath().trim();
        }
        if (hasText(binding.getGitlabProjectRef())) {
            return binding.getGitlabProjectRef().trim();
        }
        return "GitLab 绑定 #" + binding.getId();
    }

    /**
     * TEST 计划由 backend 统一生成，code-processing 只负责按 suite 类型执行。
     */
    private TestExecutionPlan buildTestPlan(ResolvedRepositoryContext repository, List<String> commands) {
        List<TestSuitePlan> suites = new ArrayList<>();
        suites.add(buildCommandSuite(commands));
        TestProfileConfig profile = parseTestProfile(repository.testProfileJson());
        if (profile == null) {
            return new TestExecutionPlan(suites);
        }
        String repoKind = defaultString(profile.repoKind()).trim().toUpperCase();
        if ("FRONTEND".equals(repoKind) || "MIXED".equals(repoKind)) {
            suites.add(buildPlaywrightSuite(profile));
        }
        if ("BACKEND".equals(repoKind) || "MIXED".equals(repoKind)) {
            suites.add(buildServiceSuite(profile));
        }
        return new TestExecutionPlan(suites);
    }

    private TestSuitePlan buildCommandSuite(List<String> commands) {
        if (commands == null || commands.isEmpty()) {
            return new TestSuitePlan(
                    "command",
                    "COMMAND",
                    "SKIPPED",
                    "当前仓库未命中额外 Harness 命令",
                    "",
                    List.of(),
                    "",
                    "",
                    "",
                    List.of(),
                    "",
                    "",
                    List.of()
            );
        }
        return new TestSuitePlan(
                "command",
                "COMMAND",
                "PENDING",
                "等待执行命令型 Harness",
                "",
                commands,
                "",
                "",
                "",
                List.of(),
                "",
                "",
                List.of()
        );
    }

    private TestSuitePlan buildPlaywrightSuite(TestProfileConfig profile) {
        return new TestSuitePlan(
                "playwright-smoke",
                "PLAYWRIGHT_SMOKE",
                "PENDING",
                "等待执行浏览器烟测",
                trimToNull(profile.workingDir()),
                List.of(),
                trimToNull(profile.packageManager()),
                trimToNull(profile.startCommand()),
                trimToNull(profile.baseUrl()),
                normalizeSmokePaths(profile.smokePaths()),
                trimToNull(profile.readySelector()),
                "",
                List.of()
        );
    }

    private TestSuitePlan buildServiceSuite(TestProfileConfig profile) {
        boolean missingChecks = !hasText(profile.healthPath()) && (profile.httpChecks() == null || profile.httpChecks().isEmpty());
        if (!hasText(profile.startCommand()) || missingChecks) {
            return new TestSuitePlan(
                    "service-smoke",
                    "SERVICE_SMOKE",
                    "SKIPPED",
                    !hasText(profile.startCommand()) ? "缺少 startCommand，已跳过服务烟测" : "缺少 healthPath/httpChecks，已跳过服务烟测",
                    trimToNull(profile.workingDir()),
                    List.of(),
                    trimToNull(profile.packageManager()),
                    trimToNull(profile.startCommand()),
                    trimToNull(profile.baseUrl()),
                    List.of(),
                    "",
                    trimToNull(profile.healthPath()),
                    profile.httpChecks() == null ? List.of() : profile.httpChecks()
            );
        }
        return new TestSuitePlan(
                "service-smoke",
                "SERVICE_SMOKE",
                "PENDING",
                "等待执行服务集成烟测",
                trimToNull(profile.workingDir()),
                List.of(),
                trimToNull(profile.packageManager()),
                trimToNull(profile.startCommand()),
                trimToNull(profile.baseUrl()),
                List.of(),
                "",
                trimToNull(profile.healthPath()),
                profile.httpChecks() == null ? List.of() : profile.httpChecks()
        );
    }

    /**
     * 测试模板当前以 JSON 文本保存在仓库绑定上；这里做宽松解析，避免历史空值直接阻断旧绑定执行。
     */
    private TestProfileConfig parseTestProfile(String rawJson) {
        if (!hasText(rawJson)) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(rawJson);
            List<TestHttpCheckPlan> httpChecks = new ArrayList<>();
            for (JsonNode item : root.path("httpChecks")) {
                httpChecks.add(new TestHttpCheckPlan(
                        item.path("name").asText(""),
                        item.path("method").asText("GET"),
                        item.path("path").asText(""),
                        item.hasNonNull("expectedStatus") ? item.get("expectedStatus").asInt() : 200
                ));
            }
            return new TestProfileConfig(
                    root.path("repoKind").asText(""),
                    root.path("workingDir").asText(""),
                    root.path("packageManager").asText(""),
                    root.path("startCommand").asText(""),
                    root.path("baseUrl").asText(""),
                    readStringList(root.path("smokePaths")),
                    root.path("readySelector").asText(""),
                    root.path("healthPath").asText(""),
                    httpChecks
            );
        } catch (Exception exception) {
            throw new IllegalStateException("仓库绑定中的 testProfileJson 不是合法 JSON", exception);
        }
    }

    private List<String> normalizeSmokePaths(List<String> smokePaths) {
        List<String> normalized = new ArrayList<>();
        if (smokePaths != null) {
            for (String item : smokePaths) {
                String path = trimToNull(item);
                if (path != null) {
                    normalized.add(path);
                }
            }
        }
        if (normalized.isEmpty()) {
            normalized.add("/");
        }
        return normalized;
    }

    private String buildTestPlanMarkdown(TestExecutionPlan plan) {
        StringBuilder builder = new StringBuilder();
        builder.append("# 测试计划\n\n");
        if (plan == null || plan.suites() == null || plan.suites().isEmpty()) {
            builder.append("- 暂无 suite 计划\n");
            return builder.toString().trim();
        }
        for (TestSuitePlan suite : plan.suites()) {
            builder.append("## ").append(defaultString(suite.type())).append(" / ").append(defaultString(suite.suiteId())).append("\n\n")
                    .append("- 计划状态：").append(defaultString(suite.status())).append('\n')
                    .append("- 计划摘要：").append(defaultString(suite.summary())).append('\n');
            if (hasText(suite.workingDir())) {
                builder.append("- 工作目录：`").append(suite.workingDir().trim()).append("`\n");
            }
            if (suite.commands() != null && !suite.commands().isEmpty()) {
                builder.append("- 命令数：").append(suite.commands().size()).append('\n');
            }
            if (hasText(suite.startCommand())) {
                builder.append("- 启动命令：`").append(suite.startCommand().trim()).append("`\n");
            }
            if (suite.smokePaths() != null && !suite.smokePaths().isEmpty()) {
                builder.append("- 烟测页面：").append(String.join("、", suite.smokePaths())).append('\n');
            }
            if (hasText(suite.healthPath())) {
                builder.append("- 健康检查：`").append(suite.healthPath().trim()).append("`\n");
            }
            if (suite.httpChecks() != null && !suite.httpChecks().isEmpty()) {
                builder.append("- HTTP 检查数：").append(suite.httpChecks().size()).append('\n');
            }
            builder.append('\n');
        }
        return builder.toString().trim();
    }

    private List<String> buildHarnessCommands(List<String> changedFiles) {
        Set<String> commands = new LinkedHashSet<>();
        commands.add("python scripts/check_encoding.py");
        for (String changedFile : changedFiles) {
            String normalized = defaultString(changedFile).replace("\\", "/").trim();
            if (isBackendChange(normalized)) {
                commands.add("cd backend && mvn -s maven-settings-central.xml test");
            }
            if (isFrontendChange(normalized)) {
                commands.add("cd frontend && npm run build");
            }
            if (isCodeProcessingChange(normalized)) {
                commands.add("cd code-processing && pip install -e .");
            }
        }
        return new ArrayList<>(commands);
    }

    private List<String> readStringList(JsonNode node) {
        List<String> result = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return result;
        }
        for (JsonNode item : node) {
            result.add(item.asText(""));
        }
        return result;
    }

    /**
     * 兼容平台 monorepo 与“仓库根目录就是单个 Maven 服务”的场景。
     */
    private boolean isBackendChange(String normalizedPath) {
        return normalizedPath.startsWith("backend/")
                || normalizedPath.startsWith("src/main/")
                || normalizedPath.startsWith("src/test/")
                || normalizedPath.endsWith(".java")
                || normalizedPath.endsWith(".kt")
                || "pom.xml".equalsIgnoreCase(normalizedPath);
    }

    /**
     * 兼容平台 monorepo 与“仓库根目录就是单个前端工程”的场景。
     */
    private boolean isFrontendChange(String normalizedPath) {
        return normalizedPath.startsWith("frontend/")
                || normalizedPath.endsWith(".vue")
                || normalizedPath.endsWith(".tsx")
                || normalizedPath.endsWith(".jsx")
                || normalizedPath.endsWith(".scss")
                || normalizedPath.endsWith(".less")
                || normalizedPath.endsWith(".css")
                || normalizedPath.endsWith(".html")
                || normalizedPath.equals("package.json")
                || normalizedPath.equals("package-lock.json")
                || normalizedPath.equals("pnpm-lock.yaml")
                || normalizedPath.equals("yarn.lock")
                || normalizedPath.equals("vite.config.ts")
                || normalizedPath.equals("vite.config.js")
                || normalizedPath.equals("tsconfig.json");
    }

    /**
     * 兼容平台 monorepo 与“仓库根目录就是单个 Python 工程”的场景。
     */
    private boolean isCodeProcessingChange(String normalizedPath) {
        return normalizedPath.startsWith("code-processing/")
                || normalizedPath.startsWith("app/")
                || normalizedPath.endsWith(".py")
                || normalizedPath.equals("pyproject.toml")
                || normalizedPath.equals("setup.py")
                || normalizedPath.equals("requirements.txt");
    }

    private ImplementationStepResult parseImplementationResult(String rawOutput) {
        try {
            JsonNode node = objectMapper.readTree(rawOutput);
            String summary = node.path("summary").asText("");
            if (!hasText(summary) && node.path("jsonParseDegraded").asBoolean(false)) {
                summary = extractImplementationMarkdownSummary(node.path("rawOutput").asText(""));
            }
            if (!hasText(summary)) {
                summary = extractImplementationMarkdownSummary(node.path("displayMarkdown").asText(""));
            }
            String log = node.path("log").asText("");
            if (!hasText(log) && node.path("jsonParseDegraded").asBoolean(false)) {
                log = node.path("rawOutput").asText("");
            }
            String displayMarkdown = trimToNull(node.path("displayMarkdown").asText(""));
            if (!hasText(displayMarkdown)) {
                displayMarkdown = trimToNull(node.path("markdownOutput").asText(""));
            }
            if (!hasText(displayMarkdown) && node.path("jsonParseDegraded").asBoolean(false)) {
                displayMarkdown = trimToNull(node.path("rawOutput").asText(""));
            }
            return new ImplementationStepResult(
                    node.path("status").asText("SUCCESS"),
                    hasText(summary) ? summary : "开发实现已完成",
                    readStringList(node.path("changedFiles")),
                    readStringList(node.path("commandsExecuted")),
                    log,
                    trimToNull(node.path("workBranch").asText("")),
                    trimToNull(node.path("commitSha").asText("")),
                    trimToNull(node.path("mergeRequestUrl").asText("")),
                    rawOutput,
                    displayMarkdown
            );
        } catch (Exception exception) {
            String markdownSummary = extractImplementationMarkdownSummary(rawOutput);
            return new ImplementationStepResult(
                    inferImplementationStatusFromMarkdown(rawOutput),
                    hasText(markdownSummary) ? markdownSummary : "开发实现已完成",
                    List.of(),
                    List.of(),
                    defaultString(rawOutput),
                    null,
                    null,
                    null,
                    rawOutput,
                    trimToNull(rawOutput)
            );
        }
    }

    private void validateImplementationResult(ImplementationStepResult result) {
        if (!"SUCCESS".equalsIgnoreCase(defaultString(result.status()))) {
            throw new IllegalStateException(hasText(result.summary()) ? result.summary().trim() : "开发实现失败");
        }
    }

    private TestStepResult parseTestResult(String rawOutput) {
        try {
            JsonNode node = objectMapper.readTree(rawOutput);
            List<TestSuiteResult> suiteResults = new ArrayList<>();
            if (node.has("suiteResults") && node.path("suiteResults").isArray()) {
                for (JsonNode suiteNode : node.path("suiteResults")) {
                    suiteResults.add(parseSuiteResult(suiteNode));
                }
            } else {
                suiteResults.add(new TestSuiteResult(
                        "command",
                        "COMMAND",
                        node.path("status").asText("SUCCESS"),
                        node.path("summary").asText(""),
                        List.of(),
                        List.of(),
                        readCommandResults(node.path("commandResults"))
                ));
            }
            List<TestRawArtifact> rawArtifacts = new ArrayList<>();
            for (JsonNode item : node.path("rawArtifacts")) {
                rawArtifacts.add(new TestRawArtifact(
                        item.path("artifactType").asText(""),
                        item.path("title").asText(""),
                        item.path("fileName").asText("")
                ));
            }
            String status = node.path("status").asText("");
            if (!hasText(status)) {
                status = resolveTestStatus(suiteResults);
            }
            String summary = node.path("summary").asText("");
            if (!hasText(summary)) {
                summary = buildTestSummary(suiteResults);
            }
            return new TestStepResult(status, summary, suiteResults, rawArtifacts, rawOutput);
        } catch (Exception exception) {
            return new TestStepResult(
                    "SUCCESS",
                    "执行测试未返回结构化 JSON，已降级展示原始输出",
                    List.of(),
                    List.of(),
                    buildNonStructuredOutputLog("执行测试", rawOutput, exception)
            );
        }
    }

    private String buildNonStructuredOutputLog(String stepName, String rawOutput, Exception exception) {
        StringBuilder builder = new StringBuilder();
        builder.append(stepName).append("返回内容无法按结构化 JSON 解析，平台已按原始输出降级展示。\n");
        if (exception != null && hasText(exception.getMessage())) {
            builder.append("解析错误：").append(exception.getMessage().trim()).append("\n");
        }
        if (hasText(rawOutput)) {
            builder.append("\n[原始输出]\n").append(rawOutput.trim());
        } else {
            builder.append("\n[原始输出]\n<空>");
        }
        return builder.toString();
    }

    private TestSuiteResult parseSuiteResult(JsonNode suiteNode) {
        List<TestCheckResult> checks = new ArrayList<>();
        for (JsonNode item : suiteNode.path("checks")) {
            checks.add(new TestCheckResult(
                    item.path("name").asText(""),
                    item.path("status").asText(""),
                    item.path("detail").asText("")
            ));
        }
        List<TestArtifactResult> artifacts = new ArrayList<>();
        for (JsonNode item : suiteNode.path("artifacts")) {
            artifacts.add(new TestArtifactResult(
                    item.path("artifactType").asText(""),
                    item.path("title").asText(""),
                    item.path("fileName").asText("")
            ));
        }
        return new TestSuiteResult(
                suiteNode.path("suiteId").asText(""),
                suiteNode.path("type").asText(""),
                suiteNode.path("status").asText("SUCCESS"),
                suiteNode.path("summary").asText(""),
                checks,
                artifacts,
                readCommandResults(suiteNode.path("commandResults"))
        );
    }

    private List<TestCommandResult> readCommandResults(JsonNode node) {
        List<TestCommandResult> commandResults = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return commandResults;
        }
        for (JsonNode item : node) {
            commandResults.add(new TestCommandResult(
                    item.path("command").asText(""),
                    item.path("cwd").asText(""),
                    item.hasNonNull("exitCode") ? item.get("exitCode").asInt() : null,
                    item.path("stdout").asText(""),
                    item.path("stderr").asText("")
            ));
        }
        return commandResults;
    }

    private String resolveTestStatus(List<TestSuiteResult> suiteResults) {
        for (TestSuiteResult suiteResult : suiteResults) {
            if ("FAILED".equalsIgnoreCase(defaultString(suiteResult.status()))) {
                return "FAILED";
            }
        }
        return "SUCCESS";
    }

    private String buildTestSummary(List<TestSuiteResult> suiteResults) {
        if (suiteResults == null || suiteResults.isEmpty()) {
            return "当前未返回测试 suite 执行记录";
        }
        long skippedCount = suiteResults.stream().filter(item -> "SKIPPED".equalsIgnoreCase(defaultString(item.status()))).count();
        long executedCount = suiteResults.stream().filter(item -> !"SKIPPED".equalsIgnoreCase(defaultString(item.status()))).count();
        return "测试 suite 执行完成，实际执行 " + executedCount + " 个，跳过 " + skippedCount + " 个";
    }

    private void validateTestResult(TestStepResult result) {
        if (!"SUCCESS".equalsIgnoreCase(defaultString(result.status()))) {
            throw new IllegalStateException(hasText(result.summary()) ? result.summary().trim() : "执行测试失败");
        }
        for (TestSuiteResult suiteResult : result.suiteResults()) {
            if ("FAILED".equalsIgnoreCase(defaultString(suiteResult.status()))) {
                throw new IllegalStateException(hasText(suiteResult.summary()) ? suiteResult.summary().trim() : defaultString(suiteResult.type()) + " 执行失败");
            }
            for (TestCommandResult commandResult : suiteResult.commandResults()) {
                if (commandResult.exitCode() != null && commandResult.exitCode() != 0) {
                    throw new IllegalStateException(hasText(suiteResult.summary())
                            ? suiteResult.summary().trim()
                            : defaultString(commandResult.command()) + " 执行失败");
                }
            }
        }
    }

    private String buildTestLog(TestStepResult result) {
        StringBuilder builder = new StringBuilder();
        for (TestSuiteResult suiteResult : result.suiteResults()) {
            builder.append("## ").append(defaultString(suiteResult.type())).append(" / ").append(defaultString(suiteResult.suiteId())).append('\n')
                    .append("status: ").append(defaultString(suiteResult.status())).append('\n')
                    .append("summary: ").append(defaultString(suiteResult.summary())).append("\n\n");
            for (TestCommandResult commandResult : suiteResult.commandResults()) {
                builder.append("$ ").append(defaultString(commandResult.command())).append('\n')
                        .append("cwd: ").append(defaultString(commandResult.cwd())).append('\n')
                        .append("exitCode: ").append(commandResult.exitCode() == null ? "-" : commandResult.exitCode()).append("\n\n");
                if (hasText(commandResult.stdout())) {
                    builder.append("[stdout]\n").append(commandResult.stdout().trim()).append("\n\n");
                }
                if (hasText(commandResult.stderr())) {
                    builder.append("[stderr]\n").append(commandResult.stderr().trim()).append("\n\n");
                }
            }
        }
        if (builder.length() == 0 && hasText(result.rawOutput())) {
            builder.append(result.rawOutput().trim());
        }
        return builder.toString().trim();
    }

    private void appendSuiteChecks(StringBuilder builder, TestSuiteResult suiteResult) {
        builder.append("#### 检查项\n\n");
        if (suiteResult.checks() == null || suiteResult.checks().isEmpty()) {
            builder.append("- 无\n\n");
            return;
        }
        for (TestCheckResult check : suiteResult.checks()) {
            builder.append("- ")
                    .append(defaultString(check.name()))
                    .append("：")
                    .append(defaultString(check.status()));
            if (hasText(check.detail())) {
                builder.append("（").append(check.detail().trim()).append('）');
            }
            builder.append('\n');
        }
        builder.append('\n');
    }

    private void appendSuiteArtifacts(StringBuilder builder, TestSuiteResult suiteResult) {
        builder.append("#### 产物\n\n");
        if (suiteResult.artifacts() == null || suiteResult.artifacts().isEmpty()) {
            builder.append("- 无\n\n");
            return;
        }
        for (TestArtifactResult artifact : suiteResult.artifacts()) {
            builder.append("- ")
                    .append(defaultString(artifact.artifactType()))
                    .append("：")
                    .append(defaultString(artifact.title()));
            if (hasText(artifact.fileName())) {
                builder.append("（").append(artifact.fileName().trim()).append('）');
            }
            builder.append('\n');
        }
        builder.append('\n');
    }

    private void appendSuiteCommands(StringBuilder builder, TestSuiteResult suiteResult) {
        builder.append("#### 命令结果\n\n");
        if (suiteResult.commandResults() == null || suiteResult.commandResults().isEmpty()) {
            builder.append("- 本 suite 未返回命令执行记录\n\n");
            return;
        }
        for (int index = 0; index < suiteResult.commandResults().size(); index++) {
            TestCommandResult commandResult = suiteResult.commandResults().get(index);
            builder.append("##### 命令 ").append(index + 1).append('\n')
                    .append("- 命令：`").append(defaultString(commandResult.command()).trim()).append("`\n")
                    .append("- 执行目录：`").append(defaultString(commandResult.cwd()).trim()).append("`\n")
                    .append("- 退出码：").append(commandResult.exitCode() == null ? "-" : commandResult.exitCode()).append("\n\n");
            appendMarkdownCodeSection(builder, "###### ", "标准输出", commandResult.stdout(), "无");
            appendMarkdownCodeSection(builder, "###### ", "标准错误", commandResult.stderr(), "无");
        }
    }

    private void appendRawArtifacts(StringBuilder builder, List<TestRawArtifact> rawArtifacts) {
        builder.append("## Sidecar 原始产物\n\n");
        if (rawArtifacts == null || rawArtifacts.isEmpty()) {
            builder.append("- 无\n");
            return;
        }
        for (TestRawArtifact item : rawArtifacts) {
            builder.append("- ")
                    .append(defaultString(item.artifactType()))
                    .append("：")
                    .append(defaultString(item.title()));
            if (hasText(item.fileName())) {
                builder.append("（").append(item.fileName().trim()).append('）');
            }
            builder.append('\n');
        }
    }

    /**
     * IMPLEMENT 阶段优先展示 runner 原始 Markdown，只有历史链路未提供 Markdown 时，
     * 才回退到平台根据结构化字段补出的摘要模板。
     */
    private String buildImplementationDisplayMarkdown(ImplementationStepResult result) {
        if (hasText(result.displayMarkdown())) {
            return result.displayMarkdown().trim();
        }
        return buildImplementationResultMarkdown(result);
    }

    /**
     * 开发实现结果除了保留 JSON 供平台后续逻辑消费，也额外生成一份 Markdown，
     * 让执行中心详情页能够直接按结构化摘要阅读。
     */
    private String buildImplementationResultMarkdown(ImplementationStepResult result) {
        StringBuilder builder = new StringBuilder();
        builder.append("# 开发实现结果\n\n")
                .append("- 执行状态：").append(defaultString(result.status())).append('\n')
                .append("- 结果摘要：").append(defaultString(result.summary())).append('\n');
        if (hasText(result.workBranch())) {
            builder.append("- 工作分支：`").append(result.workBranch().trim()).append("`\n");
        }
        if (hasText(result.commitSha())) {
            builder.append("- 提交 SHA：`").append(result.commitSha().trim()).append("`\n");
        }
        if (hasText(result.mergeRequestUrl())) {
            String url = result.mergeRequestUrl().trim();
            builder.append("- 合并请求：[打开 MR](").append(url).append(")\n");
        }
        builder.append('\n');
        appendMarkdownListSection(builder, "## ", "变更文件", result.changedFiles(), "本次未声明变更文件");
        appendMarkdownListSection(builder, "## ", "执行命令", result.commandsExecuted(), "本次未记录执行命令");
        appendMarkdownCodeSection(builder, "## ", "执行日志", result.log(), "暂无执行日志");
        return builder.toString().trim();
    }

    private String extractImplementationMarkdownSummary(String markdown) {
        for (String line : defaultString(markdown).split("\\R")) {
            String normalized = normalizeImplementationMarkdownLine(line);
            if (!hasText(normalized)) {
                continue;
            }
            String lower = normalized.toLowerCase();
            if (lower.startsWith("status") || normalized.startsWith("状态") || normalized.startsWith("执行状态")) {
                continue;
            }
            if (normalized.contains("摘要") && (normalized.contains("：") || normalized.contains(":"))) {
                return tailAfterColon(normalized);
            }
            if ("开发实现结果".equals(normalized) || "结果概览".equals(normalized) || "总体结论".equals(normalized)) {
                continue;
            }
            return normalized;
        }
        return "";
    }

    private String inferImplementationStatusFromMarkdown(String markdown) {
        for (String line : defaultString(markdown).split("\\R")) {
            String normalized = normalizeImplementationMarkdownLine(line);
            if (!hasText(normalized)) {
                continue;
            }
            String lower = normalized.toLowerCase();
            boolean statusLine = lower.contains("status") || normalized.contains("状态") || normalized.contains("执行状态") || normalized.contains("执行结果");
            if (!statusLine) {
                continue;
            }
            if (lower.contains("failed") || normalized.contains("失败") || normalized.contains("未完成") || normalized.contains("无法完成") || normalized.contains("阻塞")) {
                return "FAILED";
            }
            if (lower.contains("success") || normalized.contains("成功") || normalized.contains("已完成") || normalized.contains("完成")) {
                return "SUCCESS";
            }
        }
        return "SUCCESS";
    }

    private String normalizeImplementationMarkdownLine(String line) {
        String normalized = defaultString(line).trim();
        if (normalized.isBlank() || normalized.startsWith("```")) {
            return "";
        }
        normalized = normalized.replaceFirst("^[#>*\\-\\d\\.\\)\\s]+", "").trim();
        normalized = normalized.replace("`", "").trim();
        return normalized;
    }

    private String tailAfterColon(String value) {
        String normalized = defaultString(value).trim();
        int chineseColonIndex = normalized.indexOf('：');
        if (chineseColonIndex >= 0) {
            return normalized.substring(chineseColonIndex + 1).trim();
        }
        int colonIndex = normalized.indexOf(':');
        if (colonIndex >= 0) {
            return normalized.substring(colonIndex + 1).trim();
        }
        return normalized;
    }

    /**
     * 测试产物改为 Markdown 展示后，可以在详情页直接看到每条命令的退出码与输出摘要，
     * 无需先下载 JSON 再手工展开。
     */
    private String buildTestResultMarkdown(TestStepResult result) {
        StringBuilder builder = new StringBuilder();
        builder.append("# 执行测试结果\n\n")
                .append("- 执行状态：").append(defaultString(result.status())).append('\n')
                .append("- 结果摘要：").append(defaultString(result.summary())).append("\n\n");
        if (result.suiteResults().isEmpty()) {
            builder.append("## Suite 结果\n\n- 本次未返回 suite 执行记录\n");
            appendMarkdownCodeSection(builder, "## ", "原始输出", result.rawOutput(), "暂无原始输出");
            return builder.toString().trim();
        }
        builder.append("## Suite 结果\n\n");
        for (TestSuiteResult suiteResult : result.suiteResults()) {
            builder.append("### ").append(defaultString(suiteResult.type())).append(" / ").append(defaultString(suiteResult.suiteId())).append('\n')
                    .append("- 执行状态：").append(defaultString(suiteResult.status())).append('\n')
                    .append("- 结果摘要：").append(defaultString(suiteResult.summary())).append("\n\n");
            appendSuiteChecks(builder, suiteResult);
            appendSuiteArtifacts(builder, suiteResult);
            appendSuiteCommands(builder, suiteResult);
        }
        appendRawArtifacts(builder, result.rawArtifacts());
        return builder.toString().trim();
    }

    private String buildSuiteResultMarkdown(TestStepResult result) {
        StringBuilder builder = new StringBuilder();
        builder.append("# 测试 Suite 结果\n\n");
        if (result.suiteResults().isEmpty()) {
            builder.append("- 本次未返回 suite 执行记录\n");
            appendMarkdownCodeSection(builder, "## ", "原始输出", result.rawOutput(), "暂无原始输出");
            return builder.toString().trim();
        }
        for (TestSuiteResult suiteResult : result.suiteResults()) {
            builder.append("## ").append(defaultString(suiteResult.type())).append(" / ").append(defaultString(suiteResult.suiteId())).append("\n\n")
                    .append("- 执行状态：").append(defaultString(suiteResult.status())).append('\n')
                    .append("- 结果摘要：").append(defaultString(suiteResult.summary())).append("\n\n");
            appendSuiteChecks(builder, suiteResult);
            appendSuiteArtifacts(builder, suiteResult);
            appendSuiteCommands(builder, suiteResult);
        }
        return builder.toString().trim();
    }

    private void appendMarkdownListSection(StringBuilder builder, String headingPrefix, String title, List<String> items, String emptyText) {
        builder.append(headingPrefix).append(title).append("\n\n");
        if (items == null || items.isEmpty()) {
            builder.append("- ").append(emptyText).append("\n\n");
            return;
        }
        for (String item : items) {
            builder.append("- ").append(defaultString(item).trim()).append('\n');
        }
        builder.append('\n');
    }

    private void appendMarkdownCodeSection(StringBuilder builder, String headingPrefix, String title, String content, String emptyText) {
        builder.append(headingPrefix).append(title).append("\n\n");
        if (!hasText(content)) {
            builder.append(emptyText).append("\n\n");
            return;
        }
        builder.append("```text\n")
                .append(content.trim())
                .append("\n```\n\n");
    }

    private String buildCommandMarkdown(List<String> commands) {
        if (commands == null || commands.isEmpty()) {
            return "- 暂无";
        }
        StringBuilder builder = new StringBuilder();
        for (String command : commands) {
            builder.append("- ").append(defaultString(command)).append('\n');
        }
        return builder.toString().trim();
    }

    private String extractReportSummary(String markdown) {
        for (String line : defaultString(markdown).split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("```")) {
                continue;
            }
            return trimmed;
        }
        return trimToNull(markdown);
    }

    private String buildFallbackSummary(List<RepositoryExecutionState> repositoryStates,
                                        List<ResolvedRepositoryContext> skippedRepositories,
                                        FailureContext failureContext) {
        if (failureContext != null) {
            return resolveMessage(failureContext.exception(), "执行失败");
        }
        if (!repositoryStates.isEmpty()) {
            return "开发执行已完成，共处理 " + repositoryStates.size() + " 个仓库。";
        }
        if (!skippedRepositories.isEmpty()) {
            return "开发执行未开始，存在未执行仓库。";
        }
        return "开发执行已完成。";
    }

    private String resolveUserName(ExecutionTaskEntity executionTask) {
        if (executionTask.getCreatedByUser() == null) {
            return "";
        }
        String nickname = defaultString(executionTask.getCreatedByUser().getNickname()).trim();
        return nickname.isBlank() ? defaultString(executionTask.getCreatedByUser().getUsername()) : nickname;
    }

    private boolean isCancelRequested(Long executionTaskId) {
        return Boolean.TRUE.equals(executionTaskRepository.findCancelRequestedFlagById(executionTaskId));
    }

    private String resolveMessage(RuntimeException exception, String fallback) {
        if (exception == null || !hasText(exception.getMessage())) {
            return fallback;
        }
        return exception.getMessage().trim();
    }

    private String defaultSuccessMessage(String summary, String repositoryDisplayName, String fallbackPrefix) {
        if (hasText(summary)) {
            return summary.trim();
        }
        return repositoryDisplayName == null ? fallbackPrefix + "已完成" : fallbackPrefix + "已完成：" + repositoryDisplayName;
    }

    private String prettyJson(String rawText) {
        if (!hasText(rawText)) {
            return "";
        }
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(objectMapper.readTree(rawText));
        } catch (Exception ignored) {
            return rawText;
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("执行变量序列化失败", exception);
        }
    }

    private Long asLong(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.longValue();
        }
        String text = trimToNull(node.asText(""));
        if (text == null) {
            return null;
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String limitMessage(String value) {
        String normalized = defaultString(value).trim();
        return normalized.length() <= 1000 ? normalized : normalized.substring(0, 1000);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    public record DevelopmentExecutionResult(String outputSummary,
                                             List<ExecutionArtifactEntity> artifacts,
                                             boolean canceled,
                                             boolean awaitingConfirmation) {
    }

    public static class DevelopmentExecutionStepException extends RuntimeException {

        private final ExecutionStepEntity failedStep;
        private final List<ExecutionArtifactEntity> artifacts;
        private final String outputSummary;

        public DevelopmentExecutionStepException(ExecutionStepEntity failedStep,
                                                RuntimeException cause,
                                                List<ExecutionArtifactEntity> artifacts,
                                                String outputSummary) {
            super(cause == null ? null : cause.getMessage(), cause);
            this.failedStep = failedStep;
            this.artifacts = artifacts;
            this.outputSummary = outputSummary;
        }

        public ExecutionStepEntity failedStep() {
            return failedStep;
        }

        public List<ExecutionArtifactEntity> artifacts() {
            return artifacts;
        }

        public String outputSummary() {
            return outputSummary;
        }
    }

    private static final class DevelopmentExecutionCanceledException extends RuntimeException {

        private DevelopmentExecutionCanceledException(String message) {
            super(message);
        }
    }

    private record DevelopmentTaskPayload(String inputText,
                                          boolean planConfirmationRequired,
                                          List<RepositoryRequest> repositories) {
    }

    private record RepositoryRequest(Long bindingId, String targetBranch) {
    }

    /**
     * 统一沉淀当前仓库的可执行上下文，供开发/测试步骤和报告聚合复用。
     */
    private record ResolvedRepositoryContext(
            Long bindingId,
            String targetBranch,
            String repositoryDisplayName,
            String projectRef,
            String projectPath,
            String cloneUrl,
            String webUrl,
            String apiBaseUrl,
            String accessToken,
            String testProfileJson,
            String commitSha,
            String structureMarkdown,
            String structureJson,
            String crossRepoContextMarkdown,
            String crossRepoContextJson,
            boolean structuringDegraded,
            String structuringMessage,
            List<String> harnessHints
    ) {
    }

    private record StructuringStepResult(
            String summary,
            boolean degraded,
            String crossRepoContextMarkdown,
            String crossRepoContextJson,
            List<RepositoryStructuringSummary> repositories,
            String rawOutput
    ) {
        private static StructuringStepResult empty() {
            return new StructuringStepResult("", false, "", "", List.of(), "");
        }
    }

    private record RepositoryStructuringSummary(
            Long bindingId,
            String repositoryDisplayName,
            String targetBranch,
            String commitSha,
            boolean degraded,
            String degradationSummary,
            String structureMarkdown,
            String structureJson,
            List<String> harnessHints
    ) {
    }

    private static final class RepositoryExecutionState {
        private final ResolvedRepositoryContext repository;
        private final int index;
        private final int total;
        private ImplementationStepResult implementationResult;
        private TestStepResult testResult;

        private RepositoryExecutionState(ResolvedRepositoryContext repository, int index, int total) {
            this.repository = repository;
            this.index = index;
            this.total = total;
        }

        public ResolvedRepositoryContext repository() {
            return repository;
        }

        public int index() {
            return index;
        }

        public int total() {
            return total;
        }

        public ImplementationStepResult implementationResult() {
            return implementationResult;
        }

        public String implementationRawOutput() {
            return implementationResult == null ? "" : implementationResult.rawOutput();
        }

        public TestStepResult testResult() {
            return testResult;
        }

        public String testRawOutput() {
            return testResult == null ? "" : testResult.rawOutput();
        }

        public void setImplementationResult(ImplementationStepResult implementationResult) {
            this.implementationResult = implementationResult;
        }

        public void setTestResult(TestStepResult testResult) {
            this.testResult = testResult;
        }

        public ImplementationStepResult requireImplementationResult() {
            if (implementationResult == null) {
                throw new IllegalStateException("当前仓库尚未生成开发实现结果");
            }
            return implementationResult;
        }
    }

    private record ImplementationStepResult(
            String status,
            String summary,
            List<String> changedFiles,
            List<String> commandsExecuted,
            String log,
            String workBranch,
            String commitSha,
            String mergeRequestUrl,
            String rawOutput,
            String displayMarkdown
    ) {
    }

    /**
     * TEST 步骤升级为 suite 驱动后，结果需要同时保留 suite 明细、sidecar 产物摘要和兼容聚合原文。
     */
    private record TestStepResult(
            String status,
            String summary,
            List<TestSuiteResult> suiteResults,
            List<TestRawArtifact> rawArtifacts,
            String rawOutput
    ) {
    }

    private record TestExecutionPlan(List<TestSuitePlan> suites) {
    }

    /**
     * backend 只负责生成 suite 计划，不直接执行 sidecar；空字段交由 code-processing 在运行时补默认值。
     */
    private record TestSuitePlan(
            String suiteId,
            String type,
            String status,
            String summary,
            String workingDir,
            List<String> commands,
            String packageManager,
            String startCommand,
            String baseUrl,
            List<String> smokePaths,
            String readySelector,
            String healthPath,
            List<TestHttpCheckPlan> httpChecks
    ) {
    }

    private record TestProfileConfig(
            String repoKind,
            String workingDir,
            String packageManager,
            String startCommand,
            String baseUrl,
            List<String> smokePaths,
            String readySelector,
            String healthPath,
            List<TestHttpCheckPlan> httpChecks
    ) {
    }

    private record TestSuiteResult(
            String suiteId,
            String type,
            String status,
            String summary,
            List<TestCheckResult> checks,
            List<TestArtifactResult> artifacts,
            List<TestCommandResult> commandResults
    ) {
    }

    private record TestCommandResult(String command, String cwd, Integer exitCode, String stdout, String stderr) {
    }

    private record TestCheckResult(String name, String status, String detail) {
    }

    private record TestArtifactResult(String artifactType, String title, String fileName) {
    }

    private record TestRawArtifact(String artifactType, String title, String fileName) {
    }

    private record TestHttpCheckPlan(String name, String method, String path, Integer expectedStatus) {
    }

    private record FailureContext(ExecutionStepEntity failedStep, RuntimeException originalException, String reportFailureMessage) {
        public RuntimeException exception() {
            if (!hasText(reportFailureMessage)) {
                return originalException;
            }
            return new IllegalStateException(resolveMessage(originalException, "执行失败") + "；交付报告生成失败：" + reportFailureMessage);
        }

        public FailureContext appendReportFailure(String message) {
            return new FailureContext(failedStep, originalException, message);
        }

        private static boolean hasText(String value) {
            return value != null && !value.trim().isEmpty();
        }

        private static String resolveMessage(RuntimeException exception, String fallback) {
            if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
                return fallback;
            }
            return exception.getMessage().trim();
        }
    }
}
