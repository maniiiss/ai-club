package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.YaadeApiRequestSummary;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class YaadeApiCatalogServiceTests {

    @Mock
    private YaadeProjectSyncService yaadeProjectSyncService;

    @Mock
    private YaadeClientService yaadeClientService;

    private ObjectMapper objectMapper;
    private YaadeApiCatalogService yaadeApiCatalogService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        yaadeApiCatalogService = new YaadeApiCatalogService(yaadeProjectSyncService, yaadeClientService);
    }

    /**
     * 请求列表只能来自当前项目根 collection 子树，避免 AI 用例抽屉误读其它项目接口。
     */
    @Test
    void shouldListRestRequestsInsideCurrentProjectSubtreeOnly() {
        ProjectEntity project = project();
        YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("sid=1");
        YaadeClientService.YaadeRemoteCollection root = collection(51L, "CRM项目", null);
        YaadeClientService.YaadeRemoteCollection userFolder = collection(61L, "用户管理", 51L);
        when(yaadeProjectSyncService.requireVisibleProject(10L)).thenReturn(project);
        when(yaadeProjectSyncService.getBindingSummary(10L)).thenReturn(binding());
        when(yaadeClientService.loginAdmin()).thenReturn(session);
        when(yaadeClientService.listCollectionsInSubtree(session, 51L)).thenReturn(List.of(root, userFolder));
        when(yaadeClientService.listCollectionRequests(root)).thenReturn(List.of(request(101L, 51L, "GET", "/api/root", "根接口", "REST")));
        when(yaadeClientService.listCollectionRequests(userFolder)).thenReturn(List.of(
                request(102L, 61L, "POST", "/api/users", "创建用户", "REST"),
                request(103L, 61L, "POST", "/graphql", "GraphQL 请求", "GRAPHQL")
        ));

        List<YaadeApiRequestSummary> result = yaadeApiCatalogService.listRequests(10L);

        assertThat(result).extracting(YaadeApiRequestSummary::requestId).containsExactly(101L, 102L);
        assertThat(result.get(1).collectionPath()).isEqualTo("CRM项目 / 用户管理");
    }

    /**
     * 指定其它项目 requestId 时，目录服务应按“不存在或不属于当前项目”处理。
     */
    @Test
    void shouldRejectRequestOutsideCurrentProjectSubtree() {
        ProjectEntity project = project();
        YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("sid=1");
        YaadeClientService.YaadeRemoteCollection root = collection(51L, "CRM项目", null);
        when(yaadeProjectSyncService.requireVisibleProject(10L)).thenReturn(project);
        when(yaadeProjectSyncService.getBindingSummary(10L)).thenReturn(binding());
        when(yaadeClientService.loginAdmin()).thenReturn(session);
        when(yaadeClientService.listCollectionsInSubtree(session, 51L)).thenReturn(List.of(root));
        when(yaadeClientService.listCollectionRequests(root)).thenReturn(List.of(request(101L, 51L, "GET", "/api/root", "根接口", "REST")));

        assertThatThrownBy(() -> yaadeApiCatalogService.requireRequest(10L, 999L))
                .isInstanceOf(java.util.NoSuchElementException.class)
                .hasMessageContaining("不属于当前项目");
    }

    private ProjectEntity project() {
        ProjectEntity project = new ProjectEntity("CRM项目", "张三", "进行中", "API AI 测试");
        project.setId(10L);
        return project;
    }

    private YaadeProjectBindingSummary binding() {
        return new YaadeProjectBindingSummary(10L, false, true, 51L, "aiclub-project-10", YaadeProjectSyncService.STATUS_ACTIVE, "CRM项目", null, null);
    }

    private YaadeClientService.YaadeRemoteCollection collection(Long id, String name, Long parentId) {
        ObjectNode data = objectMapper.createObjectNode().put("name", name).put("rank", id.intValue());
        if (parentId != null) {
            data.put("parentId", parentId);
        }
        data.putArray("groups").add("aiclub-project-10");
        ObjectNode raw = objectMapper.createObjectNode().put("id", id).put("ownerId", 1L).put("version", "1.0.0");
        raw.set("data", data);
        raw.set("requests", objectMapper.createArrayNode());
        raw.set("scripts", objectMapper.createArrayNode());
        return new YaadeClientService.YaadeRemoteCollection(id, 1L, "1.0.0", name, parentId, id.intValue(), List.of("aiclub-project-10"), raw);
    }

    private YaadeClientService.YaadeRemoteRequest request(Long id, Long collectionId, String method, String path, String name, String type) {
        ObjectNode data = objectMapper.createObjectNode()
                .put("name", name)
                .put("method", method)
                .put("uri", path);
        ObjectNode raw = objectMapper.createObjectNode()
                .put("id", id)
                .put("collectionId", collectionId)
                .put("type", type)
                .put("version", "1.0.0");
        raw.set("data", data.deepCopy());
        return new YaadeClientService.YaadeRemoteRequest(id, collectionId, type, "1.0.0", data, raw);
    }
}
