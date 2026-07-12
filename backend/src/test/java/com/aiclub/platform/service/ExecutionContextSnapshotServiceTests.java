package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/** 验证执行任务创建时需求与技术设计上下文的快照规则。 */
@ExtendWith(MockitoExtension.class)
class ExecutionContextSnapshotServiceTests {

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    @Test
    void technicalDesignRequiresLinkedRequirementAndIncludesRequirementSnapshot() {
        TaskEntity workItem = task("技术设计任务", "技术设计");
        TaskEntity requirement = task("支付需求", "");
        requirement.setId(11L);
        requirement.setRequirementMarkdown("# 需求\n\n支付订单");
        workItem.setRequirementTask(requirement);

        ExecutionContextSnapshotService service = new ExecutionContextSnapshotService(executionArtifactRepository);

        ExecutionContextSnapshotService.ContextSnapshot snapshot = service.snapshot(
                workItem,
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                true,
                true
        );

        assertThat(snapshot.requirementIncluded()).isTrue();
        assertThat(snapshot.requirementContext().get("requirementMarkdown")).isEqualTo("# 需求\n\n支付订单");
    }

    @Test
    void technicalDesignRejectsWorkItemWithoutRequirement() {
        TaskEntity workItem = task("技术设计任务", "技术设计");
        ExecutionContextSnapshotService service = new ExecutionContextSnapshotService(executionArtifactRepository);

        assertThatThrownBy(() -> service.snapshot(
                workItem,
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                true,
                true
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("必须关联需求");
    }

    @Test
    void developmentContextOptionsAreIndependentAndMissingDesignIsNonBlocking() {
        TaskEntity workItem = task("开发任务", "开发任务");
        TaskEntity requirement = task("支付需求", "");
        requirement.setId(11L);
        requirement.setRequirementMarkdown("需求正文");
        workItem.setRequirementTask(requirement);

        when(executionArtifactRepository.findLatestSuccessfulTechnicalDesignArtifact(11L, PageRequest.of(0, 1)))
                .thenReturn(new PageImpl<>(java.util.List.of()));

        ExecutionContextSnapshotService.ContextSnapshot snapshot = new ExecutionContextSnapshotService(executionArtifactRepository).snapshot(
                workItem,
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                false,
                true
        );

        assertThat(snapshot.requirementIncluded()).isFalse();
        assertThat(snapshot.technicalDesignIncluded()).isFalse();
        assertThat(snapshot.warnings()).anyMatch(item -> item.contains("技术设计"));
    }

    private static TaskEntity task(String name, String taskType) {
        TaskEntity task = new TaskEntity();
        task.setId(22L);
        task.setName(name);
        task.setWorkItemType("任务");
        task.setTaskType(taskType);
        task.setDescription(name + "说明");
        return task;
    }
}
