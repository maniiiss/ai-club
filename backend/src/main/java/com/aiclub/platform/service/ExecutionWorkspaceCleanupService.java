package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import com.aiclub.platform.dto.ExecutionWorkspaceCleanupSummary;
import com.aiclub.platform.repository.ExecutionWorkspaceCleanupRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ExecutionWorkspaceCleanupService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_SCHEDULED = "SCHEDULED";
    public static final String STATUS_DELETED = "DELETED";
    public static final String STATUS_DELETE_FAILED = "DELETE_FAILED";

    private final ExecutionWorkspaceCleanupRepository executionWorkspaceCleanupRepository;
    private final long retentionHours;

    public ExecutionWorkspaceCleanupService(
            ExecutionWorkspaceCleanupRepository executionWorkspaceCleanupRepository,
            @Value("${platform.execution.workspace-cleanup.retention-hours:24}") long retentionHours
    ) {
        this.executionWorkspaceCleanupRepository = executionWorkspaceCleanupRepository;
        this.retentionHours = retentionHours <= 0 ? 24 : retentionHours;
    }

    /**
     * 登记执行运行产生的工作区目录。
     * 同一个 run + workspaceRoot 只保留一条记录，避免多次回调把同一目录登记成多条待删任务。
     */
    @Transactional
    public ExecutionWorkspaceCleanupEntity registerWorkspace(Long taskId,
                                                             Long runId,
                                                             Long stepId,
                                                             String sessionId,
                                                             String workspaceRoot) {
        if (taskId == null) {
            throw new IllegalArgumentException("taskId 不能为空");
        }
        if (runId == null) {
            throw new IllegalArgumentException("runId 不能为空");
        }
        String normalizedWorkspaceRoot = trimToNull(workspaceRoot);
        if (normalizedWorkspaceRoot == null) {
            throw new IllegalArgumentException("workspaceRoot 不能为空");
        }

        ExecutionWorkspaceCleanupEntity entity = executionWorkspaceCleanupRepository
                .findByExecutionRunIdAndWorkspaceRoot(runId, normalizedWorkspaceRoot)
                .orElseGet(ExecutionWorkspaceCleanupEntity::new);
        boolean newRecord = entity.getId() == null;

        entity.setExecutionTaskId(taskId);
        entity.setExecutionRunId(runId);
        entity.setExecutionStepId(stepId);
        entity.setRunnerSessionId(trimToNull(sessionId));
        entity.setWorkspaceRoot(normalizedWorkspaceRoot);
        if (newRecord) {
            // 首次登记时才初始化清理生命周期，避免重复回调把已进入队列的记录误回滚成 ACTIVE。
            entity.setStatus(STATUS_ACTIVE);
            entity.setExecutionResultStatus(null);
            entity.setScheduledAt(null);
            entity.setExpiresAt(null);
            entity.setDeletedAt(null);
            entity.setDeleteFailedAt(null);
            entity.setDeleteErrorMessage(null);
        }
        return executionWorkspaceCleanupRepository.save(entity);
    }

    /**
     * 在运行收尾阶段把仍然 ACTIVE 的工作区切换为 SCHEDULED，
     * 让后续异步清理器只需要按状态和到期时间拉取即可。
     */
    @Transactional
    public int scheduleCleanupForRun(Long runId, String resultStatus, LocalDateTime scheduledAt) {
        if (runId == null) {
            throw new IllegalArgumentException("runId 不能为空");
        }
        if (scheduledAt == null) {
            throw new IllegalArgumentException("scheduledAt 不能为空");
        }

        List<ExecutionWorkspaceCleanupEntity> activeWorkspaces =
                executionWorkspaceCleanupRepository.findAllByExecutionRunIdAndStatusOrderByIdAsc(runId, STATUS_ACTIVE);
        List<ExecutionWorkspaceCleanupEntity> scheduledWorkspaces =
                executionWorkspaceCleanupRepository.findAllByExecutionRunIdAndStatusOrderByIdAsc(runId, STATUS_SCHEDULED);
        if (activeWorkspaces.isEmpty() && scheduledWorkspaces.isEmpty()) {
            return 0;
        }

        String normalizedResultStatus = trimToNull(resultStatus);
        LocalDateTime expiresAt = scheduledAt.plusHours(retentionHours);
        List<ExecutionWorkspaceCleanupEntity> dirtyRecords = new ArrayList<>();
        for (ExecutionWorkspaceCleanupEntity entity : activeWorkspaces) {
            applyScheduledState(entity, normalizedResultStatus, scheduledAt, expiresAt);
            dirtyRecords.add(entity);
        }
        for (ExecutionWorkspaceCleanupEntity entity : scheduledWorkspaces) {
            if (!shouldRefreshScheduledState(entity, normalizedResultStatus)) {
                continue;
            }
            applyScheduledState(entity, normalizedResultStatus, scheduledAt, expiresAt);
            dirtyRecords.add(entity);
        }
        if (!dirtyRecords.isEmpty()) {
            executionWorkspaceCleanupRepository.saveAll(dirtyRecords);
        }
        return activeWorkspaces.size() + scheduledWorkspaces.size();
    }

    /**
     * 为执行详情页聚合任务级清理摘要。
     * 这里按生命周期风险显式聚合任务下的全部记录，避免混合状态时被某条“更新更晚”的成功记录掩盖失败态。
     */
    public ExecutionWorkspaceCleanupSummary buildTaskSummary(Long executionTaskId) {
        return buildTaskSummary(executionTaskId, null);
    }

    public ExecutionWorkspaceCleanupSummary buildTaskSummary(Long executionTaskId, String scenarioCode) {
        if (executionTaskId == null) {
            throw new IllegalArgumentException("executionTaskId 不能为空");
        }
        List<ExecutionWorkspaceCleanupEntity> records = executionWorkspaceCleanupRepository.findAllByExecutionTaskId(executionTaskId);
        if (records.isEmpty()) {
            return new ExecutionWorkspaceCleanupSummary(
                    false,
                    retentionHours,
                    "NONE",
                    null,
                    null,
                    null,
                    null,
                    null,
                    0,
                    "当前执行未登记需要自动清理的本地工作区。"
            );
        }
        String aggregatedStatus = aggregateStatus(records);
        List<ExecutionWorkspaceCleanupEntity> recordsWithAggregatedStatus = records.stream()
                .filter(record -> aggregatedStatus.equalsIgnoreCase(defaultStatus(record.getStatus())))
                .toList();
        ExecutionWorkspaceCleanupEntity representativeRecord = selectRepresentativeRecord(
                aggregatedStatus,
                recordsWithAggregatedStatus
        );
        String aggregatedExecutionResultStatus = aggregateExecutionResultStatus(recordsWithAggregatedStatus);
        return new ExecutionWorkspaceCleanupSummary(
                true,
                retentionHours,
                aggregatedStatus,
                aggregatedExecutionResultStatus,
                formatTime(resolveExpiresAt(aggregatedStatus, recordsWithAggregatedStatus, representativeRecord)),
                formatTime(resolveDeletedAt(aggregatedStatus, recordsWithAggregatedStatus, representativeRecord)),
                formatTime(resolveDeleteFailedAt(aggregatedStatus, recordsWithAggregatedStatus, representativeRecord)),
                resolveDeleteErrorMessage(aggregatedStatus, representativeRecord),
                records.size(),
                buildSummaryMessage(aggregatedStatus, aggregatedExecutionResultStatus, representativeRecord, records.size(), scenarioCode)
        );
    }

    /**
     * 拉取已经到期且仍处于 SCHEDULED 状态的工作区，供调度器分批处理。
     */
    public List<ExecutionWorkspaceCleanupEntity> findExpiredScheduledWorkspaces(LocalDateTime now, int limit) {
        if (now == null) {
            throw new IllegalArgumentException("now 不能为空");
        }
        int normalizedLimit = limit <= 0 ? 20 : limit;
        return executionWorkspaceCleanupRepository.findAllByStatusAndExpiresAtLessThanEqualOrderByExpiresAtAscIdAsc(
                STATUS_SCHEDULED,
                now,
                PageRequest.of(0, normalizedLimit)
        );
    }

    /**
     * 删除成功后写入最终成功态，避免后续调度继续扫描这条记录。
     */
    @Transactional
    public boolean markDeleted(Long recordId, LocalDateTime deletedAt) {
        if (recordId == null) {
            throw new IllegalArgumentException("recordId 不能为空");
        }
        if (deletedAt == null) {
            throw new IllegalArgumentException("deletedAt 不能为空");
        }
        return executionWorkspaceCleanupRepository.markDeletedIfScheduled(
                recordId,
                STATUS_SCHEDULED,
                STATUS_DELETED,
                deletedAt
        ) > 0;
    }

    /**
     * 删除失败后沉淀失败时间与原因，供后续排障或人工处理。
     */
    @Transactional
    public boolean markDeleteFailed(Long recordId, LocalDateTime failedAt, String errorMessage) {
        if (recordId == null) {
            throw new IllegalArgumentException("recordId 不能为空");
        }
        if (failedAt == null) {
            throw new IllegalArgumentException("failedAt 不能为空");
        }
        return executionWorkspaceCleanupRepository.markDeleteFailedIfScheduled(
                recordId,
                STATUS_SCHEDULED,
                STATUS_DELETE_FAILED,
                failedAt,
                defaultDeleteErrorMessage(errorMessage)
        ) > 0;
    }

    public long retentionHours() {
        return retentionHours;
    }

    /**
     * 通知与详情页都需要基于同一份 retention 配置输出文案，避免一处改配置、另一处仍写死 24 小时。
     */
    public String buildRetentionNotice(String scenarioCode, String resultStatus) {
        String normalizedResultStatus = defaultStatus(resultStatus);
        if ("SUCCESS".equals(normalizedResultStatus)) {
            return shouldUseDevelopmentSuccessGuidance(scenarioCode, normalizedResultStatus)
                    ? "本地工作区将在 " + retentionHours + " 小时后自动删除；如需走 MR，请在保留期内完成处理。"
                    : "本地工作区将在 " + retentionHours + " 小时后自动删除；如需保留代码或继续处理，请在保留期内完成。";
        }
        if ("FAILED".equals(normalizedResultStatus) || "CANCELED".equals(normalizedResultStatus)) {
            return "本地工作区将在 " + retentionHours + " 小时后自动删除；如需保留代码或继续处理，请在保留期内完成。";
        }
        return "";
    }

    private String defaultDeleteErrorMessage(String errorMessage) {
        String normalized = trimToNull(errorMessage);
        return normalized == null ? "删除执行工作区失败" : normalized;
    }

    /**
     * 任务详情页只显示一条摘要文案，因此这里把不同生命周期映射成明确的用户动作提示。
     */
    private String buildSummaryMessage(String aggregatedStatus,
                                       String aggregatedExecutionResultStatus,
                                       ExecutionWorkspaceCleanupEntity representativeRecord,
                                       int trackedWorkspaceCount,
                                       String scenarioCode) {
        if (STATUS_DELETED.equalsIgnoreCase(aggregatedStatus)) {
            return "本次执行登记的 " + trackedWorkspaceCount + " 个本地工作区已自动删除。";
        }
        if (STATUS_DELETE_FAILED.equalsIgnoreCase(aggregatedStatus)) {
            String errorMessage = trimToNull(representativeRecord.getDeleteErrorMessage());
            return errorMessage == null
                    ? "本次执行登记的本地工作区自动删除失败，请联系管理员处理。"
                    : "本次执行登记的本地工作区自动删除失败：" + errorMessage;
        }
        if (STATUS_SCHEDULED.equalsIgnoreCase(aggregatedStatus)) {
            return buildScheduledSummaryMessage(scenarioCode, aggregatedExecutionResultStatus);
        }
        return "本次执行已登记 " + trackedWorkspaceCount + " 个本地工作区，任务结束后将保留 " + retentionHours + " 小时并自动删除。";
    }

    private String buildScheduledSummaryMessage(String scenarioCode, String aggregatedExecutionResultStatus) {
        if (shouldUseDevelopmentSuccessGuidance(scenarioCode, aggregatedExecutionResultStatus)) {
            return "本次执行产生的本地工作区将在 " + retentionHours + " 小时后自动删除；如需走 MR，请在保留期内完成处理。";
        }
        return "本次执行产生的本地工作区将在 " + retentionHours + " 小时后自动删除；如需保留代码或继续处理，请在保留期内完成。";
    }

    private boolean shouldUseDevelopmentSuccessGuidance(String scenarioCode, String resultStatus) {
        return ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(trimToNull(scenarioCode))
                && "SUCCESS".equalsIgnoreCase(defaultStatus(resultStatus));
    }

    private boolean shouldRefreshScheduledState(ExecutionWorkspaceCleanupEntity entity, String normalizedResultStatus) {
        return !defaultStatus(entity.getExecutionResultStatus()).equals(defaultStatus(normalizedResultStatus))
                || entity.getScheduledAt() == null
                || entity.getExpiresAt() == null;
    }

    private void applyScheduledState(ExecutionWorkspaceCleanupEntity entity,
                                     String normalizedResultStatus,
                                     LocalDateTime scheduledAt,
                                     LocalDateTime expiresAt) {
        entity.setStatus(STATUS_SCHEDULED);
        entity.setExecutionResultStatus(normalizedResultStatus);
        entity.setScheduledAt(scheduledAt);
        entity.setExpiresAt(expiresAt);
        entity.setDeletedAt(null);
        entity.setDeleteFailedAt(null);
        entity.setDeleteErrorMessage(null);
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    /**
     * 聚合状态采用稳定优先级：
     * DELETE_FAILED > ACTIVE > SCHEDULED > DELETED。
     * 这样既不会让删除失败被“已删除”掩盖，也不会让当前仍在使用的工作区被历史排期态覆盖。
     */
    private String aggregateStatus(List<ExecutionWorkspaceCleanupEntity> records) {
        return records.stream()
                .map(ExecutionWorkspaceCleanupEntity::getStatus)
                .map(this::defaultStatus)
                .max(Comparator.comparingInt(this::statusPriority))
                .orElse("NONE");
    }

    private int statusPriority(String status) {
        return switch (defaultStatus(status)) {
            case STATUS_DELETE_FAILED -> 4;
            case STATUS_ACTIVE -> 3;
            case STATUS_SCHEDULED -> 2;
            case STATUS_DELETED -> 1;
            default -> 0;
        };
    }

    private String aggregateExecutionResultStatus(List<ExecutionWorkspaceCleanupEntity> records) {
        return records.stream()
                .map(ExecutionWorkspaceCleanupEntity::getExecutionResultStatus)
                .map(this::trimToNull)
                .filter(value -> value != null)
                .max(Comparator.comparingInt(this::executionResultPriority))
                .orElse(null);
    }

    private int executionResultPriority(String status) {
        return switch (defaultStatus(status)) {
            case "FAILED" -> 3;
            case "CANCELED" -> 2;
            case "SUCCESS" -> 1;
            default -> 0;
        };
    }

    private ExecutionWorkspaceCleanupEntity selectRepresentativeRecord(String aggregatedStatus,
                                                                       List<ExecutionWorkspaceCleanupEntity> records) {
        Comparator<ExecutionWorkspaceCleanupEntity> comparator = switch (defaultStatus(aggregatedStatus)) {
            case STATUS_DELETE_FAILED -> Comparator
                    .comparing(ExecutionWorkspaceCleanupEntity::getDeleteFailedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(ExecutionWorkspaceCleanupEntity::getId, Comparator.nullsLast(Comparator.naturalOrder()));
            case STATUS_ACTIVE -> Comparator
                    .comparing(ExecutionWorkspaceCleanupEntity::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(ExecutionWorkspaceCleanupEntity::getId, Comparator.nullsLast(Comparator.naturalOrder()));
            case STATUS_SCHEDULED -> Comparator
                    .comparing(ExecutionWorkspaceCleanupEntity::getExpiresAt, Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(ExecutionWorkspaceCleanupEntity::getId, Comparator.nullsLast(Comparator.naturalOrder()));
            case STATUS_DELETED -> Comparator
                    .comparing(ExecutionWorkspaceCleanupEntity::getDeletedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(ExecutionWorkspaceCleanupEntity::getId, Comparator.nullsLast(Comparator.naturalOrder()));
            default -> Comparator.comparing(ExecutionWorkspaceCleanupEntity::getId, Comparator.nullsLast(Comparator.naturalOrder()));
        };
        return records.stream().max(comparator).orElseThrow();
    }

    private LocalDateTime resolveExpiresAt(String aggregatedStatus,
                                           List<ExecutionWorkspaceCleanupEntity> records,
                                           ExecutionWorkspaceCleanupEntity representativeRecord) {
        if (STATUS_SCHEDULED.equalsIgnoreCase(aggregatedStatus)) {
            return records.stream()
                    .map(ExecutionWorkspaceCleanupEntity::getExpiresAt)
                    .filter(value -> value != null)
                    .max(LocalDateTime::compareTo)
                    .orElse(null);
        }
        return representativeRecord.getExpiresAt();
    }

    private LocalDateTime resolveDeletedAt(String aggregatedStatus,
                                           List<ExecutionWorkspaceCleanupEntity> records,
                                           ExecutionWorkspaceCleanupEntity representativeRecord) {
        if (STATUS_DELETED.equalsIgnoreCase(aggregatedStatus)) {
            return records.stream()
                    .map(ExecutionWorkspaceCleanupEntity::getDeletedAt)
                    .filter(value -> value != null)
                    .max(LocalDateTime::compareTo)
                    .orElse(null);
        }
        return representativeRecord.getDeletedAt();
    }

    private LocalDateTime resolveDeleteFailedAt(String aggregatedStatus,
                                                List<ExecutionWorkspaceCleanupEntity> records,
                                                ExecutionWorkspaceCleanupEntity representativeRecord) {
        if (STATUS_DELETE_FAILED.equalsIgnoreCase(aggregatedStatus)) {
            return records.stream()
                    .map(ExecutionWorkspaceCleanupEntity::getDeleteFailedAt)
                    .filter(value -> value != null)
                    .max(LocalDateTime::compareTo)
                    .orElse(null);
        }
        return representativeRecord.getDeleteFailedAt();
    }

    private String resolveDeleteErrorMessage(String aggregatedStatus, ExecutionWorkspaceCleanupEntity representativeRecord) {
        return STATUS_DELETE_FAILED.equalsIgnoreCase(aggregatedStatus)
                ? representativeRecord.getDeleteErrorMessage()
                : null;
    }

    private String defaultStatus(String status) {
        String normalized = trimToNull(status);
        return normalized == null ? "" : normalized.toUpperCase();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
