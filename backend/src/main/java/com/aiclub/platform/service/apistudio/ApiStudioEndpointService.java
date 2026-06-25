package com.aiclub.platform.service.apistudio;

import com.aiclub.platform.domain.model.ApiStudioEndpointEntity;
import com.aiclub.platform.domain.model.ApiStudioEndpointParameterEntity;
import com.aiclub.platform.domain.model.ApiStudioEndpointVersionEntity;
import com.aiclub.platform.domain.model.ApiStudioResponseEntity;
import com.aiclub.platform.domain.model.ApiStudioResponseFieldEntity;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointDetail;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointParameterItem;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointSummary;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointVersionItem;
import com.aiclub.platform.dto.apistudio.ApiStudioResponseFieldItem;
import com.aiclub.platform.dto.apistudio.ApiStudioResponseItem;
import com.aiclub.platform.dto.request.apistudio.ApiStudioEndpointReorderRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioEndpointRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioParameterPayload;
import com.aiclub.platform.dto.request.apistudio.ApiStudioResponseFieldPayload;
import com.aiclub.platform.dto.request.apistudio.ApiStudioResponsePayload;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ApiStudioDirectoryRepository;
import com.aiclub.platform.repository.ApiStudioEndpointParameterRepository;
import com.aiclub.platform.repository.ApiStudioEndpointRepository;
import com.aiclub.platform.repository.ApiStudioEndpointVersionRepository;
import com.aiclub.platform.repository.ApiStudioResponseFieldRepository;
import com.aiclub.platform.repository.ApiStudioResponseRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

/**
 * 原生 API 工作台 - API 端点服务。
 * 负责：API CRUD、参数/响应整体保存、生命周期变更、拖拽排序、版本快照。
 */
@Service
public class ApiStudioEndpointService {

    private static final Set<String> ALLOWED_METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS");
    private static final Set<String> ALLOWED_STATUS = Set.of("DRAFT", "PUBLISHED", "DEPRECATED");
    private static final Set<String> ALLOWED_BODY_TYPE = Set.of("NONE", "JSON", "FORM_DATA", "FORM_URLENCODED", "RAW_TEXT");

    private final ApiStudioEndpointRepository endpointRepository;
    private final ApiStudioEndpointParameterRepository parameterRepository;
    private final ApiStudioResponseRepository responseRepository;
    private final ApiStudioResponseFieldRepository responseFieldRepository;
    private final ApiStudioEndpointVersionRepository versionRepository;
    private final ApiStudioDirectoryRepository directoryRepository;
    private final ApiStudioDirectoryService directoryService;
    private final ObjectMapper objectMapper;

    public ApiStudioEndpointService(ApiStudioEndpointRepository endpointRepository,
                                    ApiStudioEndpointParameterRepository parameterRepository,
                                    ApiStudioResponseRepository responseRepository,
                                    ApiStudioResponseFieldRepository responseFieldRepository,
                                    ApiStudioEndpointVersionRepository versionRepository,
                                    ApiStudioDirectoryRepository directoryRepository,
                                    ApiStudioDirectoryService directoryService,
                                    ObjectMapper objectMapper) {
        this.endpointRepository = endpointRepository;
        this.parameterRepository = parameterRepository;
        this.responseRepository = responseRepository;
        this.responseFieldRepository = responseFieldRepository;
        this.versionRepository = versionRepository;
        this.directoryRepository = directoryRepository;
        this.directoryService = directoryService;
        this.objectMapper = objectMapper;
    }

    // ========== 查询 ==========

    public List<ApiStudioEndpointSummary> listEndpoints(Long projectId, Long directoryId, String status, String keyword, String method) {
        directoryService.requireVisibleProject(projectId);
        List<ApiStudioEndpointEntity> list = directoryId == null
                ? endpointRepository.findByProjectIdOrderBySortOrderAscIdAsc(projectId)
                : endpointRepository.findByProjectIdAndDirectoryIdOrderBySortOrderAscIdAsc(projectId, directoryId);

        return list.stream()
                .filter(e -> status == null || status.isBlank() || Objects.equals(status, e.getStatus()))
                .filter(e -> method == null || method.isBlank() || Objects.equals(method.toUpperCase(), e.getMethod()))
                .filter(e -> {
                    if (keyword == null || keyword.isBlank()) return true;
                    String k = keyword.toLowerCase();
                    return (e.getName() != null && e.getName().toLowerCase().contains(k))
                            || (e.getPath() != null && e.getPath().toLowerCase().contains(k))
                            || (e.getSummary() != null && e.getSummary().toLowerCase().contains(k));
                })
                .map(this::toSummary)
                .toList();
    }

    public ApiStudioEndpointDetail getDetail(Long projectId, Long endpointId) {
        directoryService.requireVisibleProject(projectId);
        ApiStudioEndpointEntity entity = loadAndValidate(projectId, endpointId);
        return buildDetail(entity);
    }

    // ========== 创建 ==========

    @Transactional
    public ApiStudioEndpointDetail create(Long projectId, ApiStudioEndpointRequest request) {
        directoryService.requireEditableProject(projectId);
        validateMethodPathStatusBody(request);
        validateDirectory(projectId, request.directoryId());

        Long userId = currentUserId();
        ApiStudioEndpointEntity entity = new ApiStudioEndpointEntity();
        entity.setProjectId(projectId);
        entity.setDirectoryId(request.directoryId());
        entity.setName(request.name());
        entity.setMethod(request.method().toUpperCase());
        entity.setPath(normalizePath(request.path()));
        entity.setSummary(request.summary());
        entity.setDescriptionMarkdown(request.descriptionMarkdown());
        entity.setStatus(request.status() == null ? "DRAFT" : request.status().toUpperCase());
        entity.setRequestBodyType(request.requestBodyType() == null ? "NONE" : request.requestBodyType().toUpperCase());
        entity.setRequestBodySchemaJson(request.requestBodySchemaJson());
        entity.setRequestBodyExample(request.requestBodyExample());
        entity.setSortOrder(request.sortOrder() == null ? defaultSortOrder(projectId, request.directoryId()) : request.sortOrder());
        entity.setCreatedBy(userId);
        entity.setUpdatedBy(userId);
        // saveAndFlush 触发 INSERT 并把 @Version 同步到内存中，确保返回 DTO 的 revision 与 DB 一致。
        ApiStudioEndpointEntity saved = endpointRepository.saveAndFlush(entity);

        persistParameters(saved.getId(), request.parameters());
        persistResponses(saved.getId(), request.responses());
        snapshot(saved.getId(), "CREATE", request.changeSummary());

        return buildDetail(saved);
    }

    // ========== 更新 ==========

    @Transactional
    public ApiStudioEndpointDetail update(Long projectId, Long endpointId, ApiStudioEndpointRequest request) {
        directoryService.requireEditableProject(projectId);
        validateMethodPathStatusBody(request);
        validateDirectory(projectId, request.directoryId());

        ApiStudioEndpointEntity entity = loadAndValidate(projectId, endpointId);
        // 乐观锁校验
        if (request.revision() != null && !Objects.equals(request.revision(), entity.getRevision())) {
            throw new IllegalArgumentException("接口已被其他会话修改，请刷新后重试 (revision: 期望 " + entity.getRevision() + ", 提交 " + request.revision() + ")");
        }

        entity.setDirectoryId(request.directoryId());
        entity.setName(request.name());
        entity.setMethod(request.method().toUpperCase());
        entity.setPath(normalizePath(request.path()));
        entity.setSummary(request.summary());
        entity.setDescriptionMarkdown(request.descriptionMarkdown());
        if (request.status() != null) {
            entity.setStatus(request.status().toUpperCase());
        }
        entity.setRequestBodyType(request.requestBodyType() == null ? "NONE" : request.requestBodyType().toUpperCase());
        entity.setRequestBodySchemaJson(request.requestBodySchemaJson());
        entity.setRequestBodyExample(request.requestBodyExample());
        if (request.sortOrder() != null) {
            entity.setSortOrder(request.sortOrder());
        }
        entity.setUpdatedBy(currentUserId());
        entity.setUpdatedAt(LocalDateTime.now());
        // saveAndFlush 让 @Version 立即递增并写库，避免下方 buildDetail 看到陈旧的 revision。
        endpointRepository.saveAndFlush(entity);

        parameterRepository.deleteByEndpointId(endpointId);
        persistParameters(endpointId, request.parameters());
        replaceResponses(endpointId, request.responses());
        snapshot(endpointId, "UPDATE", request.changeSummary());

        return buildDetail(loadAndValidate(projectId, endpointId));
    }

    // ========== 删除 ==========

    @Transactional
    public void delete(Long projectId, Long endpointId) {
        directoryService.requireEditableProject(projectId);
        ApiStudioEndpointEntity entity = loadAndValidate(projectId, endpointId);
        // 关联表通过外键 ON DELETE CASCADE 清理
        endpointRepository.delete(entity);
    }

    // ========== 拖拽排序 ==========

    @Transactional
    public void reorder(Long projectId, ApiStudioEndpointReorderRequest request) {
        directoryService.requireEditableProject(projectId);
        if (request == null || request.items() == null) return;
        for (ApiStudioEndpointReorderRequest.Item item : request.items()) {
            ApiStudioEndpointEntity entity = endpointRepository.findById(item.endpointId())
                    .orElseThrow(() -> new NoSuchElementException("API 不存在: " + item.endpointId()));
            if (!Objects.equals(entity.getProjectId(), projectId)) {
                throw new ForbiddenException("API 不属于当前项目: " + item.endpointId());
            }
            validateDirectory(projectId, item.directoryId());
            entity.setDirectoryId(item.directoryId());
            entity.setSortOrder(item.sortOrder() == null ? 0 : item.sortOrder());
            entity.setUpdatedBy(currentUserId());
            entity.setUpdatedAt(LocalDateTime.now());
            endpointRepository.save(entity);
        }
    }

    // ========== 生命周期 ==========

    @Transactional
    public ApiStudioEndpointDetail publish(Long projectId, Long endpointId) {
        directoryService.requireEditableProject(projectId);
        ApiStudioEndpointEntity entity = loadAndValidate(projectId, endpointId);
        // 同 method+path 已发布检查
        List<ApiStudioEndpointEntity> existing = endpointRepository.findByProjectIdAndMethodAndPathAndStatus(
                projectId, entity.getMethod(), entity.getPath(), "PUBLISHED");
        for (ApiStudioEndpointEntity other : existing) {
            if (!Objects.equals(other.getId(), endpointId)) {
                throw new IllegalArgumentException("同项目已存在已发布的 " + entity.getMethod() + " " + entity.getPath());
            }
        }
        entity.setStatus("PUBLISHED");
        entity.setUpdatedBy(currentUserId());
        entity.setUpdatedAt(LocalDateTime.now());
        // saveAndFlush 让 @Version 立即递增并写库，避免 buildDetail 返回陈旧 revision。
        endpointRepository.saveAndFlush(entity);
        snapshot(endpointId, "STATUS_CHANGE", "Published");
        return buildDetail(loadAndValidate(projectId, endpointId));
    }

    @Transactional
    public ApiStudioEndpointDetail deprecate(Long projectId, Long endpointId) {
        directoryService.requireEditableProject(projectId);
        ApiStudioEndpointEntity entity = loadAndValidate(projectId, endpointId);
        entity.setStatus("DEPRECATED");
        entity.setUpdatedBy(currentUserId());
        entity.setUpdatedAt(LocalDateTime.now());
        // saveAndFlush 让 @Version 立即递增并写库，避免 buildDetail 返回陈旧 revision。
        endpointRepository.saveAndFlush(entity);
        snapshot(endpointId, "STATUS_CHANGE", "Deprecated");
        return buildDetail(loadAndValidate(projectId, endpointId));
    }

    // ========== 版本相关 ==========

    public List<ApiStudioEndpointVersionItem> listVersions(Long projectId, Long endpointId) {
        directoryService.requireVisibleProject(projectId);
        loadAndValidate(projectId, endpointId);
        return versionRepository.findByEndpointIdOrderByVersionNoDesc(endpointId).stream()
                .map(v -> new ApiStudioEndpointVersionItem(
                        v.getId(), v.getEndpointId(), v.getVersionNo(), v.getChangeType(),
                        v.getChangeSummary(), v.getCreatorUserId(), v.getCreatedAt(), null))
                .toList();
    }

    public ApiStudioEndpointVersionItem getVersion(Long projectId, Long endpointId, Long versionId) {
        directoryService.requireVisibleProject(projectId);
        loadAndValidate(projectId, endpointId);
        ApiStudioEndpointVersionEntity v = versionRepository.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("版本不存在: " + versionId));
        if (!Objects.equals(v.getEndpointId(), endpointId)) {
            throw new ForbiddenException("版本不属于当前 API");
        }
        return new ApiStudioEndpointVersionItem(
                v.getId(), v.getEndpointId(), v.getVersionNo(), v.getChangeType(),
                v.getChangeSummary(), v.getCreatorUserId(), v.getCreatedAt(), v.getSnapshotJson());
    }

    @Transactional
    public ApiStudioEndpointDetail rollback(Long projectId, Long endpointId, Long versionId) {
        directoryService.requireEditableProject(projectId);
        ApiStudioEndpointEntity entity = loadAndValidate(projectId, endpointId);
        ApiStudioEndpointVersionEntity v = versionRepository.findById(versionId)
                .orElseThrow(() -> new NoSuchElementException("版本不存在: " + versionId));
        if (!Objects.equals(v.getEndpointId(), endpointId)) {
            throw new ForbiddenException("版本不属于当前 API");
        }
        try {
            Map<String, Object> snap = objectMapper.readValue(v.getSnapshotJson(), Map.class);
            applySnapshotToEntity(entity, snap);
            entity.setUpdatedBy(currentUserId());
            entity.setUpdatedAt(LocalDateTime.now());
            // 同样使用 saveAndFlush 确保返回的 detail 携带最新 revision。
            endpointRepository.saveAndFlush(entity);
            // 简化：参数和响应保留 - 仅恢复主体定义；如需完整恢复后续迭代扩展。
            snapshot(endpointId, "ROLLBACK", "Rolled back to v" + v.getVersionNo());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("版本快照解析失败", e);
        }
        return buildDetail(loadAndValidate(projectId, endpointId));
    }

    // ========== 内部 ==========

    private void applySnapshotToEntity(ApiStudioEndpointEntity entity, Map<String, Object> snap) {
        if (snap.get("name") != null) entity.setName((String) snap.get("name"));
        if (snap.get("method") != null) entity.setMethod((String) snap.get("method"));
        if (snap.get("path") != null) entity.setPath((String) snap.get("path"));
        if (snap.get("summary") != null) entity.setSummary((String) snap.get("summary"));
        if (snap.get("descriptionMarkdown") != null) entity.setDescriptionMarkdown((String) snap.get("descriptionMarkdown"));
        if (snap.get("status") != null) entity.setStatus((String) snap.get("status"));
        if (snap.get("requestBodyType") != null) entity.setRequestBodyType((String) snap.get("requestBodyType"));
        if (snap.get("requestBodySchemaJson") != null) entity.setRequestBodySchemaJson((String) snap.get("requestBodySchemaJson"));
        if (snap.get("requestBodyExample") != null) entity.setRequestBodyExample((String) snap.get("requestBodyExample"));
    }

    private void snapshot(Long endpointId, String changeType, String changeSummary) {
        ApiStudioEndpointEntity entity = endpointRepository.findById(endpointId).orElseThrow();
        ApiStudioEndpointDetail detail = buildDetail(entity);
        int nextVersion = versionRepository.findFirstByEndpointIdOrderByVersionNoDesc(endpointId)
                .map(v -> v.getVersionNo() + 1).orElse(1);
        try {
            String snapJson = objectMapper.writeValueAsString(detail);
            ApiStudioEndpointVersionEntity v = new ApiStudioEndpointVersionEntity();
            v.setEndpointId(endpointId);
            v.setVersionNo(nextVersion);
            v.setChangeType(changeType);
            v.setChangeSummary(changeSummary);
            v.setSnapshotJson(snapJson);
            v.setCreatorUserId(currentUserId());
            versionRepository.save(v);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("生成 API 版本快照失败", e);
        }
    }

    private ApiStudioEndpointEntity loadAndValidate(Long projectId, Long endpointId) {
        ApiStudioEndpointEntity entity = endpointRepository.findById(endpointId)
                .orElseThrow(() -> new NoSuchElementException("API 不存在: " + endpointId));
        if (!Objects.equals(entity.getProjectId(), projectId)) {
            throw new ForbiddenException("API 不属于当前项目");
        }
        return entity;
    }

    private void validateMethodPathStatusBody(ApiStudioEndpointRequest req) {
        if (req.method() == null || !ALLOWED_METHODS.contains(req.method().toUpperCase())) {
            throw new IllegalArgumentException("不支持的 HTTP 方法: " + req.method());
        }
        if (req.path() == null || req.path().isBlank()) {
            throw new IllegalArgumentException("API 路径不能为空");
        }
        if (req.status() != null && !ALLOWED_STATUS.contains(req.status().toUpperCase())) {
            throw new IllegalArgumentException("不支持的状态: " + req.status());
        }
        if (req.requestBodyType() != null && !ALLOWED_BODY_TYPE.contains(req.requestBodyType().toUpperCase())) {
            throw new IllegalArgumentException("不支持的 Body 类型: " + req.requestBodyType());
        }
    }

    private void validateDirectory(Long projectId, Long directoryId) {
        if (directoryId == null) return;
        var dir = directoryRepository.findById(directoryId)
                .orElseThrow(() -> new IllegalArgumentException("目录不存在: " + directoryId));
        if (!Objects.equals(dir.getProjectId(), projectId)) {
            throw new IllegalArgumentException("目录不属于当前项目");
        }
    }

    private int defaultSortOrder(Long projectId, Long directoryId) {
        return endpointRepository.findByProjectIdAndDirectoryIdOrderBySortOrderAscIdAsc(projectId, directoryId).size();
    }

    private String normalizePath(String path) {
        if (path == null) return "/";
        return path.startsWith("/") ? path : "/" + path;
    }

    private void persistParameters(Long endpointId, List<ApiStudioParameterPayload> payloads) {
        if (payloads == null) return;
        int idx = 0;
        for (ApiStudioParameterPayload p : payloads) {
            ApiStudioEndpointParameterEntity ent = new ApiStudioEndpointParameterEntity();
            ent.setEndpointId(endpointId);
            ent.setLocation(p.location() == null ? "QUERY" : p.location().toUpperCase());
            ent.setName(p.name());
            ent.setDataType(p.dataType() == null ? "STRING" : p.dataType().toUpperCase());
            ent.setRequired(Boolean.TRUE.equals(p.required()));
            ent.setDefaultValue(p.defaultValue());
            ent.setExampleValue(p.exampleValue());
            ent.setDescription(p.description());
            ent.setEnumJson(p.enumJson());
            ent.setSortOrder(p.sortOrder() == null ? idx++ : p.sortOrder());
            parameterRepository.save(ent);
        }
    }

    private void replaceResponses(Long endpointId, List<ApiStudioResponsePayload> payloads) {
        // 简化：全部删除后重建
        for (ApiStudioResponseEntity r : responseRepository.findByEndpointIdOrderBySortOrderAscIdAsc(endpointId)) {
            responseFieldRepository.deleteByResponseId(r.getId());
        }
        responseRepository.deleteByEndpointId(endpointId);
        persistResponses(endpointId, payloads);
    }

    private void persistResponses(Long endpointId, List<ApiStudioResponsePayload> payloads) {
        if (payloads == null) return;
        int idx = 0;
        for (ApiStudioResponsePayload r : payloads) {
            ApiStudioResponseEntity ent = new ApiStudioResponseEntity();
            ent.setEndpointId(endpointId);
            ent.setStatusCode(r.statusCode() == null ? 200 : r.statusCode());
            ent.setContentType(r.contentType() == null ? "application/json" : r.contentType());
            ent.setDescription(r.description());
            ent.setExampleBody(r.exampleBody());
            ent.setSortOrder(r.sortOrder() == null ? idx++ : r.sortOrder());
            ApiStudioResponseEntity savedResp = responseRepository.save(ent);
            persistFieldsRecursive(savedResp.getId(), null, r.fields());
        }
    }

    private void persistFieldsRecursive(Long responseId, Long parentId, List<ApiStudioResponseFieldPayload> fields) {
        if (fields == null) return;
        int idx = 0;
        for (ApiStudioResponseFieldPayload f : fields) {
            ApiStudioResponseFieldEntity ent = new ApiStudioResponseFieldEntity();
            ent.setResponseId(responseId);
            ent.setParentId(parentId);
            ent.setName(f.name());
            ent.setDataType(f.dataType() == null ? "STRING" : f.dataType().toUpperCase());
            ent.setRequired(Boolean.TRUE.equals(f.required()));
            ent.setDescription(f.description());
            ent.setExampleValue(f.exampleValue());
            ent.setEnumJson(f.enumJson());
            ent.setSortOrder(f.sortOrder() == null ? idx++ : f.sortOrder());
            ApiStudioResponseFieldEntity saved = responseFieldRepository.save(ent);
            persistFieldsRecursive(responseId, saved.getId(), f.children());
        }
    }

    // ========== DTO 构建 ==========

    private ApiStudioEndpointDetail buildDetail(ApiStudioEndpointEntity entity) {
        List<ApiStudioEndpointParameterItem> parameters = parameterRepository
                .findByEndpointIdOrderByLocationAscSortOrderAscIdAsc(entity.getId()).stream()
                .map(p -> new ApiStudioEndpointParameterItem(
                        p.getId(), p.getLocation(), p.getName(), p.getDataType(),
                        p.getRequired(), p.getDefaultValue(), p.getExampleValue(),
                        p.getDescription(), p.getEnumJson(), p.getSortOrder()))
                .toList();

        List<ApiStudioResponseEntity> responses = responseRepository.findByEndpointIdOrderBySortOrderAscIdAsc(entity.getId());
        List<ApiStudioResponseItem> responseDtos = new ArrayList<>();
        for (ApiStudioResponseEntity r : responses) {
            List<ApiStudioResponseFieldEntity> allFields = responseFieldRepository.findByResponseIdOrderByParentIdAscSortOrderAscIdAsc(r.getId());
            responseDtos.add(new ApiStudioResponseItem(
                    r.getId(), r.getStatusCode(), r.getContentType(), r.getDescription(),
                    r.getExampleBody(), r.getSortOrder(), buildFieldTree(allFields)));
        }

        return new ApiStudioEndpointDetail(
                entity.getId(), entity.getProjectId(), entity.getDirectoryId(),
                entity.getName(), entity.getMethod(), entity.getPath(),
                entity.getSummary(), entity.getDescriptionMarkdown(), entity.getStatus(),
                entity.getRequestBodyType(), entity.getRequestBodySchemaJson(), entity.getRequestBodyExample(),
                entity.getSortOrder(), entity.getRevision(),
                entity.getCreatedBy(), entity.getUpdatedBy(),
                entity.getCreatedAt(), entity.getUpdatedAt(),
                parameters, responseDtos);
    }

    private List<ApiStudioResponseFieldItem> buildFieldTree(List<ApiStudioResponseFieldEntity> all) {
        Map<Long, List<ApiStudioResponseFieldEntity>> byParent = new HashMap<>();
        for (ApiStudioResponseFieldEntity f : all) {
            byParent.computeIfAbsent(f.getParentId(), k -> new ArrayList<>()).add(f);
        }
        for (List<ApiStudioResponseFieldEntity> list : byParent.values()) {
            list.sort(Comparator.comparing(ApiStudioResponseFieldEntity::getSortOrder));
        }
        return buildField(null, byParent);
    }

    private List<ApiStudioResponseFieldItem> buildField(Long parentId, Map<Long, List<ApiStudioResponseFieldEntity>> byParent) {
        List<ApiStudioResponseFieldEntity> list = byParent.getOrDefault(parentId, List.of());
        List<ApiStudioResponseFieldItem> result = new ArrayList<>(list.size());
        for (ApiStudioResponseFieldEntity f : list) {
            result.add(new ApiStudioResponseFieldItem(
                    f.getId(), f.getParentId(), f.getName(), f.getDataType(),
                    f.getRequired(), f.getDescription(), f.getExampleValue(),
                    f.getEnumJson(), f.getSortOrder(),
                    buildField(f.getId(), byParent)));
        }
        return result;
    }

    private ApiStudioEndpointSummary toSummary(ApiStudioEndpointEntity e) {
        return new ApiStudioEndpointSummary(
                e.getId(), e.getProjectId(), e.getDirectoryId(), e.getName(),
                e.getMethod(), e.getPath(), e.getSummary(), e.getStatus(),
                e.getSortOrder(), e.getRevision(), e.getUpdatedAt());
    }

    private Long currentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId).orElse(null);
    }
}
