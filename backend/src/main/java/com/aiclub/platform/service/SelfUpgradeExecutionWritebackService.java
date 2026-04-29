package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunTargetEntity;
import com.aiclub.platform.domain.model.SelfUpgradeSuggestionEntity;
import com.aiclub.platform.domain.model.SelfUpgradeWorkItemEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolRunRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolRunTargetRepository;
import com.aiclub.platform.repository.SelfUpgradeSuggestionRepository;
import com.aiclub.platform.repository.SelfUpgradeWorkItemRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * 执行中心收口回调。
 * 根据 execution_task.sourceType/sourceId 把执行结果回写到自升级中心自己的运行与工作项领域。
 */
@Service
@Transactional
public class SelfUpgradeExecutionWritebackService {

    private static final String SOURCE_TYPE_PATROL_RUN = "SELF_UPGRADE_PATROL_RUN";
    private static final String SOURCE_TYPE_WORK_ITEM = "SELF_UPGRADE_WORK_ITEM";

    private final SelfUpgradePatrolRunRepository patrolRunRepository;
    private final SelfUpgradePatrolRunTargetRepository patrolRunTargetRepository;
    private final SelfUpgradeWorkItemRepository workItemRepository;
    private final SelfUpgradeSuggestionRepository suggestionRepository;
    private final SelfUpgradeSuggestionService suggestionService;
    private final SelfUpgradePatrolPlanService patrolPlanService;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ObjectMapper objectMapper;

    public SelfUpgradeExecutionWritebackService(SelfUpgradePatrolRunRepository patrolRunRepository,
                                                SelfUpgradePatrolRunTargetRepository patrolRunTargetRepository,
                                                SelfUpgradeWorkItemRepository workItemRepository,
                                                SelfUpgradeSuggestionRepository suggestionRepository,
                                                SelfUpgradeSuggestionService suggestionService,
                                                SelfUpgradePatrolPlanService patrolPlanService,
                                                ExecutionStepRepository executionStepRepository,
                                                ExecutionArtifactRepository executionArtifactRepository,
                                                ObjectMapper objectMapper) {
        this.patrolRunRepository = patrolRunRepository;
        this.patrolRunTargetRepository = patrolRunTargetRepository;
        this.workItemRepository = workItemRepository;
        this.suggestionRepository = suggestionRepository;
        this.suggestionService = suggestionService;
        this.patrolPlanService = patrolPlanService;
        this.executionStepRepository = executionStepRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.objectMapper = objectMapper;
    }

    public void handleExecutionFinished(ExecutionTaskEntity executionTask,
                                        ExecutionRunEntity executionRun,
                                        String terminalStatus) {
        if (executionTask == null || executionTask.getSourceType() == null || executionTask.getSourceId() == null) {
            return;
        }
        String sourceType = executionTask.getSourceType().trim().toUpperCase(Locale.ROOT);
        switch (sourceType) {
            case SOURCE_TYPE_PATROL_RUN -> writeBackPatrolRun(executionTask, executionRun, terminalStatus);
            case SOURCE_TYPE_WORK_ITEM -> writeBackWorkItem(executionTask, executionRun, terminalStatus);
            default -> {
            }
        }
    }

    private void writeBackPatrolRun(ExecutionTaskEntity executionTask,
                                    ExecutionRunEntity executionRun,
                                    String terminalStatus) {
        SelfUpgradePatrolRunEntity patrolRun = patrolRunRepository.findById(executionTask.getSourceId())
                .orElseThrow(() -> new NoSuchElementException("自升级巡检运行不存在: " + executionTask.getSourceId()));
        patrolRun.setLinkedExecutionTask(executionTask);
        patrolRun.setFinishedAt(LocalDateTime.now());
        String normalizedStatus = normalizeRunStatus(terminalStatus);
        String fallbackSummary = resolveSummary(executionTask, executionRun);
        ExecutionStepEntity patrolStep = executionRun == null
                ? null
                : executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(executionRun.getId()).stream()
                .findFirst()
                .orElse(null);
        if (patrolStep == null || patrolStep.getOutputSnapshot() == null || patrolStep.getOutputSnapshot().isBlank()) {
            String summary = "SUCCESS".equals(normalizedStatus) ? "巡检执行成功，但缺少结构化结果" : fallbackSummary;
            String effectiveStatus = "SUCCESS".equals(normalizedStatus) ? "FAILED" : normalizedStatus;
            patrolRun.setStatus(effectiveStatus);
            patrolRun.setSummary(summary);
            patrolRunRepository.save(patrolRun);
            markPendingTargetsTerminal(patrolRun, effectiveStatus, summary);
            patrolPlanService.markLastRun(patrolRun.getPlan().getId(), effectiveStatus, summary, LocalDateTime.now());
            return;
        }

        try {
            JsonNode resultNode = objectMapper.readTree(patrolStep.getOutputSnapshot());
            List<ExecutionArtifactEntity> executionArtifacts = executionArtifactRepository.findAllByRun_IdOrderByCreatedAtAscIdAsc(executionRun.getId());
            Map<Long, SelfUpgradePatrolRunTargetEntity> targetByPlanId = new LinkedHashMap<>();
            List<SelfUpgradePatrolRunTargetEntity> runTargets = patrolRunTargetRepository.findAllByRun_IdOrderByIdAsc(patrolRun.getId());
            List<SelfUpgradePatrolRunTargetEntity> unresolvedTargets = new ArrayList<>(runTargets);
            for (SelfUpgradePatrolRunTargetEntity item : runTargets) {
                if (item.getPlanTarget() != null) {
                    targetByPlanId.put(item.getPlanTarget().getId(), item);
                }
            }

            int successCount = 0;
            int partialSuccessCount = 0;
            int failedCount = 0;
            int suggestionCount = 0;
            int openedCount = 0;
            int reopenedCount = 0;
            JsonNode targetResultsNode = resultNode.path("targetResults");
            if (targetResultsNode.isArray()) {
                for (JsonNode targetResultNode : targetResultsNode) {
                    SelfUpgradePatrolRunTargetEntity runTarget = resolveRunTarget(runTargets, targetByPlanId, targetResultNode);
                    unresolvedTargets.remove(runTarget);
                    String targetStatus = normalizeRunStatus(readText(targetResultNode, "status"));
                    runTarget.setStatus(targetStatus);
                    runTarget.setPagePath(trimToNull(readText(targetResultNode, "pagePath")));
                    runTarget.setStepCount(targetResultNode.path("stepCount").asInt(0));
                    runTarget.setFindingCount(targetResultNode.path("findings").isArray() ? targetResultNode.path("findings").size() : targetResultNode.path("findingCount").asInt(0));
                    runTarget.setSkippedGuardrailCount(targetResultNode.path("skippedGuardrailCount").asInt(0));
                    runTarget.setSummary(defaultString(readText(targetResultNode, "summary")));
                    runTarget.setArtifactRefsJson(writeJson(targetResultNode.path("artifacts")));
                    runTarget.setFinishedAt(LocalDateTime.now());
                    patrolRunTargetRepository.save(runTarget);

                    if ("SUCCESS".equals(targetStatus)) {
                        successCount++;
                    } else if ("PARTIAL_SUCCESS".equals(targetStatus)) {
                        partialSuccessCount++;
                    } else {
                        failedCount++;
                    }

                    JsonNode findingsNode = targetResultNode.path("findings");
                    if (findingsNode.isArray()) {
                        suggestionCount += findingsNode.size();
                        for (JsonNode findingNode : findingsNode) {
                            SelfUpgradeSuggestionService.IngestOutcome outcome = suggestionService.recordFinding(patrolRun, runTarget, findingNode, executionArtifacts);
                            if (outcome.opened()) {
                                openedCount++;
                            }
                            if (outcome.reopened()) {
                                reopenedCount++;
                            }
                        }
                    }
                }
            }

            String structuredSummary = defaultString(readText(resultNode, "summary")).isBlank()
                    ? fallbackSummary
                    : defaultString(readText(resultNode, "summary"));
            String unresolvedStatus = "CANCELED".equals(normalizedStatus) ? "CANCELED" : "FAILED";
            // PATROL 可能在写出部分 targetResults 后提前结束，剩余未落库的目标需要补齐终态，避免页面一直显示 PENDING。
            for (SelfUpgradePatrolRunTargetEntity unresolvedTarget : unresolvedTargets) {
                if (!"PENDING".equalsIgnoreCase(defaultString(unresolvedTarget.getStatus()))
                        && !"RUNNING".equalsIgnoreCase(defaultString(unresolvedTarget.getStatus()))) {
                    continue;
                }
                unresolvedTarget.setStatus(unresolvedStatus);
                unresolvedTarget.setSummary(structuredSummary);
                unresolvedTarget.setFinishedAt(LocalDateTime.now());
                patrolRunTargetRepository.save(unresolvedTarget);
                if ("SUCCESS".equals(unresolvedStatus)) {
                    successCount++;
                } else if ("PARTIAL_SUCCESS".equals(unresolvedStatus)) {
                    partialSuccessCount++;
                } else {
                    failedCount++;
                }
            }

            patrolRun.setSuccessTargetCount(successCount);
            patrolRun.setPartialSuccessTargetCount(partialSuccessCount);
            patrolRun.setFailedTargetCount(failedCount);
            patrolRun.setSuggestionCount(suggestionCount);
            patrolRun.setOpenedSuggestionCount(openedCount);
            patrolRun.setReopenedSuggestionCount(reopenedCount);
            patrolRun.setStatus(resolvePatrolRunStatus(resultNode, successCount, partialSuccessCount, failedCount));
            patrolRun.setSummary(structuredSummary);
            patrolRun.setArtifactRefsJson(writeJson(resultNode.path("artifacts")));
            patrolRunRepository.save(patrolRun);
            patrolPlanService.markLastRun(patrolRun.getPlan().getId(), patrolRun.getStatus(), patrolRun.getSummary(), LocalDateTime.now());
        } catch (Exception exception) {
            String summary = "巡检结果解析失败：" + exception.getMessage();
            patrolRun.setStatus("FAILED");
            patrolRun.setSummary(summary);
            patrolRunRepository.save(patrolRun);
            markPendingTargetsTerminal(patrolRun, "FAILED", summary);
            patrolPlanService.markLastRun(patrolRun.getPlan().getId(), "FAILED", summary, LocalDateTime.now());
        }
    }

    private void writeBackWorkItem(ExecutionTaskEntity executionTask,
                                   ExecutionRunEntity executionRun,
                                   String terminalStatus) {
        SelfUpgradeWorkItemEntity workItem = workItemRepository.findById(executionTask.getSourceId())
                .orElseThrow(() -> new NoSuchElementException("自升级工作项不存在: " + executionTask.getSourceId()));
        workItem.setLatestExecutionTask(executionTask);
        String normalizedStatus = normalizeRunStatus(terminalStatus);
        if ("SUCCESS".equals(normalizedStatus)) {
            workItem.setStatus("VERIFYING");
            syncSuggestionStatus(workItem, "IN_PROGRESS");
        } else if ("CANCELED".equals(normalizedStatus)) {
            workItem.setStatus("CANCELED");
            syncSuggestionStatus(workItem, "ACCEPTED");
        } else {
            workItem.setStatus("TODO");
            syncSuggestionStatus(workItem, "ACCEPTED");
        }
        workItemRepository.save(workItem);
    }

    private void syncSuggestionStatus(SelfUpgradeWorkItemEntity workItem, String suggestionStatus) {
        if (workItem.getSuggestion() == null) {
            return;
        }
        SelfUpgradeSuggestionEntity suggestion = workItem.getSuggestion();
        suggestion.setStatus(suggestionStatus);
        suggestionRepository.save(suggestion);
    }

    private void markPendingTargetsTerminal(SelfUpgradePatrolRunEntity patrolRun, String status, String summary) {
        for (SelfUpgradePatrolRunTargetEntity item : patrolRunTargetRepository.findAllByRun_IdOrderByIdAsc(patrolRun.getId())) {
            if (!"PENDING".equalsIgnoreCase(defaultString(item.getStatus())) && !"RUNNING".equalsIgnoreCase(defaultString(item.getStatus()))) {
                continue;
            }
            item.setStatus(status);
            item.setSummary(summary);
            item.setFinishedAt(LocalDateTime.now());
            patrolRunTargetRepository.save(item);
        }
    }

    private SelfUpgradePatrolRunTargetEntity resolveRunTarget(List<SelfUpgradePatrolRunTargetEntity> runTargets,
                                                              Map<Long, SelfUpgradePatrolRunTargetEntity> targetByPlanId,
                                                              JsonNode targetResultNode) {
        Long planTargetId = targetResultNode.path("targetId").isIntegralNumber() ? targetResultNode.path("targetId").asLong() : null;
        if (planTargetId != null && targetByPlanId.containsKey(planTargetId)) {
            return targetByPlanId.get(planTargetId);
        }
        String targetName = readText(targetResultNode, "name");
        for (SelfUpgradePatrolRunTargetEntity item : runTargets) {
            if (Objects.equals(item.getTargetName(), targetName)) {
                return item;
            }
        }
        throw new IllegalArgumentException("巡检结果中的目标无法匹配到运行记录: " + targetName);
    }

    private String normalizeRunStatus(String value) {
        String normalized = defaultString(value).trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "SUCCESS", "PARTIAL_SUCCESS", "FAILED", "CANCELED", "RUNNING", "PENDING" -> normalized;
            default -> "FAILED";
        };
    }

    private String resolvePatrolRunStatus(JsonNode resultNode,
                                          int successCount,
                                          int partialSuccessCount,
                                          int failedCount) {
        String declaredStatus = normalizeRunStatus(readText(resultNode, "status"));
        if (!"FAILED".equals(declaredStatus) || "FAILED".equalsIgnoreCase(readText(resultNode, "status"))) {
            return declaredStatus;
        }
        if (failedCount > 0 && successCount == 0 && partialSuccessCount == 0) {
            return "FAILED";
        }
        if (failedCount > 0 || partialSuccessCount > 0) {
            return "PARTIAL_SUCCESS";
        }
        return "SUCCESS";
    }

    private String resolveSummary(ExecutionTaskEntity executionTask, ExecutionRunEntity executionRun) {
        if (executionRun != null && executionRun.getErrorMessage() != null && !executionRun.getErrorMessage().isBlank()) {
            return executionRun.getErrorMessage();
        }
        return executionTask == null ? "" : defaultString(executionTask.getLatestSummary());
    }

    private String readText(JsonNode node, String fieldName) {
        if (node == null) {
            return "";
        }
        JsonNode child = node.path(fieldName);
        return child.isMissingNode() || child.isNull() ? "" : child.asText("");
    }

    private String writeJson(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception exception) {
            return "[]";
        }
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String trimToNull(String value) {
        String normalized = defaultString(value).trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
