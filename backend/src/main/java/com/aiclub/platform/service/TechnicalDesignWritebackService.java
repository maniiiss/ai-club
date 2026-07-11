package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.TaskCommentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.TaskCommentRepository;
import com.aiclub.platform.repository.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Locale;

/**
 * 技术设计产物人工写回服务。
 * 只允许处理最新成功运行的最终设计 Markdown，避免长任务结束后用旧快照覆盖工作项其他字段。
 */
@Service
public class TechnicalDesignWritebackService {

    private static final String START_MARKER = "<!-- TECHNICAL_DESIGN_AI_START -->";
    private static final String END_MARKER = "<!-- TECHNICAL_DESIGN_AI_END -->";

    private final ExecutionArtifactRepository executionArtifactRepository;
    private final TaskRepository taskRepository;
    private final TaskCommentRepository taskCommentRepository;
    private final ProjectDataPermissionService projectDataPermissionService;

    public TechnicalDesignWritebackService(ExecutionArtifactRepository executionArtifactRepository,
                                           TaskRepository taskRepository,
                                           TaskCommentRepository taskCommentRepository,
                                           ProjectDataPermissionService projectDataPermissionService) {
        this.executionArtifactRepository = executionArtifactRepository;
        this.taskRepository = taskRepository;
        this.taskCommentRepository = taskCommentRepository;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    @Transactional
    public ExecutionArtifactEntity writeBack(Long executionTaskId, Long artifactId, String rawMode) {
        ExecutionArtifactEntity artifact = executionArtifactRepository
                .findTechnicalDesignWritebackArtifact(executionTaskId, artifactId)
                .orElseThrow(() -> new IllegalArgumentException("仅允许写回当前技术设计任务最新成功运行的设计产物"));
        if (!hasText(artifact.getContentText())) {
            throw new IllegalArgumentException("技术设计产物内容为空，无法写回");
        }
        ExecutionTaskEntity executionTask = artifact.getRun().getExecutionTask();
        TaskEntity workItem = executionTask.getWorkItem();
        if (workItem == null) {
            throw new IllegalStateException("技术设计执行任务未关联工作项");
        }
        projectDataPermissionService.requireTaskVisible(workItem);
        String mode = defaultString(rawMode).trim().toUpperCase(Locale.ROOT);
        switch (mode) {
            case "DESCRIPTION" -> writeDescription(workItem, artifact.getContentText());
            case "COMMENT" -> writeComment(workItem, executionTask, artifact);
            default -> throw new IllegalArgumentException("写回方式仅支持 DESCRIPTION 或 COMMENT");
        }
        artifact.setWorkItemWritebackFlag(true);
        return executionArtifactRepository.save(artifact);
    }

    /**
     * 受管章节采用稳定标记，重复写回只替换该章节，不触碰负责人、迭代、状态等结构化字段。
     */
    private void writeDescription(TaskEntity workItem, String markdown) {
        String description = defaultString(workItem.getDescription());
        int start = description.indexOf(START_MARKER);
        int end = description.indexOf(END_MARKER);
        String base = description;
        if (start >= 0 && end >= start) {
            base = (description.substring(0, start) + description.substring(end + END_MARKER.length())).strip();
        }
        String managedSection = START_MARKER + "\n\n## AI 技术设计\n\n"
                + markdown.strip() + "\n\n" + END_MARKER;
        workItem.setDescription(base.isBlank() ? managedSection : base + "\n\n" + managedSection);
        workItem.setUpdatedAt(LocalDateTime.now());
        taskRepository.save(workItem);
    }

    private void writeComment(TaskEntity workItem, ExecutionTaskEntity executionTask, ExecutionArtifactEntity artifact) {
        String idempotencyMarker = "<!-- TECHNICAL_DESIGN_AI_ARTIFACT:" + artifact.getId() + " -->";
        if (taskCommentRepository.existsByTask_IdAndContentContaining(workItem.getId(), idempotencyMarker)) {
            return;
        }
        TaskCommentEntity comment = new TaskCommentEntity();
        comment.setTask(workItem);
        comment.setAuthorUser(null);
        comment.setAuthorName("技术设计 AI");
        comment.setContent(idempotencyMarker + "\n\n### 技术设计产物\n\n"
                + artifact.getContentText().strip()
                + "\n\n---\n来源执行任务：#" + executionTask.getId());
        taskCommentRepository.save(comment);
        workItem.setUpdatedAt(LocalDateTime.now());
        taskRepository.save(workItem);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
