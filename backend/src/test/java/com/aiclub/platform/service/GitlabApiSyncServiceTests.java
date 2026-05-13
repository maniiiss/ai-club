package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.GitlabApiSyncResult;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.aiclub.platform.dto.request.GitlabApiSyncRequest;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
    private YaadeProjectSyncService yaadeProjectSyncService;

    @Mock
    private YaadeClientService yaadeClientService;

    private ObjectMapper objectMapper;
    private GitlabApiSyncService gitlabApiSyncService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        gitlabApiSyncService = new GitlabApiSyncService(
                bindingRepository,
                projectDataPermissionService,
                tokenCipherService,
                gitlabApiService,
                extractClientService,
                yaadeProjectSyncService,
                yaadeClientService,
                objectMapper
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
    }

    /**
     * 同步时只覆盖平台生成项：新增缺失接口、更新已有接口、删除源码已消失接口，并保留人工请求。
     */
    @Test
    void shouldCreateUpdateDeleteGeneratedRequestsAndKeepManualRequests() {
        ProjectGitlabBindingEntity binding = buildBinding("""
                {"repoKind":"BACKEND"}
                """);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(extractClientService.extract(any())).thenReturn(new GitlabSpringApiExtractClientService.ExtractResponse(
                "main",
                "commit-1",
                3,
                List.of(
                        endpoint("GET", "/api/users/{id}", "查询用户", "查询用户详情"),
                        endpoint("POST", "/api/users", "创建用户", "创建用户")
                ),
                List.of()
        ));
        YaadeProjectBindingSummary bindingSummary = new YaadeProjectBindingSummary(
                10L,
                false,
                true,
                51L,
                "aiclub-project-10",
                YaadeProjectSyncService.STATUS_ACTIVE,
                "演示项目",
                null,
                null
        );
        when(yaadeProjectSyncService.ensureProjectBinding(binding.getProject()))
                .thenReturn(new YaadeProjectSyncService.EnsureProjectBindingResult(bindingSummary, false));
        YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("sid=1");
        when(yaadeClientService.loginAdmin()).thenReturn(session);
        YaadeClientService.YaadeRemoteCollection collection = new YaadeClientService.YaadeRemoteCollection(
                51L,
                1L,
                "1.0.0",
                "演示项目",
                null,
                0,
                List.of("aiclub-project-10"),
                objectMapper.createObjectNode()
        );
        when(yaadeClientService.findCollectionById(session, 51L)).thenReturn(collection);
        YaadeClientService.YaadeRemoteRequest generatedExisting = remoteRequest(101L, "GET", "/api/users/{id}", true);
        YaadeClientService.YaadeRemoteRequest generatedStale = remoteRequest(102L, "DELETE", "/api/old", true);
        YaadeClientService.YaadeRemoteRequest manualRequest = remoteRequest(103L, "GET", "/api/manual", false);
        when(yaadeClientService.listCollectionRequests(collection)).thenReturn(List.of(generatedExisting, generatedStale, manualRequest));
        when(yaadeClientService.createRestRequest(any(), any(), any())).thenReturn(remoteRequest(201L, "POST", "/api/users", true));
        when(yaadeClientService.updateRequest(any(), any())).thenAnswer(invocation -> invocation.getArgument(1));

        GitlabApiSyncResult result = gitlabApiSyncService.syncBindingApi(1L, new GitlabApiSyncRequest(null));

        assertThat(result.createdCount()).isEqualTo(1);
        assertThat(result.updatedCount()).isEqualTo(1);
        assertThat(result.deletedCount()).isEqualTo(1);
        assertThat(result.skippedCount()).isZero();
        ArgumentCaptor<ObjectNode> createDataCaptor = ArgumentCaptor.forClass(ObjectNode.class);
        verify(yaadeClientService).createRestRequest(any(), any(), createDataCaptor.capture());
        assertThat(createDataCaptor.getValue().path("aiclubSync").path("source").asText()).isEqualTo("GITLAB_SPRING_API");
        assertThat(createDataCaptor.getValue().path("name").asText()).isEqualTo("创建用户");
        verify(yaadeClientService).deleteRequest(session, 102L);
        verify(yaadeClientService, never()).deleteRequest(session, 103L);
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

    private GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint(String method,
                                                                           String path,
                                                                           String name,
                                                                           String description) {
        return new GitlabSpringApiExtractClientService.ExtractedEndpoint(
                method,
                path,
                name,
                description,
                List.of(),
                List.of(),
                List.of(),
                "none",
                "",
                "src/main/java/com/demo/UserController.java",
                12,
                method + ":" + path
        );
    }

    private YaadeClientService.YaadeRemoteRequest remoteRequest(Long id, String method, String path, boolean generated) {
        ObjectNode data = objectMapper.createObjectNode();
        data.put("name", method + " " + path);
        data.put("uri", path);
        data.put("method", method);
        data.put("rank", id.intValue());
        if (generated) {
            ObjectNode marker = data.putObject("aiclubSync");
            marker.put("source", "GITLAB_SPRING_API");
            marker.put("bindingId", "1");
            marker.put("branch", "main");
            marker.put("method", method);
            marker.put("path", path);
        }
        ObjectNode raw = objectMapper.createObjectNode();
        raw.put("id", id);
        raw.put("collectionId", 51);
        raw.put("type", "REST");
        raw.put("version", "1.0.0");
        raw.set("data", data.deepCopy());
        return new YaadeClientService.YaadeRemoteRequest(id, 51L, "REST", "1.0.0", data, raw);
    }
}
