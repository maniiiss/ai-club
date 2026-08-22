package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitPilotDesignVersionEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.design.DesignVersionDtos;
import com.aiclub.platform.repository.GitPilotDesignVersionRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * GitPilot Design 的远端版本服务。
 * 业务意图：Desktop 上传的 Canvas 场景和 PNG 预览先在服务端完整校验，再作为不可变数据落库；
 * 项目侧只改变版本状态，从历史恢复始终新建草稿，以确保任何已上传修订可追溯、可再次预览。
 */
@Service
public class GitPilotDesignVersionService {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_CURRENT = "CURRENT";
    public static final String STATUS_ARCHIVED = "ARCHIVED";
    private static final int MAX_SCENE_BYTES = 10 * 1024 * 1024;
    private static final int MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
    private static final String INCOMPATIBLE_SCENE_MESSAGE = "该版本来自旧 HTML Design 工作区，当前 CanvasKit Design 不兼容，请新建原生 Canvas 工作区。";

    private final GitPilotDesignVersionRepository versionRepository;
    private final ProjectRepository projectRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ObjectMapper objectMapper;

    public GitPilotDesignVersionService(GitPilotDesignVersionRepository versionRepository,
                                        ProjectRepository projectRepository,
                                        ProjectDataPermissionService projectDataPermissionService,
                                        ObjectMapper objectMapper) {
        this.versionRepository = versionRepository;
        this.projectRepository = projectRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.objectMapper = objectMapper;
    }

    /** CLI 上传按本地 design/revision 组成幂等键，网络重试返回相同 Web 版本。 */
    @Transactional
    public DesignVersionDtos.DesignVersionSummary upload(Long projectId,
                                                          DesignVersionDtos.CreateDesignVersionRequest request,
                                                          Long creatorUserId) {
        ProjectEntity project = requireProject(projectId);
        projectDataPermissionService.requireProjectVisible(project);
        ValidatedSnapshot validated = validateRequest(request);
        var existing = versionRepository.findByProjectIdAndDesignIdAndRevisionId(projectId, validated.designId(), validated.revisionId());
        if (existing.isPresent()) return toSummary(existing.get());

        GitPilotDesignVersionEntity entity = new GitPilotDesignVersionEntity();
        entity.setProjectId(projectId);
        entity.setDesignId(validated.designId());
        entity.setRevisionId(validated.revisionId());
        entity.setVersionNo(versionRepository.findFirstByProjectIdAndDesignIdOrderByVersionNoDesc(projectId, validated.designId())
                .map(value -> value.getVersionNo() + 1).orElse(1));
        entity.setTitle(validated.title());
        entity.setSummary(validated.summary());
        entity.setStatus(STATUS_DRAFT);
        entity.setSceneJson(validated.sceneJson());
        entity.setPreviewImage(validated.previewImage());
        entity.setCreatorUserId(creatorUserId);
        entity.setCreatedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        return toSummary(versionRepository.save(entity));
    }

    public DesignVersionDtos.DesignVersionList list(Long projectId) {
        projectDataPermissionService.requireProjectVisible(requireProject(projectId));
        return new DesignVersionDtos.DesignVersionList(versionRepository.findByProjectIdOrderByCreatedAtDescIdDesc(projectId).stream()
                .map(this::toSummary)
                .toList());
    }

    public DesignVersionDtos.DesignVersionDetail get(Long projectId, Long versionId) {
        projectDataPermissionService.requireProjectVisible(requireProject(projectId));
        return toDetail(requireVersion(projectId, versionId));
    }

    /** 同一 designId 只允许一个 CURRENT，激活旧版本不会覆盖它的历史快照。 */
    @Transactional
    public DesignVersionDtos.DesignVersionDetail activate(Long projectId, Long versionId) {
        ProjectEntity project = requireProject(projectId);
        projectDataPermissionService.requireProjectEditable(project);
        GitPilotDesignVersionEntity target = requireVersion(projectId, versionId);
        requireCanvasCompatible(target);
        for (GitPilotDesignVersionEntity current : versionRepository.findByProjectIdAndDesignIdAndStatus(projectId, target.getDesignId(), STATUS_CURRENT)) {
            if (!current.getId().equals(target.getId())) {
                current.setStatus(STATUS_ARCHIVED);
                current.setUpdatedAt(LocalDateTime.now());
            }
        }
        target.setStatus(STATUS_CURRENT);
        target.setUpdatedAt(LocalDateTime.now());
        return toDetail(versionRepository.save(target));
    }

    /**
     * Web 端恢复采用“从历史创建草稿”语义，不能将被选中版本直接改为 DRAFT，
     * 这样当前版本和原始版本都还能被审计和激活。
     */
    @Transactional
    public DesignVersionDtos.DesignVersionDetail restore(Long projectId, Long versionId, Long creatorUserId) {
        ProjectEntity project = requireProject(projectId);
        projectDataPermissionService.requireProjectEditable(project);
        GitPilotDesignVersionEntity source = requireVersion(projectId, versionId);
        requireCanvasCompatible(source);
        GitPilotDesignVersionEntity restored = new GitPilotDesignVersionEntity();
        restored.setProjectId(projectId);
        restored.setDesignId(source.getDesignId());
        restored.setRevisionId(restoredRevisionId(source));
        restored.setVersionNo(versionRepository.findFirstByProjectIdAndDesignIdOrderByVersionNoDesc(projectId, source.getDesignId())
                .map(value -> value.getVersionNo() + 1).orElse(1));
        restored.setTitle((source.getTitle() + "（恢复草稿）").substring(0, Math.min(source.getTitle().length() + 6, 120)));
        restored.setSummary("从 Web 设计版本 v" + source.getVersionNo() + " 创建的草稿。");
        restored.setStatus(STATUS_DRAFT);
        restored.setSceneJson(source.getSceneJson());
        restored.setPreviewImage(source.getPreviewImage());
        restored.setCreatorUserId(creatorUserId);
        restored.setCreatedAt(LocalDateTime.now());
        restored.setUpdatedAt(LocalDateTime.now());
        return toDetail(versionRepository.save(restored));
    }

    private ProjectEntity requireProject(Long projectId) {
        if (projectId == null || projectId <= 0) throw new IllegalArgumentException("项目标识无效");
        return projectRepository.findById(projectId).orElseThrow(() -> new IllegalArgumentException("项目不存在"));
    }

    private GitPilotDesignVersionEntity requireVersion(Long projectId, Long versionId) {
        return versionRepository.findById(versionId)
                .filter(value -> value.getProjectId().equals(projectId))
                .orElseThrow(() -> new IllegalArgumentException("设计版本不存在"));
    }

    private ValidatedSnapshot validateRequest(DesignVersionDtos.CreateDesignVersionRequest request) {
        if (request == null) throw new IllegalArgumentException("Design 上传请求不能为空");
        String designId = requiredIdentifier(request.designId(), "Design 标识");
        String revisionId = requiredIdentifier(request.revisionId(), "修订标识");
        String title = trim(request.name());
        if (title.isBlank()) title = "GitPilot Design";
        if (title.length() > 120) throw new IllegalArgumentException("版本标题不得超过 120 个字符");
        String summary = trim(request.summary());
        if (summary.length() > 1000) throw new IllegalArgumentException("更新说明不得超过 1000 个字符");
        SceneStats scene = validateScene(request.scene());
        String sceneJson = serialize(request.scene());
        if (bytes(sceneJson) > MAX_SCENE_BYTES) throw new IllegalArgumentException("Canvas 场景总大小不得超过 10MB");
        String previewPng = request.previewPng() == null ? "" : request.previewPng().trim();
        validatePreviewPng(previewPng);
        return new ValidatedSnapshot(designId, revisionId, title, summary, sceneJson, previewPng, scene);
    }

    /** 校验场景图的引用完整性，防止公众端保存不可渲染或循环引用的快照。 */
    private SceneStats validateScene(JsonNode scene) {
        if (scene == null || !scene.isObject() || scene.path("schemaVersion").asInt(-1) != 2) {
            throw new IllegalArgumentException("Canvas 场景 schemaVersion 必须为 2");
        }
        JsonNode pages = scene.path("pages");
        JsonNode nodes = scene.path("nodes");
        JsonNode assets = scene.path("assets");
        if (!pages.isArray() || pages.isEmpty() || !nodes.isObject() || !assets.isObject()) {
            throw new IllegalArgumentException("Canvas 场景必须包含 pages、nodes 和 assets");
        }
        if (pages.size() > 100 || nodes.size() > 20_000 || assets.size() > 5_000) {
            throw new IllegalArgumentException("Canvas 场景节点、页面或资源数量超过限制");
        }
        SetState state = new SetState();
        String entryPageId = scene.path("entryPageId").isTextual() ? scene.path("entryPageId").asText() : "";
        for (JsonNode page : pages) {
            if (!page.isObject() || !page.path("id").isTextual() || !page.path("rootNodeId").isTextual()) {
                throw new IllegalArgumentException("Canvas 页面定义无效");
            }
            String pageId = page.path("id").asText();
            if (pageId.isBlank() || !state.pageIds.add(pageId)) throw new IllegalArgumentException("Canvas 页面标识重复或为空");
            String rootId = page.path("rootNodeId").asText();
            if (!nodes.has(rootId)) throw new IllegalArgumentException("Canvas 页面根节点不存在：" + rootId);
            if (!state.rootNodeIds.add(rootId)) throw new IllegalArgumentException("Canvas 页面根节点重复：" + rootId);
        }
        if (entryPageId.isBlank() || !state.pageIds.contains(entryPageId)) throw new IllegalArgumentException("Canvas entryPageId 不存在");
        Iterator<Map.Entry<String, JsonNode>> fields = nodes.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            JsonNode node = entry.getValue();
            if (!node.isObject() || !node.path("id").isTextual() || !entry.getKey().equals(node.path("id").asText())) {
                throw new IllegalArgumentException("Canvas 节点定义无效：" + entry.getKey());
            }
            JsonNode childIds = node.path("childIds");
            if (!childIds.isArray()) throw new IllegalArgumentException("Canvas 节点 childIds 无效：" + entry.getKey());
            Set<String> childReferences = new HashSet<>();
            JsonNode parent = node.get("parentId");
            if (parent == null || (!parent.isNull() && !parent.isTextual())) throw new IllegalArgumentException("Canvas 父节点标识无效：" + entry.getKey());
            String parentId = parent.isNull() ? null : parent.asText();
            if (parentId != null && parentId.isBlank()) throw new IllegalArgumentException("Canvas 父节点标识为空：" + entry.getKey());
            if (parentId != null && !nodes.has(parentId)) throw new IllegalArgumentException("Canvas 父节点不存在：" + parentId);
            for (JsonNode childId : childIds) {
                if (!childId.isTextual() || childId.asText().isBlank() || !childReferences.add(childId.asText()) || !nodes.has(childId.asText())) {
                    throw new IllegalArgumentException("Canvas 子节点引用无效或重复：" + entry.getKey());
                }
                JsonNode child = nodes.path(childId.asText());
                if (!child.path("parentId").isTextual() || !child.path("parentId").asText().equals(entry.getKey())) {
                    throw new IllegalArgumentException("Canvas 父子引用不一致：" + childId.asText());
                }
            }
            validateNodeResources(node, assets, entry.getKey());
        }
        for (String rootId : state.rootNodeIds) {
            JsonNode root = nodes.path(rootId);
            if (!root.path("parentId").isNull()) throw new IllegalArgumentException("Canvas 页面根节点必须是顶层节点：" + rootId);
        }
        for (Map.Entry<String, JsonNode> entry : iterable(nodes)) {
            JsonNode node = entry.getValue();
            String parentId = node.path("parentId").isNull() ? null : node.path("parentId").asText();
            if (parentId == null) {
                if (!state.rootNodeIds.contains(entry.getKey())) throw new IllegalArgumentException("Canvas 存在未挂载的顶层节点：" + entry.getKey());
            } else {
                JsonNode parent = nodes.path(parentId);
                long references = 0;
                for (JsonNode childId : parent.path("childIds")) if (entry.getKey().equals(childId.asText())) references++;
                if (references != 1) throw new IllegalArgumentException("Canvas 父子引用不一致：" + entry.getKey());
            }
        }
        Map<String, VisitState> visits = new HashMap<>();
        Iterator<Map.Entry<String, JsonNode>> nodeEntries = nodes.fields();
        while (nodeEntries.hasNext()) detectCycle(nodes, nodeEntries.next().getKey(), visits);
        Set<String> reachable = new HashSet<>();
        for (String rootId : state.rootNodeIds) collectReachable(nodes, rootId, reachable);
        if (reachable.size() != nodes.size()) throw new IllegalArgumentException("Canvas 存在未连接到页面的节点");
        validateAssets(assets);
        return new SceneStats(pages.size(), nodes.size(), assets.size());
    }

    private void validateNodeResources(JsonNode node, JsonNode assets, String nodeId) {
        JsonNode image = node.get("image");
        if ("image".equals(node.path("type").asText())) {
            if (!imageIsValid(image)) throw new IllegalArgumentException("Canvas 图片节点缺少资源引用：" + nodeId);
            validateAssetReference(assets, image.path("assetId").asText(), "image", nodeId);
            JsonNode asset = assets.path(image.path("assetId").asText());
            if (!asset.path("mimeType").asText("").startsWith("image/")) throw new IllegalArgumentException("Canvas 图片资源类型无效：" + image.path("assetId").asText());
        } else if (image != null && !image.isMissingNode() && !image.isNull()) {
            throw new IllegalArgumentException("非图片节点不能包含 image 资源：" + nodeId);
        }
        JsonNode text = node.get("text");
        if ("text".equals(node.path("type").asText())) {
            if (!textIsValid(text)) throw new IllegalArgumentException("Canvas 文本节点定义无效：" + nodeId);
            validateOptionalFontReference(assets, text, nodeId);
            for (JsonNode run : text.path("runs")) validateOptionalFontReference(assets, run, nodeId);
        }
        JsonNode prototype = node.get("prototype");
        if (prototype != null && prototype.isObject() && prototype.path("targetId").isTextual()) {
            // 目标节点是否存在在主校验中统一判断，避免把字符串误当成本地路径。
            if (prototype.path("targetId").asText().isBlank()) throw new IllegalArgumentException("Canvas 原型目标为空：" + nodeId);
        }
    }

    private boolean imageIsValid(JsonNode image) {
        return image != null && image.isObject() && image.path("assetId").isTextual() && !image.path("assetId").asText().isBlank();
    }

    private boolean textIsValid(JsonNode text) {
        return text != null && text.isObject() && text.path("text").isTextual() && text.path("fontFamily").isTextual();
    }

    private void validateOptionalFontReference(JsonNode assets, JsonNode value, String nodeId) {
        JsonNode fontAssetId = value.get("fontAssetId");
        if (fontAssetId == null || fontAssetId.isNull()) return;
        if (!fontAssetId.isTextual() || fontAssetId.asText().isBlank()) throw new IllegalArgumentException("Canvas 字体资源引用无效：" + nodeId);
        validateAssetReference(assets, fontAssetId.asText(), "font", nodeId);
        if (!assets.path(fontAssetId.asText()).path("mimeType").asText("").startsWith("font/")) throw new IllegalArgumentException("Canvas 字体资源类型无效：" + fontAssetId.asText());
    }

    private void validateAssetReference(JsonNode assets, String assetId, String kind, String nodeId) {
        String label = "image".equals(kind) ? "图片" : "font".equals(kind) ? "字体" : kind;
        if (!assets.has(assetId)) throw new IllegalArgumentException("Canvas " + label + "资源不存在：" + assetId + "（节点：" + nodeId + "）");
    }

    private void validateAssets(JsonNode assets) {
        Iterator<Map.Entry<String, JsonNode>> fields = assets.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            JsonNode asset = entry.getValue();
            if (!asset.isObject() || !asset.path("id").isTextual() || !entry.getKey().equals(asset.path("id").asText())) {
                throw new IllegalArgumentException("Canvas 资源定义无效：" + entry.getKey());
            }
            String mimeType = asset.path("mimeType").asText("");
            if (mimeType.isBlank()) throw new IllegalArgumentException("Canvas 资源 MIME 类型为空：" + entry.getKey());
            if (mimeType.startsWith("font/") && (!asset.path("fontFamily").isTextual() || asset.path("fontFamily").asText().isBlank())) {
                throw new IllegalArgumentException("Canvas 字体资源缺少 fontFamily：" + entry.getKey());
            }
        }
    }

    private void detectCycle(JsonNode nodes, String nodeId, Map<String, VisitState> visits) {
        VisitState state = visits.get(nodeId);
        if (state == VisitState.VISITING) throw new IllegalArgumentException("Canvas 场景包含循环引用：" + nodeId);
        if (state == VisitState.VISITED) return;
        visits.put(nodeId, VisitState.VISITING);
        for (JsonNode child : nodes.path(nodeId).path("childIds")) detectCycle(nodes, child.asText(), visits);
        visits.put(nodeId, VisitState.VISITED);
    }

    private void collectReachable(JsonNode nodes, String nodeId, Set<String> reachable) {
        if (!reachable.add(nodeId)) return;
        for (JsonNode child : nodes.path(nodeId).path("childIds")) collectReachable(nodes, child.asText(), reachable);
    }

    private Iterable<Map.Entry<String, JsonNode>> iterable(JsonNode nodes) {
        return () -> nodes.fields();
    }

    private void validatePreviewPng(String previewPng) {
        if (!previewPng.startsWith("data:image/png;base64,")) throw new IllegalArgumentException("Canvas 预览必须是 PNG data URL");
        String encoded = previewPng.substring("data:image/png;base64,".length());
        try {
            if (Base64.getDecoder().decode(encoded).length > MAX_PREVIEW_BYTES) throw new IllegalArgumentException("Canvas PNG 预览不得超过 4MB");
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Canvas PNG 预览数据无效", error);
        }
    }

    private String requiredIdentifier(String value, String label) {
        String normalized = trim(value);
        if (!normalized.matches("[A-Za-z0-9_-]{1,160}")) throw new IllegalArgumentException(label + "格式无效");
        return normalized;
    }

    private String serialize(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("无法序列化 Design 快照", error);
        }
    }

    private JsonNode deserialize(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Design 版本快照已损坏", error);
        }
    }

    private long bytes(String value) { return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length; }
    private String trim(String value) { return value == null ? "" : value.trim(); }
    private String restoredRevisionId(GitPilotDesignVersionEntity source) {
        String suffix = "-restore-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        int maxSourceLength = 160 - suffix.length();
        return source.getRevisionId().substring(0, Math.min(source.getRevisionId().length(), maxSourceLength)) + suffix;
    }

    private DesignVersionDtos.DesignVersionSummary toSummary(GitPilotDesignVersionEntity entity) {
        StoredScene stored = readStoredScene(entity.getSceneJson());
        JsonNode scene = stored.scene();
        return new DesignVersionDtos.DesignVersionSummary(entity.getId(), entity.getProjectId(), entity.getDesignId(), entity.getRevisionId(), entity.getVersionNo(), entity.getTitle(), entity.getSummary(), entity.getStatus(), scene == null ? 0 : scene.path("pages").size(), scene == null ? 0 : scene.path("nodes").size(), scene == null ? 0 : scene.path("assets").size(), bytes(entity.getSceneJson()), entity.getCreatorUserId(), entity.getCreatedAt(), stored.compatible(), stored.message());
    }

    private DesignVersionDtos.DesignVersionDetail toDetail(GitPilotDesignVersionEntity entity) {
        StoredScene stored = readStoredScene(entity.getSceneJson());
        return new DesignVersionDtos.DesignVersionDetail(entity.getId(), entity.getProjectId(), entity.getDesignId(), entity.getRevisionId(), entity.getVersionNo(), entity.getTitle(), entity.getSummary(), entity.getStatus(), stored.scene(), blankToNull(entity.getPreviewImage()), entity.getCreatorUserId(), entity.getCreatedAt(), stored.compatible(), stored.message());
    }

    /** 旧 HTML 行仍可能存在于升级前数据库，列表和详情必须可读但明确告知不可编辑。 */
    private StoredScene readStoredScene(String raw) {
        if (raw == null || raw.isBlank()) return new StoredScene(null, false, INCOMPATIBLE_SCENE_MESSAGE);
        try {
            JsonNode scene = objectMapper.readTree(raw);
            if (scene == null || !scene.isObject() || scene.path("schemaVersion").asInt(-1) != 2) return new StoredScene(null, false, INCOMPATIBLE_SCENE_MESSAGE);
            try {
                validateScene(scene);
                return new StoredScene(scene, true, null);
            } catch (IllegalArgumentException error) {
                return new StoredScene(null, false, "Canvas 场景快照不可用：" + error.getMessage());
            }
        } catch (JsonProcessingException error) {
            return new StoredScene(null, false, "Canvas 场景快照不可用：数据格式错误");
        }
    }

    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value; }

    private void requireCanvasCompatible(GitPilotDesignVersionEntity entity) {
        StoredScene stored = readStoredScene(entity.getSceneJson());
        if (!stored.compatible()) throw new IllegalArgumentException(stored.message());
    }

    private record ValidatedSnapshot(String designId, String revisionId, String title, String summary,
                                     String sceneJson, String previewImage, SceneStats scene) { }
    private record SceneStats(int pageCount, int nodeCount, int assetCount) { }
    private record StoredScene(JsonNode scene, boolean compatible, String message) { }
    private enum VisitState { VISITING, VISITED }
    private static final class SetState {
        private final java.util.Set<String> pageIds = new HashSet<>();
        private final java.util.Set<String> rootNodeIds = new HashSet<>();
    }
}
