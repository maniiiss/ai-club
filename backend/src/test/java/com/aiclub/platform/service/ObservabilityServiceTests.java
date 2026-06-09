package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.ObservabilityProjectHealthSummary;
import com.aiclub.platform.dto.ProjectRuntimeInstanceSummary;
import com.aiclub.platform.dto.request.ObservabilityRuntimeInstanceUpdateRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import com.aiclub.platform.repository.ProjectRuntimeLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ObservabilityServiceTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository;

    @Mock
    private ProjectRuntimeLogRepository projectRuntimeLogRepository;

    @Mock
    private ProjectRuntimeInstanceService projectRuntimeInstanceService;

    @Mock
    private ProjectHealthService projectHealthService;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private ObservabilityService service;

    @BeforeEach
    void setUp() {
        service = new ObservabilityService(
                projectRepository,
                projectRuntimeInstanceRepository,
                projectRuntimeLogRepository,
                projectRuntimeInstanceService,
                projectHealthService,
                projectDataPermissionService,
                new ProjectHealthScorer()
        );
    }

    /**
     * 项目详情查询必须复用项目可见性校验，避免未授权用户通过项目 ID 直接查看日志和健康摘要。
     */
    @Test
    void shouldRequireProjectVisibleWhenReadingObservabilityProjectDetail() {
        ProjectEntity project = project(11L);
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        doThrow(new ForbiddenException("无权访问当前项目数据"))
                .when(projectDataPermissionService)
                .requireProjectVisible(project);

        assertThatThrownBy(() -> service.getProjectDetail(11L))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("无权访问当前项目数据");
    }

    /**
     * 运行实例观测配置更新必须同时满足“项目可见”和“项目可编辑”，不能只靠功能权限放行。
     */
    @Test
    void shouldRequireProjectEditableWhenUpdatingRuntimeInstance() {
        ProjectEntity project = project(11L);
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        doThrow(new ForbiddenException("当前角色配置不允许维护项目"))
                .when(projectDataPermissionService)
                .requireProjectEditable(project);

        assertThatThrownBy(() -> service.updateRuntimeInstance(11L, 31L, new ObservabilityRuntimeInstanceUpdateRequest(
                "生产 API",
                "prod",
                "api-service",
                true,
                "EXTERNAL_ENDPOINT",
                null,
                "https://api.example.com",
                false,
                List.of(),
                true,
                "HTTP",
                "https://api.example.com/health"
        )))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("当前角色配置不允许维护项目");
    }

    /**
     * 项目健康接口应直接复用健康服务结果，避免控制层和聚合层重复拼装摘要。
     */
    @Test
    void shouldDelegateProjectHealthQueryToHealthService() {
        ObservabilityProjectHealthSummary expected = new ObservabilityProjectHealthSummary(
                11L,
                "观测项目",
                90,
                ProjectHealthScorer.LEVEL_HEALTHY,
                "2026-06-09 00:00:00",
                2,
                2,
                0,
                List.of()
        );
        when(projectHealthService.getProjectHealth(11L)).thenReturn(expected);

        assertThat(service.getProjectHealth(11L)).isSameAs(expected);
    }

    /**
     * 更新实例成功时应直接转交运行实例服务，确保观测中心和现有运行实例校验规则一致。
     */
    @Test
    void shouldDelegateRuntimeInstanceUpdateToRuntimeInstanceService() {
        ProjectEntity project = project(11L);
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        ProjectRuntimeInstanceSummary summary = new ProjectRuntimeInstanceSummary(
                31L, 11L, "观测项目", "MANUAL", null, "生产 API", "prod", "api-service", true,
                "EXTERNAL_ENDPOINT", null, "", "https://api.example.com", false, List.of(),
                true, "HTTP", "https://api.example.com/health", null, null, null,
                null, null, null, null, null, null, null, null
        );
        when(projectRuntimeInstanceService.updateFromObservability(org.mockito.ArgumentMatchers.eq(11L), org.mockito.ArgumentMatchers.eq(31L), org.mockito.ArgumentMatchers.any()))
                .thenReturn(summary);

        ProjectRuntimeInstanceSummary result = service.updateRuntimeInstance(11L, 31L, new ObservabilityRuntimeInstanceUpdateRequest(
                "生产 API",
                "prod",
                "api-service",
                true,
                "EXTERNAL_ENDPOINT",
                null,
                "https://api.example.com",
                false,
                List.of(),
                true,
                "HTTP",
                "https://api.example.com/health"
        ));

        assertThat(result).isSameAs(summary);
        verify(projectRuntimeInstanceService).updateFromObservability(org.mockito.ArgumentMatchers.eq(11L), org.mockito.ArgumentMatchers.eq(31L), org.mockito.ArgumentMatchers.any());
    }

    private ProjectEntity project(Long id) {
        ProjectEntity project = new ProjectEntity("观测项目", "负责人", "进行中", "观测测试项目");
        project.setId(id);
        return project;
    }
}
