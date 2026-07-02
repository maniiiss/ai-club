package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.TaskAgentRunEntity;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.repository.TaskAgentRunRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 旧任务 Agent 运行接口兼容层。
 * 新运行记录优先从执行中心读取，历史老表仅作为兜底展示使用。
 */
@Service
@Transactional(readOnly = true)
public class TaskAgentRunService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ExecutionTaskService executionTaskService;
    private final TaskAgentRunRepository taskAgentRunRepository;

    public TaskAgentRunService(ExecutionTaskService executionTaskService,
                               TaskAgentRunRepository taskAgentRunRepository) {
        this.executionTaskService = executionTaskService;
        this.taskAgentRunRepository = taskAgentRunRepository;
    }

    public List<TaskAgentRunSummary> listRecentRuns(Long taskId) {
        List<TaskAgentRunSummary> executionRuns = executionTaskService.listRecentWorkItemRuns(taskId);
        if (!executionRuns.isEmpty()) {
            return executionRuns;
        }
        return taskAgentRunRepository.findTop10ByTask_IdOrderByCreatedAtDescIdDesc(taskId).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public ExecutionTaskSummary runTaskAgent(Long taskId, String input) {
        return executionTaskService.createLegacyExecutionTask(taskId, input);
    }

    private TaskAgentRunSummary toSummary(TaskAgentRunEntity entity) {
        return new TaskAgentRunSummary(
                entity.getId(),
                entity.getTask().getId(),
                entity.getTask().getName(),
                entity.getAgent() == null ? null : entity.getAgent().getId(),
                entity.getAgent() == null ? null : entity.getAgent().getName(),
                entity.getStatus(),
                entity.getInputText(),
                entity.getOutputText(),
                entity.getErrorMessage(),
                entity.getRequesterUser() == null ? null : entity.getRequesterUser().getId(),
                entity.getRequesterUser() == null ? null : displayName(entity.getRequesterUser().getNickname(), entity.getRequesterUser().getUsername()),
                entity.getCreatedAt() == null ? null : entity.getCreatedAt().format(TIME_FORMATTER)
        );
    }

    private String displayName(String nickname, String username) {
        String normalizedNickname = nickname == null ? "" : nickname.trim();
        return normalizedNickname.isBlank() ? username : normalizedNickname;
    }
}
