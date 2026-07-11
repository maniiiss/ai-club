package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskCommentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.TaskCommentRepository;
import com.aiclub.platform.repository.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证技术设计人工写回不会覆盖原工作项字段，并能幂等替换受管描述章节。
 */
@ExtendWith(MockitoExtension.class)
class TechnicalDesignWritebackServiceTests {

    @Mock private ExecutionArtifactRepository executionArtifactRepository;
    @Mock private TaskRepository taskRepository;
    @Mock private TaskCommentRepository taskCommentRepository;
    @Mock private ProjectDataPermissionService projectDataPermissionService;

    private TechnicalDesignWritebackService service;
    private ExecutionArtifactEntity artifact;
    private TaskEntity workItem;

    @BeforeEach
    void setUp() {
        service = new TechnicalDesignWritebackService(
                executionArtifactRepository,
                taskRepository,
                taskCommentRepository,
                projectDataPermissionService
        );
        ProjectEntity project = new ProjectEntity("项目", "owner", "进行中", "");
        project.setId(11L);
        workItem = new TaskEntity();
        workItem.setId(77L);
        workItem.setName("技术设计任务");
        workItem.setDescription("原始业务说明");
        workItem.setProject(project);
        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(100L);
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING);
        executionTask.setWorkItem(workItem);
        executionTask.setProject(project);
        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setId(200L);
        run.setStatus("SUCCESS");
        run.setExecutionTask(executionTask);
        artifact = new ExecutionArtifactEntity();
        artifact.setId(300L);
        artifact.setRun(run);
        artifact.setArtifactType(TechnicalDesignExecutionService.ARTIFACT_TECHNICAL_DESIGN);
        artifact.setContentText("# 技术设计 v1\n\n方案 A");
        when(executionArtifactRepository.findTechnicalDesignWritebackArtifact(100L, 300L))
                .thenReturn(Optional.of(artifact));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void shouldReplaceManagedDescriptionSectionWithoutDuplicatingOriginalDescription() {
        service.writeBack(100L, 300L, "DESCRIPTION");
        artifact.setContentText("# 技术设计 v2\n\n方案 B");
        service.writeBack(100L, 300L, "DESCRIPTION");

        assertThat(workItem.getDescription()).startsWith("原始业务说明");
        assertThat(workItem.getDescription()).contains("# 技术设计 v2").doesNotContain("# 技术设计 v1");
        assertThat(count(workItem.getDescription(), "<!-- TECHNICAL_DESIGN_AI_START -->")).isEqualTo(1);
        assertThat(artifact.isWorkItemWritebackFlag()).isTrue();
        verify(taskRepository, org.mockito.Mockito.times(2)).save(workItem);
    }

    @Test
    void shouldAppendFullDesignAsComment() {
        when(taskCommentRepository.save(any(TaskCommentEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.writeBack(100L, 300L, "COMMENT");
        when(taskCommentRepository.existsByTask_IdAndContentContaining(77L, "<!-- TECHNICAL_DESIGN_AI_ARTIFACT:300 -->"))
                .thenReturn(true);
        service.writeBack(100L, 300L, "COMMENT");

        verify(taskCommentRepository).save(any(TaskCommentEntity.class));
        assertThat(artifact.isWorkItemWritebackFlag()).isTrue();
    }

    private int count(String source, String token) {
        return (source.length() - source.replace(token, "").length()) / token.length();
    }
}
