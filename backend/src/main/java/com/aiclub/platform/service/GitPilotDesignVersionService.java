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
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * GitPilot Design 的远端版本服务。
 * 业务意图：Desktop 上传的快照先在服务端完整校验，再作为不可变数据落库；项目侧只改变版本状态，
 * 从历史恢复始终新建草稿，以确保任何已上传修订可追溯、可再次预览。
 */
@Service
public class GitPilotDesignVersionService {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_CURRENT = "CURRENT";
    public static final String STATUS_ARCHIVED = "ARCHIVED";
    private static final int MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
    private static final int MAX_FILE_BYTES = 2 * 1024 * 1024;
    private static final int MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "html", "htm", "css", "js", "mjs", "cjs", "json", "svg", "png", "jpg", "jpeg", "webp", "gif", "txt"
    );

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
        entity.setSnapshotJson(validated.snapshotJson());
        entity.setPreviewHtml(validated.previewHtml());
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
        GitPilotDesignVersionEntity restored = new GitPilotDesignVersionEntity();
        restored.setProjectId(projectId);
        restored.setDesignId(source.getDesignId());
        restored.setRevisionId(restoredRevisionId(source));
        restored.setVersionNo(versionRepository.findFirstByProjectIdAndDesignIdOrderByVersionNoDesc(projectId, source.getDesignId())
                .map(value -> value.getVersionNo() + 1).orElse(1));
        restored.setTitle((source.getTitle() + "（恢复草稿）").substring(0, Math.min(source.getTitle().length() + 6, 120)));
        restored.setSummary("从 Web 设计版本 v" + source.getVersionNo() + " 创建的草稿。");
        restored.setStatus(STATUS_DRAFT);
        restored.setSnapshotJson(source.getSnapshotJson());
        restored.setPreviewHtml(source.getPreviewHtml());
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
        if (request.snapshot() == null || !request.snapshot().isObject()) throw new IllegalArgumentException("Design 快照格式无效");
        String snapshotJson = serialize(request.snapshot());
        if (bytes(snapshotJson) > MAX_SNAPSHOT_BYTES) throw new IllegalArgumentException("Design 快照总大小不得超过 10MB");
        validateFiles(request.snapshot().path("files"));
        String previewHtml = request.previewHtml() == null ? "" : request.previewHtml();
        if (previewHtml.isBlank()) throw new IllegalArgumentException("Design 预览 HTML 不能为空");
        if (bytes(previewHtml) > MAX_PREVIEW_BYTES) throw new IllegalArgumentException("Design 预览 HTML 不得超过 2MB");
        return new ValidatedSnapshot(designId, revisionId, title, summary, snapshotJson, previewHtml);
    }

    private void validateFiles(JsonNode files) {
        if (!files.isArray() || files.size() == 0) throw new IllegalArgumentException("Design 快照必须包含至少一个文件");
        if (files.size() > 1_000) throw new IllegalArgumentException("Design 快照文件数量超过限制");
        for (JsonNode file : files) {
            if (!file.isObject() || !file.path("path").isTextual() || !file.path("content").isTextual()) {
                throw new IllegalArgumentException("Design 快照包含无效文件");
            }
            String path = file.path("path").asText();
            validatePath(path);
            if (bytes(file.path("content").asText()) > MAX_FILE_BYTES) {
                throw new IllegalArgumentException("Design 单文件不得超过 2MB：" + path);
            }
        }
    }

    private void validatePath(String path) {
        if (path == null || path.length() > 240 || !path.matches("[A-Za-z0-9][A-Za-z0-9._/-]*")
                || path.contains("..") || path.contains("//") || path.startsWith("/") || path.contains("\\\\")) {
            throw new IllegalArgumentException("Design 文件路径非法：" + path);
        }
        int extensionIndex = path.lastIndexOf('.');
        String extension = extensionIndex < 0 ? "" : path.substring(extensionIndex + 1).toLowerCase();
        if (!ALLOWED_EXTENSIONS.contains(extension)) throw new IllegalArgumentException("Design 文件类型不受支持：" + path);
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

    private long bytes(String value) { return value.getBytes(StandardCharsets.UTF_8).length; }
    private String trim(String value) { return value == null ? "" : value.trim(); }
    private String restoredRevisionId(GitPilotDesignVersionEntity source) {
        String suffix = "-restore-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        int maxSourceLength = 160 - suffix.length();
        return source.getRevisionId().substring(0, Math.min(source.getRevisionId().length(), maxSourceLength)) + suffix;
    }

    private int fileCount(GitPilotDesignVersionEntity entity) {
        JsonNode files = deserialize(entity.getSnapshotJson()).path("files");
        return files.isArray() ? files.size() : 0;
    }

    private DesignVersionDtos.DesignVersionSummary toSummary(GitPilotDesignVersionEntity entity) {
        return new DesignVersionDtos.DesignVersionSummary(entity.getId(), entity.getProjectId(), entity.getDesignId(), entity.getRevisionId(), entity.getVersionNo(), entity.getTitle(), entity.getSummary(), entity.getStatus(), fileCount(entity), bytes(entity.getSnapshotJson()), entity.getCreatorUserId(), entity.getCreatedAt());
    }

    private DesignVersionDtos.DesignVersionDetail toDetail(GitPilotDesignVersionEntity entity) {
        return new DesignVersionDtos.DesignVersionDetail(entity.getId(), entity.getProjectId(), entity.getDesignId(), entity.getRevisionId(), entity.getVersionNo(), entity.getTitle(), entity.getSummary(), entity.getStatus(), deserialize(entity.getSnapshotJson()), entity.getPreviewHtml(), entity.getCreatorUserId(), entity.getCreatedAt());
    }

    private record ValidatedSnapshot(String designId, String revisionId, String title, String summary,
                                     String snapshotJson, String previewHtml) { }
}
