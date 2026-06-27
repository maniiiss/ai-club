package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.request.GitlabApiSyncRequest;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.service.apistudio.ApiStudioGitlabSyncService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 迁移后 {@link GitlabApiSyncService} 只承担前置校验、参数构建和调用编排，
 * 真正的写入逻辑下沉到 {@link ApiStudioGitlabSyncService}（由专门的测试覆盖）。
 *
 * 这里只验证前置守卫（仓库类型、绑定停用等）和不触发 extract 的负面用例。
 */
@ExtendWith(MockitoExtension.class)
class GitlabApiSyncServiceTests {

    @Mock
    private ProjectGitlabBindingRepository bindingRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private GitlabApiService gitlabApiService;

    @Mock
    private GitlabSpringApiExtractClientService extractClientService;

    @Mock
    private ApiStudioGitlabSyncService apiStudioGitlabSyncService;

    private GitlabApiSyncService gitlabApiSyncService;

    @BeforeEach
    void setUp() {
        gitlabApiSyncService = new GitlabApiSyncService(
                bindingRepository,
                projectDataPermissionService,
                tokenCipherService,
                gitlabApiService,
                extractClientService,
                apiStudioGitlabSyncService,
                new ObjectMapper()
        );
    }

    /**
     * 同步 API 只允许后端仓库和混合仓库，避免前端仓库误触发 Spring 接口抽取。
     */
    @Test
    void shouldRejectFrontendRepositoryKind() {
        ProjectGitlabBindingEntity binding = buildBinding("""
                {"repoKind":"FRONTEND"}
                """);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> gitlabApiSyncService.syncBindingApi(1L, new GitlabApiSyncRequest(null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("仅后端仓库和混合仓库支持同步 API");

        verify(extractClientService, never()).extract(any());
        verify(apiStudioGitlabSyncService, never()).sync(any(), any(), any(), any(), any(), any());
    }

    /**
     * 绑定被停用时拒绝同步。
     */
    @Test
    void shouldRejectDisabledBinding() {
        ProjectGitlabBindingEntity binding = buildBinding("""
                {"repoKind":"BACKEND"}
                """);
        binding.setEnabled(false);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> gitlabApiSyncService.syncBindingApi(1L, new GitlabApiSyncRequest(null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("已停用");

        verify(extractClientService, never()).extract(any());
    }

    private ProjectGitlabBindingEntity buildBinding(String testProfileJson) {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "用于同步 API 测试");
        project.setId(10L);
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/demo");
        binding.setGitlabProjectPath("group/demo");
        binding.setGitlabHttpCloneUrl("http://gitlab.example.com/group/demo.git");
        binding.setDefaultTargetBranch("main");
        binding.setTokenCiphertext("cipher-token");
        binding.setEnabled(true);
        binding.setTestProfileJson(testProfileJson);
        return binding;
    }
}
