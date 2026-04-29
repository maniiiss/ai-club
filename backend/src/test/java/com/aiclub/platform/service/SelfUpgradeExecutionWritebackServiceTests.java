package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolPlanEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunTargetEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolTargetEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolRunRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolRunTargetRepository;
import com.aiclub.platform.repository.SelfUpgradeSuggestionRepository;
import com.aiclub.platform.repository.SelfUpgradeWorkItemRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证自升级巡检在执行中心落成 FAILED 时，仍会消费已产出的结构化 targetResults，
 * 避免巡检运行页只剩“所有目标都执行失败”而看不到每个目标的真实报错。
 */
@ExtendWith(MockitoExtension.class)
class SelfUpgradeExecutionWritebackServiceTests {

    @Mock
    private SelfUpgradePatrolRunRepository patrolRunRepository;

    @Mock
    private SelfUpgradePatrolRunTargetRepository patrolRunTargetRepository;

    @Mock
    private SelfUpgradeWorkItemRepository workItemRepository;

    @Mock
    private SelfUpgradeSuggestionRepository suggestionRepository;

    @Mock
    private SelfUpgradeSuggestionService suggestionService;

    @Mock
    private SelfUpgradePatrolPlanService patrolPlanService;

    @Mock
    private ExecutionStepRepository executionStepRepository;

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    private SelfUpgradeExecutionWritebackService writebackService;

    @BeforeEach
    void setUp() {
        writebackService = new SelfUpgradeExecutionWritebackService(
                patrolRunRepository,
                patrolRunTargetRepository,
                workItemRepository,
                suggestionRepository,
                suggestionService,
                patrolPlanService,
                executionStepRepository,
                executionArtifactRepository,
                new ObjectMapper()
        );
    }

    @Test
    void shouldWriteBackStructuredTargetFailuresEvenWhenExecutionTerminalStatusIsFailed() {
        SelfUpgradePatrolRunEntity patrolRun = new SelfUpgradePatrolRunEntity();
        patrolRun.setId(3L);
        patrolRun.setPlan(buildPlan(1L));

        SelfUpgradePatrolRunTargetEntity firstTarget = buildRunTarget(5L, 1L, "首页核心路径巡检");
        SelfUpgradePatrolRunTargetEntity secondTarget = buildRunTarget(6L, 2L, "设置页表单体验巡检");

        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(14L);
        executionTask.setSourceType("SELF_UPGRADE_PATROL_RUN");
        executionTask.setSourceId(3L);
        executionTask.setLatestSummary("巡检失败，所有目标都执行失败");

        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(28L);

        ExecutionStepEntity patrolStep = new ExecutionStepEntity();
        patrolStep.setId(137L);
        patrolStep.setOutputSnapshot("""
                {
                  "status": "FAILED",
                  "summary": "巡检失败，所有目标都执行失败",
                  "targetResults": [
                    {
                      "targetId": 1,
                      "name": "首页核心路径巡检",
                      "status": "FAILED",
                      "pagePath": "blank",
                      "stepCount": 0,
                      "findingCount": 0,
                      "skippedGuardrailCount": 0,
                      "summary": "page.goto: net::ERR_CONNECTION_CLOSED at https://staging.example.com/\\nCall log:\\n  - navigating to \\\"https://staging.example.com/\\\"",
                      "artifacts": [],
                      "findings": []
                    },
                    {
                      "targetId": 2,
                      "name": "设置页表单体验巡检",
                      "status": "FAILED",
                      "pagePath": "blank",
                      "stepCount": 0,
                      "findingCount": 0,
                      "skippedGuardrailCount": 0,
                      "summary": "page.goto: net::ERR_CONNECTION_CLOSED at https://staging.example.com/settings\\nCall log:\\n  - navigating to \\\"https://staging.example.com/settings\\\"",
                      "artifacts": [],
                      "findings": []
                    }
                  ],
                  "artifacts": []
                }
                """);

        when(patrolRunRepository.findById(3L)).thenReturn(Optional.of(patrolRun));
        when(patrolRunRepository.save(any(SelfUpgradePatrolRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(patrolRunTargetRepository.findAllByRun_IdOrderByIdAsc(3L)).thenReturn(List.of(firstTarget, secondTarget));
        when(patrolRunTargetRepository.save(any(SelfUpgradePatrolRunTargetEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(28L)).thenReturn(List.of(patrolStep));
        when(executionArtifactRepository.findAllByRun_IdOrderByCreatedAtAscIdAsc(28L)).thenReturn(List.of());

        writebackService.handleExecutionFinished(executionTask, executionRun, "FAILED");

        assertThat(patrolRun.getStatus()).isEqualTo("FAILED");
        assertThat(patrolRun.getFailedTargetCount()).isEqualTo(2);
        assertThat(patrolRun.getSuccessTargetCount()).isZero();
        assertThat(patrolRun.getPartialSuccessTargetCount()).isZero();
        assertThat(firstTarget.getStatus()).isEqualTo("FAILED");
        assertThat(firstTarget.getPagePath()).isEqualTo("blank");
        assertThat(firstTarget.getSummary()).contains("ERR_CONNECTION_CLOSED");
        assertThat(secondTarget.getStatus()).isEqualTo("FAILED");
        assertThat(secondTarget.getSummary()).contains("/settings");
        verify(patrolPlanService).markLastRun(eq(1L), eq("FAILED"), contains("所有目标都执行失败"), any());
        verify(suggestionService, never()).recordFinding(any(), any(), any(), any());
    }

    private SelfUpgradePatrolPlanEntity buildPlan(Long id) {
        SelfUpgradePatrolPlanEntity entity = new SelfUpgradePatrolPlanEntity();
        entity.setId(id);
        return entity;
    }

    private SelfUpgradePatrolRunTargetEntity buildRunTarget(Long id, Long planTargetId, String name) {
        SelfUpgradePatrolTargetEntity planTarget = new SelfUpgradePatrolTargetEntity();
        planTarget.setId(planTargetId);

        SelfUpgradePatrolRunTargetEntity entity = new SelfUpgradePatrolRunTargetEntity();
        entity.setId(id);
        entity.setPlanTarget(planTarget);
        entity.setTargetName(name);
        entity.setStatus("PENDING");
        return entity;
    }
}
