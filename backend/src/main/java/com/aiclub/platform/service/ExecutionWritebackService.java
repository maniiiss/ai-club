package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.TaskCommentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.TaskCommentRepository;
import com.aiclub.platform.repository.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 执行结果回写服务。
 * 第一版只回写工作项评论，不直接覆盖工作项正文、状态或结构化字段。
 */
@Service
public class ExecutionWritebackService {

    private final TaskCommentRepository taskCommentRepository;
    private final TaskRepository taskRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;

    public ExecutionWritebackService(TaskCommentRepository taskCommentRepository,
                                     TaskRepository taskRepository,
                                     ExecutionArtifactRepository executionArtifactRepository) {
        this.taskCommentRepository = taskCommentRepository;
        this.taskRepository = taskRepository;
        this.executionArtifactRepository = executionArtifactRepository;
    }

    /**
     * 在运行结束后回写执行摘要到工作项评论，便于项目协作场景直接感知结果。
     */
    @Transactional
    public void writeBackToWorkItem(ExecutionTaskEntity executionTask, ExecutionRunEntity executionRun, List<ExecutionArtifactEntity> artifacts) {
        TaskEntity workItem = executionTask.getWorkItem();
        if (workItem == null) {
            return;
        }

        TaskCommentEntity comment = new TaskCommentEntity();
        comment.setTask(workItem);
        comment.setAuthorUser(null);
        comment.setAuthorName("执行中心");
        comment.setContent(buildCommentContent(executionTask, executionRun, artifacts));
        taskCommentRepository.save(comment);

        workItem.setUpdatedAt(LocalDateTime.now());
        taskRepository.save(workItem);

        if (artifacts != null) {
            artifacts.forEach(artifact -> artifact.setWorkItemWritebackFlag(true));
            executionArtifactRepository.saveAll(artifacts);
        }
    }

    private String buildCommentContent(ExecutionTaskEntity executionTask,
                                       ExecutionRunEntity executionRun,
                                       List<ExecutionArtifactEntity> artifacts) {
        StringBuilder builder = new StringBuilder();
        builder.append("### 执行中心回写\n")
                .append("- 执行任务：").append(defaultString(executionTask.getTitle())).append('\n')
                .append("- 执行场景：").append(defaultString(executionTask.getScenarioCode())).append('\n')
                .append("- 运行结果：").append(defaultString(executionRun.getStatus())).append('\n')
                .append("- 详情入口：/tasks/").append(executionTask.getId()).append("\n\n");

        if (hasText(executionRun.getOutputSummary())) {
            builder.append("#### 结果摘要\n")
                    .append(executionRun.getOutputSummary())
                    .append("\n\n");
        }

        if (hasText(executionRun.getErrorMessage())) {
            builder.append("#### 错误摘要\n")
                    .append(executionRun.getErrorMessage())
                    .append("\n\n");
        }

        if (artifacts != null && !artifacts.isEmpty()) {
            builder.append("#### 产物概览\n");
            for (ExecutionArtifactEntity artifact : artifacts) {
                builder.append("- ")
                        .append(defaultString(artifact.getTitle()))
                        .append("（")
                        .append(defaultString(artifact.getArtifactType()))
                        .append("）\n");
            }
        }
        return builder.toString().trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
