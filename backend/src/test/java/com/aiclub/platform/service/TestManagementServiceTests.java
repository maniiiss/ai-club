package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.dto.TestPlanSummary;
import com.aiclub.platform.dto.request.TestPlanRequest;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TestCaseRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TestManagementServiceTests {

    @Mock
    private TestPlanRepository testPlanRepository;

    @Mock
    private TestCaseRepository testCaseRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Mock
    private IterationRepository iterationRepository;

    @Mock
    private KnowledgeGraphService knowledgeGraphService;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private TestManagementService testManagementService;

    @BeforeEach
    void setUp() {
        testManagementService = new TestManagementService(
                testPlanRepository,
                testCaseRepository,
                projectRepository,
                projectGitlabBindingRepository,
                iterationRepository,
                knowledgeGraphService,
                projectDataPermissionService
        );
    }

    @Test
    void shouldBackfillPlanScheduleFromIterationWhenCreating() {
        ProjectEntity project = buildProject(7L);
        IterationEntity iteration = buildIteration(project, 12L, LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 20));

        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(iterationRepository.findByIdAndProject_Id(12L, 7L)).thenReturn(Optional.of(iteration));
        when(testPlanRepository.save(any(TestPlanEntity.class))).thenAnswer(invocation -> {
            TestPlanEntity entity = invocation.getArgument(0);
            entity.setId(21L);
            return entity;
        });

        TestPlanSummary summary = testManagementService.createTestPlan(new TestPlanRequest(
                "回归测试计划",
                7L,
                12L,
                "草稿",
                "用于验证迭代排期默认回填",
                null,
                null,
                null,
                null,
                List.of()
        ));

        assertThat(summary.startDate()).isEqualTo("2026-05-01");
        assertThat(summary.endDate()).isEqualTo("2026-05-20");
        verify(knowledgeGraphService).rebuildProjectGraph(7L);
    }

    @Test
    void shouldKeepExistingPlanScheduleWhenUpdatingSameIterationWithoutExplicitDates() {
        ProjectEntity project = buildProject(7L);
        IterationEntity iteration = buildIteration(project, 12L, LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 20));
        TestPlanEntity existingPlan = new TestPlanEntity();
        existingPlan.setId(21L);
        existingPlan.setName("老计划");
        existingPlan.setProject(project);
        existingPlan.setIteration(iteration);
        existingPlan.setStatus("草稿");
        existingPlan.setDescription("已有说明");
        existingPlan.setStartDate(LocalDate.of(2026, 5, 3));
        existingPlan.setEndDate(LocalDate.of(2026, 5, 18));

        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(testPlanRepository.findById(21L)).thenReturn(Optional.of(existingPlan));
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(iterationRepository.findByIdAndProject_Id(12L, 7L)).thenReturn(Optional.of(iteration));
        when(testPlanRepository.save(any(TestPlanEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TestPlanSummary summary = testManagementService.updateTestPlan(21L, new TestPlanRequest(
                "新计划",
                7L,
                12L,
                "待执行",
                "保留已有自定义时间",
                null,
                null,
                null,
                null,
                List.of()
        ));

        assertThat(existingPlan.getStartDate()).isEqualTo(LocalDate.of(2026, 5, 3));
        assertThat(existingPlan.getEndDate()).isEqualTo(LocalDate.of(2026, 5, 18));
        assertThat(summary.startDate()).isEqualTo("2026-05-03");
        assertThat(summary.endDate()).isEqualTo("2026-05-18");
        verify(knowledgeGraphService).rebuildProjectGraph(7L);
    }

    private ProjectEntity buildProject(Long id) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        project.setName("项目A");
        project.setOwner("负责人A");
        project.setStatus("进行中");
        project.setDescription("项目说明");
        return project;
    }

    private IterationEntity buildIteration(ProjectEntity project, Long id, LocalDate startDate, LocalDate endDate) {
        IterationEntity iteration = new IterationEntity();
        iteration.setId(id);
        iteration.setProject(project);
        iteration.setName("迭代A");
        iteration.setStatus("进行中");
        iteration.setStartDate(startDate);
        iteration.setEndDate(endDate);
        return iteration;
    }
}
