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
import static org.mockito.ArgumentMatchers.eq;
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
     * 历史平铺生成项继续原位更新，新接口才进入 Controller 子目录，人工项保持不动。
     */
    @Test
    void shouldKeepLegacyFlatRequestsAndCreateNewControllerDirectoryForNewEndpoints() {
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
                        endpoint("GET", "/api/users/{id}", "查询用户", "查询用户详情", "com.demo.UserController", "UserController", "用户管理"),
                        endpoint("POST", "/api/orders", "创建订单", "创建订单", "com.demo.OrderController", "OrderController", "订单中心")
                ),
                List.of()
        ));

        YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("sid=1");
        YaadeClientService.YaadeRemoteCollection rootCollection = collection(51L, "演示项目", null, 0, List.of("aiclub-project-10"));
        YaadeClientService.YaadeRemoteCollection orderCollection = collection(61L, "订单中心", 51L, 0, List.of("aiclub-project-10"));
        mockProjectBinding(binding.getProject(), session, rootCollection);
        when(yaadeClientService.listCollectionsInSubtree(session, 51L)).thenReturn(List.of(rootCollection));

        YaadeClientService.YaadeRemoteRequest generatedExisting = remoteRequest(101L, 51L, "GET", "/api/users/{id}", true, null, null, null);
        YaadeClientService.YaadeRemoteRequest generatedStale = remoteRequest(102L, 51L, "DELETE", "/api/old", true, null, null, null);
        YaadeClientService.YaadeRemoteRequest manualRequest = remoteRequest(103L, 51L, "GET", "/api/manual", false, null, null, null);
        when(yaadeClientService.listCollectionRequests(rootCollection)).thenReturn(List.of(generatedExisting, generatedStale, manualRequest));
        when(yaadeClientService.createCollection(session, "订单中心", 51L, List.of("aiclub-project-10"))).thenReturn(orderCollection);
        when(yaadeClientService.createRestRequest(any(), any(), any())).thenReturn(
                remoteRequest(201L, 61L, "POST", "/api/orders", true, "com.demo.OrderController", "OrderController", "订单中心")
        );
        when(yaadeClientService.updateRequest(any(), any())).thenAnswer(invocation -> invocation.getArgument(1));

        GitlabApiSyncResult result = gitlabApiSyncService.syncBindingApi(1L, new GitlabApiSyncRequest(null));

        assertThat(result.createdCount()).isEqualTo(1);
        assertThat(result.updatedCount()).isEqualTo(1);
        assertThat(result.deletedCount()).isEqualTo(1);
        assertThat(result.skippedCount()).isZero();

        ArgumentCaptor<YaadeClientService.YaadeRemoteRequest> updateCaptor = ArgumentCaptor.forClass(YaadeClientService.YaadeRemoteRequest.class);
        verify(yaadeClientService).updateRequest(eq(session), updateCaptor.capture());
        assertThat(updateCaptor.getValue().collectionId()).isEqualTo(51L);
        assertThat(updateCaptor.getValue().data().path("aiclubSync").path("controllerSignature").asText()).isEqualTo("com.demo.UserController");

        verify(yaadeClientService).createCollection(session, "订单中心", 51L, List.of("aiclub-project-10"));
        ArgumentCaptor<ObjectNode> createDataCaptor = ArgumentCaptor.forClass(ObjectNode.class);
        verify(yaadeClientService).createRestRequest(eq(session), eq(61L), createDataCaptor.capture());
        assertThat(createDataCaptor.getValue().path("aiclubSync").path("controllerSignature").asText()).isEqualTo("com.demo.OrderController");
        assertThat(createDataCaptor.getValue().path("aiclubSync").path("controllerDisplayName").asText()).isEqualTo("订单中心");

        verify(yaadeClientService).deleteRequest(session, 102L);
        verify(yaadeClientService, never()).deleteRequest(session, 103L);
    }

    /**
     * 当两个 Controller 解析出同名目录时，目录名需要追加类名，保持“一 Controller 一目录”。
     */
    @Test
    void shouldCreateSeparatedDirectoriesWhenControllerDisplayNamesConflict() {
        ProjectGitlabBindingEntity binding = buildBinding("""
                {"repoKind":"BACKEND"}
                """);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(extractClientService.extract(any())).thenReturn(new GitlabSpringApiExtractClientService.ExtractResponse(
                "main",
                "commit-2",
                2,
                List.of(
                        endpoint("GET", "/api/users", "查询用户", "查询用户", "com.demo.UserController", "UserController", "用户管理"),
                        endpoint("POST", "/api/admin/users", "创建后台用户", "创建后台用户", "com.demo.AdminUserController", "AdminUserController", "用户管理")
                ),
                List.of()
        ));

        YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("sid=1");
        YaadeClientService.YaadeRemoteCollection rootCollection = collection(51L, "演示项目", null, 0, List.of("aiclub-project-10"));
        YaadeClientService.YaadeRemoteCollection userCollection = collection(61L, "用户管理（UserController）", 51L, 0, List.of("aiclub-project-10"));
        YaadeClientService.YaadeRemoteCollection adminCollection = collection(62L, "用户管理（AdminUserController）", 51L, 1, List.of("aiclub-project-10"));
        mockProjectBinding(binding.getProject(), session, rootCollection);
        when(yaadeClientService.listCollectionsInSubtree(session, 51L)).thenReturn(List.of(rootCollection));
        when(yaadeClientService.listCollectionRequests(rootCollection)).thenReturn(List.of());
        when(yaadeClientService.createCollection(session, "用户管理（UserController）", 51L, List.of("aiclub-project-10"))).thenReturn(userCollection);
        when(yaadeClientService.createCollection(session, "用户管理（AdminUserController）", 51L, List.of("aiclub-project-10"))).thenReturn(adminCollection);
        when(yaadeClientService.createRestRequest(any(), any(), any())).thenAnswer(invocation ->
                remoteRequest(300L + invocation.getArgument(1, Long.class), invocation.getArgument(1), "GET", "/placeholder", true, null, null, null)
        );

        GitlabApiSyncResult result = gitlabApiSyncService.syncBindingApi(1L, new GitlabApiSyncRequest(null));

        assertThat(result.createdCount()).isEqualTo(2);
        ArgumentCaptor<Long> collectionIdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(yaadeClientService, org.mockito.Mockito.times(2)).createRestRequest(eq(session), collectionIdCaptor.capture(), any());
        assertThat(collectionIdCaptor.getAllValues()).containsExactly(61L, 62L);
        verify(yaadeClientService).createCollection(session, "用户管理（UserController）", 51L, List.of("aiclub-project-10"));
        verify(yaadeClientService).createCollection(session, "用户管理（AdminUserController）", 51L, List.of("aiclub-project-10"));
    }

    /**
     * 目录化生成项删到只剩空目录时，平台会清理该空目录，避免遗留无请求的 Controller 子目录。
     */
    @Test
    void shouldDeleteEmptyGeneratedControllerCollectionAfterRemovingLastGeneratedRequest() {
        ProjectGitlabBindingEntity binding = buildBinding("""
                {"repoKind":"BACKEND"}
                """);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(extractClientService.extract(any())).thenReturn(new GitlabSpringApiExtractClientService.ExtractResponse(
                "main",
                "commit-3",
                1,
                List.of(),
                List.of()
        ));

        YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("sid=1");
        YaadeClientService.YaadeRemoteCollection rootCollection = collection(51L, "演示项目", null, 0, List.of("aiclub-project-10"));
        YaadeClientService.YaadeRemoteCollection childCollection = collection(61L, "订单中心", 51L, 0, List.of("aiclub-project-10"));
        mockProjectBinding(binding.getProject(), session, rootCollection);
        when(yaadeClientService.listCollectionsInSubtree(session, 51L)).thenReturn(List.of(rootCollection, childCollection));
        when(yaadeClientService.listCollectionRequests(rootCollection)).thenReturn(List.of());
        when(yaadeClientService.listCollectionRequests(childCollection))
                .thenReturn(List.of(remoteRequest(201L, 61L, "POST", "/api/orders", true, "com.demo.OrderController", "OrderController", "订单中心")))
                .thenReturn(List.of());
        when(yaadeClientService.listCollectionsInSubtree(session, 61L)).thenReturn(List.of(childCollection));

        GitlabApiSyncResult result = gitlabApiSyncService.syncBindingApi(1L, new GitlabApiSyncRequest(null));

        assertThat(result.deletedCount()).isEqualTo(1);
        verify(yaadeClientService).deleteRequest(session, 201L);
        verify(yaadeClientService).deleteCollection(session, 61L);
    }

    /**
     * 请求体 DTO 字段说明需要写入 Yaade 描述 markdown，方便在工作台里直接看到字段注释。
     */
    @Test
    void shouldWriteBodyFieldDescriptionsIntoYaadeDescriptionMarkdown() {
        ProjectGitlabBindingEntity binding = buildBinding("""
                {"repoKind":"BACKEND"}
                """);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(extractClientService.extract(any())).thenReturn(new GitlabSpringApiExtractClientService.ExtractResponse(
                "main",
                "commit-4",
                1,
                List.of(new GitlabSpringApiExtractClientService.ExtractedEndpoint(
                        "POST",
                        "/api/users",
                        "创建用户",
                        "创建用户接口",
                        "com.demo.UserController",
                        "UserController",
                        "用户管理",
                        List.of(new GitlabSpringApiExtractClientService.ExtractedParameter("X-Tenant", "String", false, "", "租户编码")),
                        List.of(new GitlabSpringApiExtractClientService.ExtractedParameter("keyword", "String", false, "", "关键字检索词")),
                        List.of(new GitlabSpringApiExtractClientService.ExtractedParameter("id", "Long", true, "", "用户主键")),
                        List.of(
                                new GitlabSpringApiExtractClientService.ExtractedParameter("name", "String", false, "", "用户姓名"),
                                new GitlabSpringApiExtractClientService.ExtractedParameter("status", "UserStatus", false, "", "用户状态")
                        ),
                        "application/json",
                        "{\"name\":\"\",\"status\":\"ENABLED\"}",
                        "src/main/java/com/demo/UserController.java",
                        12,
                        "POST:/api/users"
                )),
                List.of()
        ));

        YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("sid=1");
        YaadeClientService.YaadeRemoteCollection rootCollection = collection(51L, "演示项目", null, 0, List.of("aiclub-project-10"));
        YaadeClientService.YaadeRemoteCollection userCollection = collection(61L, "用户管理", 51L, 0, List.of("aiclub-project-10"));
        mockProjectBinding(binding.getProject(), session, rootCollection);
        when(yaadeClientService.listCollectionsInSubtree(session, 51L)).thenReturn(List.of(rootCollection));
        when(yaadeClientService.listCollectionRequests(rootCollection)).thenReturn(List.of());
        when(yaadeClientService.createCollection(session, "用户管理", 51L, List.of("aiclub-project-10"))).thenReturn(userCollection);
        when(yaadeClientService.createRestRequest(any(), any(), any())).thenReturn(
                remoteRequest(201L, 61L, "POST", "/api/users", true, "com.demo.UserController", "UserController", "用户管理")
        );

        gitlabApiSyncService.syncBindingApi(1L, new GitlabApiSyncRequest(null));

        ArgumentCaptor<ObjectNode> createDataCaptor = ArgumentCaptor.forClass(ObjectNode.class);
        verify(yaadeClientService).createRestRequest(eq(session), eq(61L), createDataCaptor.capture());
        String description = createDataCaptor.getValue().path("description").asText("");
        assertThat(description).contains("### 路径参数");
        assertThat(description).contains("### 查询参数");
        assertThat(description).contains("### 请求头");
        assertThat(description).contains("### 请求体字段");
        assertThat(description).contains("`name`：String，可选，用户姓名");
        assertThat(description).contains("`status`：UserStatus，可选，用户状态");
    }

    private void mockProjectBinding(ProjectEntity project,
                                    YaadeClientService.YaadeSession session,
                                    YaadeClientService.YaadeRemoteCollection rootCollection) {
        YaadeProjectBindingSummary bindingSummary = new YaadeProjectBindingSummary(
                project.getId(),
                false,
                true,
                rootCollection.id(),
                "aiclub-project-" + project.getId(),
                YaadeProjectSyncService.STATUS_ACTIVE,
                project.getName(),
                null,
                null
        );
        when(yaadeProjectSyncService.ensureProjectBinding(project))
                .thenReturn(new YaadeProjectSyncService.EnsureProjectBindingResult(bindingSummary, false));
        when(yaadeClientService.loginAdmin()).thenReturn(session);
        when(yaadeClientService.findCollectionById(session, rootCollection.id())).thenReturn(rootCollection);
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
                                                                           String description,
                                                                           String controllerSignature,
                                                                           String controllerClassName,
                                                                           String controllerDisplayName) {
        return new GitlabSpringApiExtractClientService.ExtractedEndpoint(
                method,
                path,
                name,
                description,
                controllerSignature,
                controllerClassName,
                controllerDisplayName,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                "none",
                "",
                "src/main/java/com/demo/" + controllerClassName + ".java",
                12,
                method + ":" + path
        );
    }

    private YaadeClientService.YaadeRemoteCollection collection(Long id,
                                                                String name,
                                                                Long parentId,
                                                                Integer rank,
                                                                List<String> groups) {
        ObjectNode data = objectMapper.createObjectNode();
        data.put("name", name);
        data.put("rank", rank == null ? 0 : rank);
        if (parentId != null) {
            data.put("parentId", parentId);
        }
        var groupArray = data.putArray("groups");
        groups.forEach(groupArray::add);
        ObjectNode raw = objectMapper.createObjectNode();
        raw.put("id", id);
        raw.put("ownerId", 1L);
        raw.put("version", "1.0.0");
        raw.set("data", data);
        raw.set("requests", objectMapper.createArrayNode());
        raw.set("scripts", objectMapper.createArrayNode());
        return new YaadeClientService.YaadeRemoteCollection(id, 1L, "1.0.0", name, parentId, rank, groups, raw);
    }

    private YaadeClientService.YaadeRemoteRequest remoteRequest(Long id,
                                                                Long collectionId,
                                                                String method,
                                                                String path,
                                                                boolean generated,
                                                                String controllerSignature,
                                                                String controllerClassName,
                                                                String controllerDisplayName) {
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
            if (controllerSignature != null) {
                marker.put("controllerSignature", controllerSignature);
            }
            if (controllerClassName != null) {
                marker.put("controllerClassName", controllerClassName);
            }
            if (controllerDisplayName != null) {
                marker.put("controllerDisplayName", controllerDisplayName);
            }
        }
        ObjectNode raw = objectMapper.createObjectNode();
        raw.put("id", id);
        raw.put("collectionId", collectionId);
        raw.put("type", "REST");
        raw.put("version", "1.0.0");
        raw.set("data", data.deepCopy());
        return new YaadeClientService.YaadeRemoteRequest(id, collectionId, "REST", "1.0.0", data, raw);
    }
}
