package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitPilotDesignVersionEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.design.DesignVersionDtos;
import com.aiclub.platform.repository.GitPilotDesignVersionRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 验证 Design 上传的幂等、快照安全边界和项目当前版本切换语义。 */
@ExtendWith(MockitoExtension.class)
class GitPilotDesignVersionServiceTests {

    @Mock
    private GitPilotDesignVersionRepository versionRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private GitPilotDesignVersionService service;

    @BeforeEach
    void setUp() {
        service = new GitPilotDesignVersionService(
                versionRepository,
                projectRepository,
                projectDataPermissionService,
                objectMapper
        );
    }

    @Test
    void shouldReturnExistingVersionWhenRetryingSameDesignRevision() throws Exception {
        ProjectEntity project = project(1L);
        GitPilotDesignVersionEntity existing = version(42L, 1L, "design-login", "rev-3", 3, "DRAFT");
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        when(versionRepository.findByProjectIdAndDesignIdAndRevisionId(1L, "design-login", "rev-3"))
                .thenReturn(Optional.of(existing));

        DesignVersionDtos.DesignVersionSummary result = service.upload(1L, request("pages/login/index.html"), 7L);

        assertThat(result.id()).isEqualTo(42L);
        assertThat(result.versionNumber()).isEqualTo(3);
        assertThat(result.status()).isEqualTo("DRAFT");
        verify(projectDataPermissionService).requireProjectVisible(project);
        verify(versionRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void shouldRejectInvalidCanvasReferenceBeforePersistingScene() throws Exception {
        ProjectEntity project = project(1L);
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service.upload(1L, invalidRequest(), 7L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("根节点不存在");

        verify(versionRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void shouldRejectDuplicateChildReference() throws Exception {
        ProjectEntity project = project(1L);
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        JsonNode scene = sceneWithChild();
        ((ArrayNode) scene.path("nodes").path("frame-login").path("childIds")).add("child");

        assertThatThrownBy(() -> service.upload(1L, requestWithScene(scene), 7L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("重复");
    }

    @Test
    void shouldRejectPageRootWithParentAndUnreachableTopLevelNode() throws Exception {
        ProjectEntity project = project(1L);
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        JsonNode scene = scene();
        ((ObjectNode) scene.path("nodes").path("frame-login")).put("parentId", "missing");

        assertThatThrownBy(() -> service.upload(1L, requestWithScene(scene), 7L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("父节点不存在");
    }

    @Test
    void shouldDetectCycleEvenWhenCycleIsDisconnectedFromPageRoot() throws Exception {
        ProjectEntity project = project(1L);
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        JsonNode scene = sceneWithDisconnectedCycle();

        assertThatThrownBy(() -> service.upload(1L, requestWithScene(scene), 7L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("循环引用");
    }

    @Test
    void shouldRejectMissingImageAndFontResources() throws Exception {
        ProjectEntity project = project(1L);
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        JsonNode imageScene = sceneWithImage("missing-image");
        assertThatThrownBy(() -> service.upload(1L, requestWithScene(imageScene), 7L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("图片资源不存在");

        JsonNode fontScene = sceneWithText("missing-font");
        assertThatThrownBy(() -> service.upload(1L, requestWithScene(fontScene), 7L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("字体资源不存在");
    }

    @Test
    void shouldExposeLegacyVersionAsExplicitlyIncompatible() {
        ProjectEntity project = project(1L);
        GitPilotDesignVersionEntity legacy = version(42L, 1L, "design-login", "legacy-rev", 1, "ARCHIVED");
        legacy.setSceneJson(null);
        legacy.setPreviewImage(null);
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        when(versionRepository.findByProjectIdOrderByCreatedAtDescIdDesc(1L)).thenReturn(List.of(legacy));
        when(versionRepository.findById(42L)).thenReturn(Optional.of(legacy));

        assertThat(service.list(1L).versions().get(0).canvasCompatible()).isFalse();
        assertThat(service.list(1L).versions().get(0).compatibilityMessage()).contains("旧 HTML");
        assertThat(service.get(1L, 42L).scene()).isNull();
        assertThat(service.get(1L, 42L).compatibilityMessage()).contains("新建原生 Canvas");
    }

    @Test
    void shouldArchivePriorCurrentVersionWhenActivatingAnotherRevision() {
        ProjectEntity project = project(1L);
        GitPilotDesignVersionEntity previous = version(10L, 1L, "design-login", "rev-2", 2, "CURRENT");
        GitPilotDesignVersionEntity target = version(11L, 1L, "design-login", "rev-3", 3, "DRAFT");
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        when(versionRepository.findById(11L)).thenReturn(Optional.of(target));
        when(versionRepository.findByProjectIdAndDesignIdAndStatus(1L, "design-login", "CURRENT"))
                .thenReturn(List.of(previous));
        when(versionRepository.save(target)).thenReturn(target);

        DesignVersionDtos.DesignVersionDetail result = service.activate(1L, 11L);

        assertThat(previous.getStatus()).isEqualTo("ARCHIVED");
        assertThat(target.getStatus()).isEqualTo("CURRENT");
        assertThat(result.id()).isEqualTo(11L);
        assertThat(result.status()).isEqualTo("CURRENT");
        verify(projectDataPermissionService).requireProjectEditable(project);
    }

    private DesignVersionDtos.CreateDesignVersionRequest request(String ignored) throws Exception {
        return requestWithScene(scene());
    }

    private DesignVersionDtos.CreateDesignVersionRequest requestWithScene(JsonNode scene) {
        return new DesignVersionDtos.CreateDesignVersionRequest(
                "design-login",
                "rev-3",
                "登录页",
                "调整登录流程",
                scene,
                "data:image/png;base64,aGVsbG8="
        );
    }

    private DesignVersionDtos.CreateDesignVersionRequest invalidRequest() throws Exception {
        JsonNode invalid = objectMapper.readTree("""
                {"schemaVersion":2,"id":"design-login","name":"登录页","revision":1,"updatedAt":"2026-08-16T12:00:00Z","entryPageId":"page-login","pages":[{"id":"page-login","name":"登录","route":"/","rootNodeId":"missing"}],"nodes":{},"assets":{}}
                """);
        return new DesignVersionDtos.CreateDesignVersionRequest("design-login", "rev-3", "登录页", "调整登录流程", invalid, "data:image/png;base64,aGVsbG8=");
    }

    private JsonNode scene() throws Exception {
        return objectMapper.readTree("""
                {
                  "schemaVersion":2,"id":"design-login","name":"登录页","revision":1,"updatedAt":"2026-08-16T12:00:00Z","entryPageId":"page-login",
                  "pages":[{"id":"page-login","name":"登录","route":"/","rootNodeId":"frame-login","width":1440,"height":900,"background":{"kind":"solid","color":"#ffffff"}}],
                  "nodes":{
                    "frame-login":{"id":"frame-login","type":"frame","name":"登录画框","parentId":null,"childIds":[],"visible":true,"locked":false,"opacity":1,"transform":{"x":0,"y":0,"width":1440,"height":900,"rotation":0,"scaleX":1,"scaleY":1},"layout":{"mode":"absolute","width":1440,"height":900,"padding":{"top":0,"right":0,"bottom":0,"left":0},"gap":0,"direction":"column","align":"start","justify":"start"}}
                  },"assets":{}
                }
                """);
    }

    private JsonNode sceneWithChild() throws Exception {
        ObjectNode scene = (ObjectNode) scene();
        ObjectNode root = (ObjectNode) scene.path("nodes").path("frame-login");
        root.putArray("childIds").add("child");
        ObjectNode child = objectMapper.createObjectNode();
        child.put("id", "child").put("type", "rect").put("name", "子节点").put("parentId", "frame-login");
        child.putArray("childIds");
        child.put("visible", true).put("locked", false).put("opacity", 1);
        child.set("transform", objectMapper.createObjectNode().put("x", 0).put("y", 0).put("width", 20).put("height", 20).put("rotation", 0).put("scaleX", 1).put("scaleY", 1));
        child.set("layout", objectMapper.createObjectNode().put("mode", "absolute").put("width", 20).put("height", 20));
        ((ObjectNode) scene.path("nodes")).set("child", child);
        return scene;
    }

    private JsonNode sceneWithDisconnectedCycle() throws Exception {
        ObjectNode scene = (ObjectNode) scene();
        ObjectNode nodes = (ObjectNode) scene.path("nodes");
        nodes.set("cycle-a", cycleNode("cycle-a", "cycle-b"));
        nodes.set("cycle-b", cycleNode("cycle-b", "cycle-a"));
        return scene;
    }

    private ObjectNode cycleNode(String id, String childId) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id).put("type", "group").put("name", id).put("parentId", childId);
        node.putArray("childIds").add(childId);
        node.put("visible", true).put("locked", false).put("opacity", 1);
        node.set("transform", objectMapper.createObjectNode().put("x", 0).put("y", 0).put("width", 20).put("height", 20).put("rotation", 0).put("scaleX", 1).put("scaleY", 1));
        node.set("layout", objectMapper.createObjectNode().put("mode", "absolute").put("width", 20).put("height", 20));
        return node;
    }

    private JsonNode sceneWithImage(String assetId) throws Exception {
        ObjectNode scene = (ObjectNode) scene();
        ObjectNode nodes = (ObjectNode) scene.path("nodes");
        ObjectNode root = (ObjectNode) nodes.path("frame-login");
        root.putArray("childIds").add("image");
        ObjectNode image = objectMapper.createObjectNode();
        image.put("id", "image").put("type", "image").put("name", "图片").put("parentId", "frame-login");
        image.putArray("childIds");
        image.put("visible", true).put("locked", false).put("opacity", 1);
        image.set("transform", objectMapper.createObjectNode().put("x", 0).put("y", 0).put("width", 20).put("height", 20).put("rotation", 0).put("scaleX", 1).put("scaleY", 1));
        image.set("layout", objectMapper.createObjectNode().put("mode", "absolute").put("width", 20).put("height", 20));
        image.set("image", objectMapper.createObjectNode().put("assetId", assetId).put("fit", "contain"));
        nodes.set("image", image);
        return scene;
    }

    private JsonNode sceneWithText(String fontAssetId) throws Exception {
        ObjectNode scene = (ObjectNode) scene();
        ObjectNode nodes = (ObjectNode) scene.path("nodes");
        ObjectNode root = (ObjectNode) nodes.path("frame-login");
        root.putArray("childIds").add("text");
        ObjectNode text = objectMapper.createObjectNode();
        text.put("id", "text").put("type", "text").put("name", "文字").put("parentId", "frame-login");
        text.putArray("childIds");
        text.put("visible", true).put("locked", false).put("opacity", 1);
        text.set("transform", objectMapper.createObjectNode().put("x", 0).put("y", 0).put("width", 20).put("height", 20).put("rotation", 0).put("scaleX", 1).put("scaleY", 1));
        text.set("layout", objectMapper.createObjectNode().put("mode", "absolute").put("width", 20).put("height", 20));
        text.set("text", objectMapper.createObjectNode().put("text", "文字").put("fontFamily", "Inter").put("fontSize", 16).put("fontAssetId", fontAssetId));
        nodes.set("text", text);
        return scene;
    }

    private ProjectEntity project(Long id) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        project.setName("Design 项目");
        return project;
    }

    private GitPilotDesignVersionEntity version(Long id, Long projectId, String designId, String revisionId,
                                                  int versionNo, String status) {
        GitPilotDesignVersionEntity entity = new GitPilotDesignVersionEntity();
        entity.setId(id);
        entity.setProjectId(projectId);
        entity.setDesignId(designId);
        entity.setRevisionId(revisionId);
        entity.setVersionNo(versionNo);
        entity.setTitle("登录页");
        entity.setSummary("调整登录流程");
        entity.setStatus(status);
        entity.setSceneJson("{\"schemaVersion\":2,\"id\":\"design-login\",\"name\":\"登录页\",\"revision\":1,\"entryPageId\":\"page-login\",\"pages\":[{\"id\":\"page-login\",\"rootNodeId\":\"frame-login\"}],\"nodes\":{\"frame-login\":{\"id\":\"frame-login\",\"type\":\"frame\",\"parentId\":null,\"childIds\":[]}},\"assets\":{}}");
        entity.setPreviewImage("data:image/png;base64,aGVsbG8=");
        entity.setCreatorUserId(7L);
        entity.setCreatedAt(LocalDateTime.of(2026, 8, 16, 12, 0));
        entity.setUpdatedAt(LocalDateTime.of(2026, 8, 16, 12, 0));
        return entity;
    }
}
