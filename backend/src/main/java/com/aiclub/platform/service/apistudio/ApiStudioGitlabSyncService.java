package com.aiclub.platform.service.apistudio;

import com.aiclub.platform.domain.model.ApiStudioDirectoryEntity;
import com.aiclub.platform.domain.model.ApiStudioEndpointEntity;
import com.aiclub.platform.domain.model.ApiStudioSyncBindingEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.request.apistudio.ApiStudioEndpointRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioParameterPayload;
import com.aiclub.platform.repository.ApiStudioDirectoryRepository;
import com.aiclub.platform.repository.ApiStudioEndpointRepository;
import com.aiclub.platform.repository.ApiStudioSyncBindingRepository;
import com.aiclub.platform.service.GitlabSpringApiExtractClientService.ExtractedEndpoint;
import com.aiclub.platform.service.GitlabSpringApiExtractClientService.ExtractedParameter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * GitLab Spring 接口抽取 → 原生 API Studio 同步服务。
 *
 * 取代旧 {@code GitlabApiSyncService.syncYaadeRequests}：
 *   - 写入目标从 Yaade collection 改为 {@code api_studio_directory/endpoint/parameter}。
 *   - 幂等 marker 从嵌入 data.aiclubSync 改为独立 {@link ApiStudioSyncBindingEntity}。
 *   - 走服务内部写入路径（{@code createInternal/updateInternal/deleteInternal}），
 *     不读取 AuthContextHolder，由调用方在外层做 gitlab:manage 权限检查。
 *
 * 行为保持与旧实现一致：
 *   1. 仅触碰由本 binding+branch 同步生成的 endpoint，手工创建的不影响。
 *   2. 每个 Controller 一个子目录；显示名冲突追加 "（ClassName）" 消歧。
 *   3. 抽取结果中不存在的旧同步项删除；空 Controller 目录清理。
 *   4. 同样的抽取结果再次同步 → 全部 skipped。
 */
@Service
public class ApiStudioGitlabSyncService {

    public static final String SOURCE_TYPE = ApiStudioSyncBindingEntity.SOURCE_TYPE_GITLAB_SPRING_API;

    private final ApiStudioEndpointService endpointService;
    private final ApiStudioDirectoryService directoryService;
    private final ApiStudioEndpointRepository endpointRepository;
    private final ApiStudioDirectoryRepository directoryRepository;
    private final ApiStudioSyncBindingRepository syncBindingRepository;

    public ApiStudioGitlabSyncService(ApiStudioEndpointService endpointService,
                                      ApiStudioDirectoryService directoryService,
                                      ApiStudioEndpointRepository endpointRepository,
                                      ApiStudioDirectoryRepository directoryRepository,
                                      ApiStudioSyncBindingRepository syncBindingRepository) {
        this.endpointService = endpointService;
        this.directoryService = directoryService;
        this.endpointRepository = endpointRepository;
        this.directoryRepository = directoryRepository;
        this.syncBindingRepository = syncBindingRepository;
    }

    public SyncOutcome sync(ProjectEntity project,
                            Long bindingId,
                            String branch,
                            List<ExtractedEndpoint> endpoints,
                            Long actorUserId,
                            List<String> baseWarnings) {
        if (project == null || project.getId() == null) {
            throw new IllegalArgumentException("project 必须存在");
        }
        SyncCounters counters = new SyncCounters();
        if (baseWarnings != null) {
            counters.warnings.addAll(baseWarnings);
        }
        List<ExtractedEndpoint> safeEndpoints = endpoints == null ? List.of() : endpoints;
        Long projectId = project.getId();

        // 1. 索引现有的 sync_binding 行
        List<ApiStudioSyncBindingEntity> existing = syncBindingRepository
                .findBySourceTypeAndSourceBindingIdAndBranch(SOURCE_TYPE, bindingId, branch);
        Map<String, GeneratedRequestRef> generatedByKey = new LinkedHashMap<>();
        for (ApiStudioSyncBindingEntity binding : existing) {
            ApiStudioEndpointEntity entity = endpointRepository.findById(binding.getEndpointId()).orElse(null);
            if (entity == null) {
                // 主表已不存在，清理悬挂行
                syncBindingRepository.delete(binding);
                continue;
            }
            String key = endpointKey(entity.getMethod(), entity.getPath());
            if (generatedByKey.containsKey(key)) {
                counters.warnings.add("发现重复历史同步项，保留第一条：" + key);
                continue;
            }
            generatedByKey.put(key, new GeneratedRequestRef(entity, binding));
        }

        // 2. 规划 Controller→目录 名称（与旧实现一致）
        Map<String, ControllerDirectoryPlan> directoryPlans = buildControllerDirectoryPlans(safeEndpoints);

        // 3. 索引现有同名 Controller 目录（直接子目录）以便复用
        Map<String, ApiStudioDirectoryEntity> dirByName = new LinkedHashMap<>();
        for (ApiStudioDirectoryEntity dir : directoryRepository
                .findByProjectIdAndParentIdOrderBySortOrderAscIdAsc(projectId, null)) {
            dirByName.put(dir.getName(), dir);
        }

        LinkedHashSet<String> currentKeys = new LinkedHashSet<>();
        LinkedHashSet<Long> maybeEmptyDirectoryIds = new LinkedHashSet<>();

        // 4. 处理本次抽取每个 endpoint
        for (ExtractedEndpoint endpoint : safeEndpoints) {
            String key = endpointKey(endpoint.method(), endpoint.path());
            if (!currentKeys.add(key)) {
                counters.skippedCount++;
                counters.warnings.add("接口重复，已跳过：" + key);
                continue;
            }

            GeneratedRequestRef existingRef = generatedByKey.get(key);
            ApiStudioDirectoryEntity targetDir;
            if (existingRef != null) {
                targetDir = existingRef.endpoint().getDirectoryId() == null
                        ? null
                        : directoryRepository.findById(existingRef.endpoint().getDirectoryId()).orElse(null);
            } else {
                String controllerSignature = resolveControllerSignature(endpoint);
                ControllerDirectoryPlan plan = directoryPlans.get(controllerSignature);
                targetDir = resolveControllerDirectory(projectId, plan, dirByName, actorUserId);
            }

            ApiStudioEndpointRequest request = buildEndpointRequest(endpoint, targetDir);
            if (existingRef == null) {
                ApiStudioEndpointEntity created = endpointService.createInternal(projectId, request, actorUserId, true);
                ApiStudioSyncBindingEntity newBinding = new ApiStudioSyncBindingEntity();
                newBinding.setEndpointId(created.getId());
                newBinding.setSourceType(SOURCE_TYPE);
                newBinding.setSourceBindingId(bindingId);
                newBinding.setBranch(branch);
                newBinding.setSourceSignature(resolveControllerSignature(endpoint));
                newBinding.setLastSyncedAt(LocalDateTime.now());
                syncBindingRepository.save(newBinding);
                counters.createdCount++;
                continue;
            }

            if (isSameEndpoint(existingRef.endpoint(), request)) {
                counters.skippedCount++;
                continue;
            }
            // 传 revision 进入 updateInternal 做乐观锁
            ApiStudioEndpointRequest updateReq = withRevision(request, existingRef.endpoint().getRevision());
            endpointService.updateInternal(projectId, existingRef.endpoint().getId(), updateReq, actorUserId, false);
            existingRef.binding().setSourceSignature(resolveControllerSignature(endpoint));
            existingRef.binding().setLastSyncedAt(LocalDateTime.now());
            syncBindingRepository.save(existingRef.binding());
            counters.updatedCount++;
        }

        // 5. 删除不再存在的同步项
        for (GeneratedRequestRef ref : generatedByKey.values()) {
            String key = endpointKey(ref.endpoint().getMethod(), ref.endpoint().getPath());
            if (currentKeys.contains(key)) {
                continue;
            }
            if (ref.endpoint().getDirectoryId() != null) {
                maybeEmptyDirectoryIds.add(ref.endpoint().getDirectoryId());
            }
            // sync_binding 通过外键级联自动清理
            endpointService.deleteInternal(projectId, ref.endpoint().getId());
            counters.deletedCount++;
        }

        // 6. 清理空 Controller 目录
        cleanupEmptyDirectories(projectId, maybeEmptyDirectoryIds);

        return new SyncOutcome(counters.createdCount, counters.updatedCount, counters.deletedCount,
                counters.skippedCount, counters.warnings);
    }

    // ========== 内部 ==========

    private Map<String, ControllerDirectoryPlan> buildControllerDirectoryPlans(List<ExtractedEndpoint> endpoints) {
        Map<String, ExtractedEndpoint> firstByController = new LinkedHashMap<>();
        Map<String, Integer> displayNameCounts = new HashMap<>();
        for (ExtractedEndpoint endpoint : endpoints) {
            String controllerSignature = resolveControllerSignature(endpoint);
            if (firstByController.containsKey(controllerSignature)) continue;
            firstByController.put(controllerSignature, endpoint);
            String displayName = resolveControllerDisplayName(endpoint);
            displayNameCounts.merge(displayName, 1, Integer::sum);
        }
        Map<String, ControllerDirectoryPlan> result = new LinkedHashMap<>();
        for (Map.Entry<String, ExtractedEndpoint> entry : firstByController.entrySet()) {
            ExtractedEndpoint endpoint = entry.getValue();
            String displayName = resolveControllerDisplayName(endpoint);
            String className = resolveControllerClassName(endpoint);
            String directoryName = displayNameCounts.getOrDefault(displayName, 0) > 1
                    ? displayName + "（" + className + "）"
                    : displayName;
            result.put(entry.getKey(), new ControllerDirectoryPlan(entry.getKey(), className, directoryName));
        }
        return result;
    }

    private ApiStudioDirectoryEntity resolveControllerDirectory(Long projectId,
                                                                ControllerDirectoryPlan plan,
                                                                Map<String, ApiStudioDirectoryEntity> dirByName,
                                                                Long actorUserId) {
        if (plan == null) return null;
        ApiStudioDirectoryEntity existing = dirByName.get(plan.directoryName());
        if (existing != null) return existing;
        ApiStudioDirectoryEntity created = directoryService.createInternal(
                projectId, null, plan.directoryName(), null, null, actorUserId);
        dirByName.put(plan.directoryName(), created);
        return created;
    }

    private void cleanupEmptyDirectories(Long projectId, LinkedHashSet<Long> directoryIds) {
        for (Long id : directoryIds) {
            try {
                long childDirs = directoryRepository.countByParentId(id);
                long childEndpoints = endpointRepository.countByDirectoryId(id);
                if (childDirs == 0 && childEndpoints == 0) {
                    directoryService.deleteInternal(projectId, id);
                }
            } catch (Exception ignored) {
                // 清理失败不影响主流程，目录留存
            }
        }
    }

    private ApiStudioEndpointRequest buildEndpointRequest(ExtractedEndpoint endpoint, ApiStudioDirectoryEntity targetDir) {
        String method = defaultString(endpoint.method(), "GET").toUpperCase(Locale.ROOT);
        String path = normalizePath(endpoint.path());
        String name = defaultString(endpoint.name(), method + " " + path);
        String description = buildDescription(endpoint);
        String contentType = defaultString(endpoint.requestContentType(), "");
        String bodyType = mapBodyType(contentType);

        List<ApiStudioParameterPayload> parameters = new ArrayList<>();
        addParameters(parameters, "HEADER", endpoint.headers());
        addParameters(parameters, "QUERY", endpoint.queryParams());
        addParameters(parameters, "PATH", endpoint.pathParams());
        if ("FORM_DATA".equals(bodyType) || "FORM_URLENCODED".equals(bodyType)) {
            addParameters(parameters, bodyType, endpoint.bodyFields());
        }

        return new ApiStudioEndpointRequest(
                targetDir == null ? null : targetDir.getId(),
                name,
                method,
                path,
                null,                        // summary
                description,
                "DRAFT",
                bodyType,
                null,                        // requestBodySchemaJson 暂不写
                endpoint.bodyExample(),
                null,                        // sortOrder 由 internal 路径自动计算
                null,                        // revision，新建时不需要
                parameters,
                List.of(),                   // responses 暂不写
                "GitLab 同步：" + name
        );
    }

    private ApiStudioEndpointRequest withRevision(ApiStudioEndpointRequest src, Integer revision) {
        return new ApiStudioEndpointRequest(
                src.directoryId(), src.name(), src.method(), src.path(),
                src.summary(), src.descriptionMarkdown(), src.status(),
                src.requestBodyType(), src.requestBodySchemaJson(), src.requestBodyExample(),
                src.sortOrder(), revision,
                src.parameters(), src.responses(), src.changeSummary()
        );
    }

    private boolean isSameEndpoint(ApiStudioEndpointEntity existing, ApiStudioEndpointRequest request) {
        // 简化比对：方法/路径/名称/描述/body 一致即视为无变化
        return Objects.equals(existing.getMethod(), request.method().toUpperCase(Locale.ROOT))
                && Objects.equals(existing.getPath(), normalizePath(request.path()))
                && Objects.equals(defaultString(existing.getName(), ""), defaultString(request.name(), ""))
                && Objects.equals(defaultString(existing.getDescriptionMarkdown(), ""), defaultString(request.descriptionMarkdown(), ""))
                && Objects.equals(defaultString(existing.getRequestBodyType(), "NONE"), defaultString(request.requestBodyType(), "NONE"))
                && Objects.equals(defaultString(existing.getRequestBodyExample(), ""), defaultString(request.requestBodyExample(), ""));
    }

    private void addParameters(List<ApiStudioParameterPayload> bucket,
                               String location,
                               List<ExtractedParameter> source) {
        if (source == null) return;
        int idx = bucket.size();
        for (ExtractedParameter p : source) {
            bucket.add(new ApiStudioParameterPayload(
                    null,
                    location,
                    p.name(),
                    mapDataType(p.type(), location),
                    p.required(),
                    p.defaultValue(),
                    null,
                    p.description(),
                    null,
                    idx++
            ));
        }
    }

    private String buildDescription(ExtractedEndpoint endpoint) {
        List<String> lines = new ArrayList<>();
        if (hasText(endpoint.description())) {
            lines.add(endpoint.description().trim());
            lines.add("");
        }
        appendParameterSection(lines, "路径参数", endpoint.pathParams());
        appendParameterSection(lines, "查询参数", endpoint.queryParams());
        appendParameterSection(lines, "请求头", endpoint.headers());
        appendParameterSection(lines, "请求体字段", endpoint.bodyFields());
        if (hasText(endpoint.sourceFile())) {
            lines.add("来源：" + endpoint.sourceFile() + (endpoint.sourceLine() == null ? "" : ":" + endpoint.sourceLine()));
        }
        return String.join("\n", lines).trim();
    }

    private void appendParameterSection(List<String> lines, String title, List<ExtractedParameter> parameters) {
        if (parameters == null || parameters.isEmpty()) return;
        lines.add("### " + title);
        for (ExtractedParameter parameter : parameters) {
            String requiredText = parameter.required() ? "必填" : "可选";
            String defaultText = hasText(parameter.defaultValue()) ? "，默认值：" + parameter.defaultValue() : "";
            String description = hasText(parameter.description()) ? "，" + parameter.description() : "";
            lines.add("- `" + parameter.name() + "`：" + defaultString(parameter.type(), "-") + "，" + requiredText + defaultText + description);
        }
        lines.add("");
    }

    private String mapBodyType(String contentType) {
        if (contentType == null || contentType.isBlank() || "none".equalsIgnoreCase(contentType)) return "NONE";
        String normalized = contentType.toLowerCase(Locale.ROOT);
        if (normalized.contains("application/json")) return "JSON";
        if (normalized.contains("multipart/form-data")) return "FORM_DATA";
        if (normalized.contains("application/x-www-form-urlencoded")) return "FORM_URLENCODED";
        if (normalized.startsWith("text/")) return "RAW_TEXT";
        return "NONE";
    }

    /**
     * 把 Java 类型粗略映射到 api_studio_endpoint_parameter.data_type 的取值集合。
     * 取值约束：STRING/NUMBER/INTEGER/BOOLEAN/ARRAY/OBJECT/FILE。
     */
    private String mapDataType(String javaType, String location) {
        if (javaType == null || javaType.isBlank()) return "STRING";
        String t = javaType.trim().toLowerCase(Locale.ROOT);
        // 文件上传仅在 form-data 中有意义
        if (("FORM_DATA".equals(location)) && (t.contains("multipartfile") || t.contains("file"))) return "FILE";
        if (t.contains("bool")) return "BOOLEAN";
        if (t.equals("int") || t.contains("integer") || t.contains("long") || t.contains("short") || t.contains("biginteger")) return "INTEGER";
        if (t.contains("double") || t.contains("float") || t.contains("decimal") || t.contains("bigdecimal") || t.contains("number")) return "NUMBER";
        if (t.contains("list") || t.contains("[]") || t.contains("array") || t.contains("collection") || t.contains("set")) return "ARRAY";
        if (t.contains("map") || t.contains("object") || t.contains("dto") || t.contains("vo") || t.contains("request") || t.contains("response")) return "OBJECT";
        return "STRING";
    }

    private String resolveControllerSignature(ExtractedEndpoint endpoint) {
        String controllerSignature = trimToNull(endpoint.controllerSignature());
        if (controllerSignature != null) return controllerSignature;
        String sourceFile = defaultString(endpoint.sourceFile(), "");
        String className = resolveControllerClassName(endpoint);
        return hasText(sourceFile) ? sourceFile + "#" + className : className;
    }

    private String resolveControllerClassName(ExtractedEndpoint endpoint) {
        String controllerClassName = trimToNull(endpoint.controllerClassName());
        if (controllerClassName != null) return controllerClassName;
        String sourceFile = trimToNull(endpoint.sourceFile());
        if (sourceFile != null && sourceFile.contains("/")) {
            String fileName = sourceFile.substring(sourceFile.lastIndexOf('/') + 1);
            if (fileName.endsWith(".java")) return fileName.substring(0, fileName.length() - 5);
        }
        return "UnknownController";
    }

    private String resolveControllerDisplayName(ExtractedEndpoint endpoint) {
        return defaultString(trimToNull(endpoint.controllerDisplayName()), resolveControllerClassName(endpoint));
    }

    private String endpointKey(String method, String path) {
        if (method == null || path == null) return "";
        return method.toUpperCase(Locale.ROOT) + " " + normalizePath(path);
    }

    private String normalizePath(String path) {
        String normalized = defaultString(path, "/").trim();
        if (!normalized.startsWith("/")) normalized = "/" + normalized;
        return normalized.replaceAll("/{2,}", "/");
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    // ========== records ==========

    public record SyncOutcome(int createdCount, int updatedCount, int deletedCount,
                              int skippedCount, List<String> warnings) {
    }

    private record GeneratedRequestRef(ApiStudioEndpointEntity endpoint, ApiStudioSyncBindingEntity binding) {
    }

    private record ControllerDirectoryPlan(String controllerSignature, String controllerClassName, String directoryName) {
    }

    private static final class SyncCounters {
        private int createdCount;
        private int updatedCount;
        private int deletedCount;
        private int skippedCount;
        private final List<String> warnings = new ArrayList<>();
    }

    // 暴露 Optional 类型以便调用方处理（保留扩展位）
    @SuppressWarnings("unused")
    public Optional<ApiStudioSyncBindingEntity> findBinding(Long endpointId) {
        return syncBindingRepository.findByEndpointId(endpointId);
    }

    @Transactional
    public void purgeBindingSync(Long sourceBindingId) {
        for (ApiStudioSyncBindingEntity binding : syncBindingRepository.findBySourceTypeAndSourceBindingId(SOURCE_TYPE, sourceBindingId)) {
            syncBindingRepository.delete(binding);
        }
    }
}
