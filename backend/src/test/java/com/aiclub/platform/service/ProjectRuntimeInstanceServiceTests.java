package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import com.aiclub.platform.dto.ProjectRuntimeInstanceSummary;
import com.aiclub.platform.dto.request.ProjectRuntimeInstanceRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import com.aiclub.platform.repository.ServerInfoRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectRuntimeInstanceServiceTests {

    @Mock
    private ProjectRuntimeInstanceRepository runtimeInstanceRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ServerInfoRepository serverInfoRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private ProjectRuntimeInstanceService service;

    @BeforeEach
    void setUp() {
        service = new ProjectRuntimeInstanceService(
                runtimeInstanceRepository,
                projectRepository,
                serverInfoRepository,
                projectDataPermissionService,
                new ObjectMapper()
        );
    }

    /**
     * 受管服务器运行实例必须绑定已接入的 ServerInfo，日志路径会被规范化为 JSON 数组供后续 SSH 采集复用。
     */
    @Test
    void shouldCreateManagedServerRuntimeInstanceWithNormalizedLogPaths() {
        ProjectEntity project = project(11L);
        ServerInfoEntity server = server(21L);
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        when(serverInfoRepository.findById(21L)).thenReturn(Optional.of(server));
        when(runtimeInstanceRepository.save(any(ProjectRuntimeInstanceEntity.class)))
                .thenAnswer(invocation -> {
                    ProjectRuntimeInstanceEntity entity = invocation.getArgument(0);
                    entity.setId(31L);
                    return entity;
                });

        ProjectRuntimeInstanceSummary summary = service.createManual(11L, new ProjectRuntimeInstanceRequest(
                "生产 API",
                "prod",
                "api-service",
                true,
                ProjectRuntimeInstanceEntity.SERVER_MODE_MANAGED_SERVER,
                21L,
                null,
                true,
                List.of(" /srv/app/logs/app.log ", ""),
                true,
                ProjectRuntimeInstanceEntity.HEALTH_PROBE_HTTP,
                "http://api.example.com/actuator/health"
        ));

        ArgumentCaptor<ProjectRuntimeInstanceEntity> captor = ArgumentCaptor.forClass(ProjectRuntimeInstanceEntity.class);
        verify(runtimeInstanceRepository).save(captor.capture());
        ProjectRuntimeInstanceEntity saved = captor.getValue();
        assertThat(saved.getSourceType()).isEqualTo(ProjectRuntimeInstanceEntity.SOURCE_TYPE_MANUAL);
        assertThat(saved.getProject()).isSameAs(project);
        assertThat(saved.getServer()).isSameAs(server);
        assertThat(saved.getLogPathsJson()).isEqualTo("[\"/srv/app/logs/app.log\"]");
        assertThat(summary.id()).isEqualTo(31L);
        assertThat(summary.logPaths()).containsExactly("/srv/app/logs/app.log");
    }

    /**
     * 外部地址运行实例没有 SSH 上下文，第一版禁止开启日志采集，只允许作为健康检查目标。
     */
    @Test
    void shouldRejectLogCollectionForExternalEndpointRuntimeInstance() {
        ProjectEntity project = project(11L);
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service.createManual(11L, new ProjectRuntimeInstanceRequest(
                "外部 API",
                "prod",
                "api-service",
                true,
                ProjectRuntimeInstanceEntity.SERVER_MODE_EXTERNAL_ENDPOINT,
                null,
                "https://api.example.com",
                true,
                List.of("/var/log/app.log"),
                true,
                ProjectRuntimeInstanceEntity.HEALTH_PROBE_HTTP,
                "https://api.example.com/health"
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("外部地址实例不支持 SSH 日志采集");
    }

    /**
     * Jenkins 绑定保存运行实例时统一写入 JENKINS 来源和绑定 ID，避免后续可观测采集再从 Jenkins Job 参数猜测部署目标。
     */
    @Test
    void shouldSyncRuntimeInstancesForJenkinsBinding() {
        ProjectEntity project = project(11L);
        ProjectPipelineBindingEntity binding = new ProjectPipelineBindingEntity();
        binding.setId(51L);
        binding.setProject(project);
        when(runtimeInstanceRepository.save(any(ProjectRuntimeInstanceEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        service.syncJenkinsRuntimeInstances(binding, List.of(new ProjectRuntimeInstanceRequest(
                "生产 API",
                "prod",
                "api-service",
                true,
                ProjectRuntimeInstanceEntity.SERVER_MODE_EXTERNAL_ENDPOINT,
                null,
                "https://api.example.com",
                false,
                List.of(),
                true,
                ProjectRuntimeInstanceEntity.HEALTH_PROBE_HTTP,
                "https://api.example.com/health"
        )));

        ArgumentCaptor<ProjectRuntimeInstanceEntity> captor = ArgumentCaptor.forClass(ProjectRuntimeInstanceEntity.class);
        verify(runtimeInstanceRepository).deleteAllBySourceTypeAndSourceBindingId(ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS, 51L);
        verify(runtimeInstanceRepository).save(captor.capture());
        assertThat(captor.getValue().getProject()).isSameAs(project);
        assertThat(captor.getValue().getSourceType()).isEqualTo(ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS);
        assertThat(captor.getValue().getSourceBindingId()).isEqualTo(51L);
    }

    /**
     * Jenkins 成功进入队列只表示部署正在进行，运行实例状态不能提前标记为成功。
     */
    @Test
    void shouldMarkEnabledJenkinsRuntimeInstancesAsDeploying() {
        ProjectPipelineBindingEntity binding = new ProjectPipelineBindingEntity();
        binding.setId(51L);
        ProjectRuntimeInstanceEntity enabled = new ProjectRuntimeInstanceEntity();
        enabled.setEnabled(true);
        ProjectRuntimeInstanceEntity disabled = new ProjectRuntimeInstanceEntity();
        disabled.setEnabled(false);
        when(runtimeInstanceRepository.findAllBySourceTypeAndSourceBindingIdOrderByIdAsc(
                ProjectRuntimeInstanceEntity.SOURCE_TYPE_JENKINS,
                51L
        )).thenReturn(List.of(enabled, disabled));

        service.markJenkinsRuntimeInstancesDeploying(binding, "Jenkins Job 已进入队列");

        assertThat(enabled.getLastStatus()).isEqualTo(ProjectRuntimeInstanceEntity.STATUS_DEPLOYING);
        assertThat(enabled.getLastStatusMessage()).isEqualTo("Jenkins Job 已进入队列");
        assertThat(enabled.getLastDeployedAt()).isNotNull();
        assertThat(disabled.getLastStatus()).isNull();
        verify(runtimeInstanceRepository).saveAll(List.of(enabled));
    }

    /**
     * 运行实例读取必须复用项目可见性权限，非项目成员不能旁路读取可观测采集目标。
     */
    @Test
    void shouldRejectRuntimeInstanceListWhenProjectIsNotVisible() {
        ProjectEntity project = project(11L);
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        doThrow(new ForbiddenException("无权访问当前项目数据"))
                .when(projectDataPermissionService)
                .requireProjectVisible(project);

        assertThatThrownBy(() -> service.listByProject(11L))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("无权访问当前项目数据");
    }

    /**
     * 修改运行实例同样依赖项目可见性校验，避免用户拿到实例 ID 后跨项目更新采集配置。
     */
    @Test
    void shouldRejectRuntimeInstanceUpdateWhenProjectIsNotVisible() {
        ProjectEntity project = project(11L);
        ProjectRuntimeInstanceEntity entity = new ProjectRuntimeInstanceEntity();
        entity.setId(31L);
        entity.setProject(project);
        when(runtimeInstanceRepository.findByIdAndProject_Id(31L, 11L)).thenReturn(Optional.of(entity));
        doThrow(new ForbiddenException("无权访问当前项目数据"))
                .when(projectDataPermissionService)
                .requireProjectVisible(project);

        assertThatThrownBy(() -> service.update(11L, 31L, new ProjectRuntimeInstanceRequest(
                "生产 API",
                "prod",
                "api-service",
                true,
                ProjectRuntimeInstanceEntity.SERVER_MODE_EXTERNAL_ENDPOINT,
                null,
                "https://api.example.com",
                false,
                List.of(),
                true,
                ProjectRuntimeInstanceEntity.HEALTH_PROBE_HTTP,
                "https://api.example.com/health"
        )))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("无权访问当前项目数据");
    }

    private ProjectEntity project(Long id) {
        ProjectEntity project = new ProjectEntity("运行实例项目", "负责人", "进行中", "测试项目运行实例");
        project.setId(id);
        return project;
    }

    private ServerInfoEntity server(Long id) {
        ServerInfoEntity server = new ServerInfoEntity();
        server.setId(id);
        server.setName("生产服务器");
        server.setHost("10.10.10.10");
        server.setUsername("deploy");
        server.setEnabled(true);
        return server;
    }
}
