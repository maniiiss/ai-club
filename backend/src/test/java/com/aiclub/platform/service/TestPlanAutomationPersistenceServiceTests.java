package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.TestCaseRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 业务意图：测试计划自动化状态机不能再让 RUNNING / CANCELED 这类中间或终态被强转成 FAILED，
 * 否则用户会在前端看到“失败”而其实任务正在执行或已取消。本测试覆盖新增的 markRunning 与 normalizeStatus 行为。
 */
@ExtendWith(MockitoExtension.class)
class TestPlanAutomationPersistenceServiceTests {

    @Mock
    private TestPlanRepository testPlanRepository;

    @Mock
    private TestCaseRepository testCaseRepository;

    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private TestPlanAutomationPersistenceService persistenceService;

    @BeforeEach
    void setUp() {
        persistenceService = new TestPlanAutomationPersistenceService(
                testPlanRepository,
                testCaseRepository,
                projectGitlabBindingRepository,
                projectDataPermissionService
        );
    }

    @Test
    void shouldPersistRunningStatusAndKeepRunIdWhenMarkRunning() {
        TestPlanEntity plan = new TestPlanEntity();
        plan.setId(501L);
        plan.setLastAutomationStatus("PENDING");
        when(testPlanRepository.findById(501L)).thenReturn(Optional.of(plan));
        when(testPlanRepository.save(any(TestPlanEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        persistenceService.markRunning(501L, 99L, 720L, "正在执行已接入的自动化脚本");

        ArgumentCaptor<TestPlanEntity> captor = ArgumentCaptor.forClass(TestPlanEntity.class);
        verify(testPlanRepository).save(captor.capture());
        assertThat(captor.getValue().getLastAutomationStatus()).isEqualTo("RUNNING");
        assertThat(captor.getValue().getLastAutomationTaskId()).isEqualTo(99L);
        assertThat(captor.getValue().getLastAutomationRunId()).isEqualTo(720L);
        assertThat(captor.getValue().getLastAutomationSummary()).isEqualTo("正在执行已接入的自动化脚本");
        assertThat(captor.getValue().getLastAutomationAt()).isNotNull();
    }

    @Test
    void shouldPersistCanceledStatusAsItIsWhenMarkFinished() {
        TestPlanEntity plan = new TestPlanEntity();
        plan.setId(601L);
        plan.setLastAutomationStatus("RUNNING");
        when(testPlanRepository.findById(601L)).thenReturn(Optional.of(plan));
        when(testPlanRepository.save(any(TestPlanEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        persistenceService.markFinished(601L, 99L, 720L, "CANCELED", "执行任务已取消", null);

        ArgumentCaptor<TestPlanEntity> captor = ArgumentCaptor.forClass(TestPlanEntity.class);
        verify(testPlanRepository).save(captor.capture());
        assertThat(captor.getValue().getLastAutomationStatus()).isEqualTo("CANCELED");
        assertThat(captor.getValue().getLastAutomationSummary()).isEqualTo("执行任务已取消");
        assertThat(captor.getValue().getLastAutomationMrUrl()).isNull();
    }

    @Test
    void shouldFallbackUnknownStatusToFailed() {
        TestPlanEntity plan = new TestPlanEntity();
        plan.setId(701L);
        plan.setLastAutomationStatus("RUNNING");
        when(testPlanRepository.findById(701L)).thenReturn(Optional.of(plan));
        when(testPlanRepository.save(any(TestPlanEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        persistenceService.markFinished(701L, 99L, 720L, "WHATEVER", "未知状态降级", null);

        ArgumentCaptor<TestPlanEntity> captor = ArgumentCaptor.forClass(TestPlanEntity.class);
        verify(testPlanRepository).save(captor.capture());
        assertThat(captor.getValue().getLastAutomationStatus()).isEqualTo("FAILED");
    }
}
