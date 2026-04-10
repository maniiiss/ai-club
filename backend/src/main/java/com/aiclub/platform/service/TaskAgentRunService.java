package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.TaskAgentRunEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.repository.TaskAgentRunRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class TaskAgentRunService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TaskRepository taskRepository;
    private final TaskAgentRunRepository taskAgentRunRepository;
    private final UserRepository userRepository;
    private final AgentExecutionService agentExecutionService;
    private final ProjectDataPermissionService projectDataPermissionService;

    public TaskAgentRunService(TaskRepository taskRepository,
                               TaskAgentRunRepository taskAgentRunRepository,
                               UserRepository userRepository,
                               AgentExecutionService agentExecutionService,
                               ProjectDataPermissionService projectDataPermissionService) {
        this.taskRepository = taskRepository;
        this.taskAgentRunRepository = taskAgentRunRepository;
        this.userRepository = userRepository;
        this.agentExecutionService = agentExecutionService;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    public List<TaskAgentRunSummary> listRecentRuns(Long taskId) {
        requireTask(taskId);
        return taskAgentRunRepository.findTop10ByTask_IdOrderByCreatedAtDescIdDesc(taskId).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public TaskAgentRunSummary runTaskAgent(Long taskId, String input) {
        TaskEntity task = requireTask(taskId);
        if (task.getAgent() == null) {
            throw new IllegalArgumentException("当前任务未绑定执行 Agent");
        }

        UserEntity requester = currentUser();
        String finalInput = hasText(input) ? input.trim() : buildDefaultInput(task);

        TaskAgentRunEntity entity = new TaskAgentRunEntity();
        entity.setTask(task);
        entity.setAgent(task.getAgent());
        entity.setRequesterUser(requester);
        entity.setStatus("RUNNING");
        entity.setInputText(finalInput);
        entity = taskAgentRunRepository.save(entity);

        try {
            String output = agentExecutionService.runAgent(task.getAgent().getId(), finalInput, buildRuntimeVariables(task, requester));
            entity.setStatus("SUCCESS");
            entity.setOutputText(output);
            entity.setErrorMessage(null);
        } catch (RuntimeException exception) {
            entity.setStatus("FAILED");
            entity.setOutputText(null);
            entity.setErrorMessage(limitMessage(exception.getMessage()));
        }

        return toSummary(taskAgentRunRepository.save(entity));
    }

    private Map<String, String> buildRuntimeVariables(TaskEntity task, UserEntity requester) {
        Map<String, String> variables = new LinkedHashMap<>();
        variables.put("task_id", String.valueOf(task.getId()));
        variables.put("task_name", task.getName());
        variables.put("project_id", String.valueOf(task.getProject().getId()));
        variables.put("project_name", task.getProject().getName());
        variables.put("agent_id", task.getAgent() == null ? "" : String.valueOf(task.getAgent().getId()));
        variables.put("agent_name", task.getAgent() == null ? "" : task.getAgent().getName());
        variables.put("assignee", task.getAssignee());
        if (requester != null) {
            variables.put("user_id", String.valueOf(requester.getId()));
            variables.put("user_name", displayName(requester));
            variables.put("session_key", "task:" + task.getId() + ":user:" + requester.getId());
        } else {
            variables.put("session_key", "task:" + task.getId());
        }
        return variables;
    }

    private String buildDefaultInput(TaskEntity task) {
        return """
                Task: %s
                Project: %s
                Status: %s
                Priority: %s
                Assignee: %s
                Work Hours: %s

                Description:
                %s
                """.formatted(
                task.getName(),
                task.getProject().getName(),
                task.getStatus(),
                task.getPriority(),
                task.getAssignee(),
                task.getWorkHours() == null ? "-" : task.getWorkHours().toPlainString(),
                defaultString(task.getDescription())
        ).trim();
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
                entity.getRequesterUser() == null ? null : displayName(entity.getRequesterUser()),
                entity.getCreatedAt() == null ? null : entity.getCreatedAt().format(TIME_FORMATTER)
        );
    }

    private TaskEntity requireTask(Long taskId) {
        TaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("任务不存在: " + taskId));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireTaskVisible(task);
        }
        return task;
    }

    private UserEntity currentUser() {
        Long userId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (userId == null) {
            return null;
        }
        return userRepository.findById(userId).orElse(null);
    }

    private String displayName(UserEntity user) {
        if (user == null) {
            return null;
        }
        String nickname = defaultString(user.getNickname()).trim();
        return nickname.isBlank() ? user.getUsername() : nickname;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "任务 Agent 执行失败";
        }
        return message.length() > 1000 ? message.substring(0, 1000) : message;
    }
}
