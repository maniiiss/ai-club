package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.GitlabApiSyncResult;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.aiclub.platform.dto.request.GitlabApiSyncRequest;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * GitLab 绑定仓库同步 API 编排服务。
 * 负责校验仓库类型、调用 code-processing 抽取 Spring 接口，并把平台生成项按 Controller 目录幂等写入 Yaade。
 */
@Service
public class GitlabApiSyncService {

    private static final String DEFAULT_BRANCH = "main";
    private static final String SUPPORTED_BACKEND_REPO_KIND = "BACKEND";
    private static final String SUPPORTED_MIXED_REPO_KIND = "MIXED";
    private static final String SYNC_SOURCE = "GITLAB_SPRING_API";

    private final ProjectGitlabBindingRepository bindingRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final TokenCipherService tokenCipherService;
    private final GitlabApiService gitlabApiService;
    private final GitlabSpringApiExtractClientService extractClientService;
    private final YaadeProjectSyncService yaadeProjectSyncService;
    private final YaadeClientService yaadeClientService;
    private final ObjectMapper objectMapper;

    public GitlabApiSyncService(ProjectGitlabBindingRepository bindingRepository,
                                ProjectDataPermissionService projectDataPermissionService,
                                TokenCipherService tokenCipherService,
                                GitlabApiService gitlabApiService,
                                GitlabSpringApiExtractClientService extractClientService,
                                YaadeProjectSyncService yaadeProjectSyncService,
                                YaadeClientService yaadeClientService,
                                ObjectMapper objectMapper) {
        this.bindingRepository = bindingRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.tokenCipherService = tokenCipherService;
        this.gitlabApiService = gitlabApiService;
        this.extractClientService = extractClientService;
        this.yaadeProjectSyncService = yaadeProjectSyncService;
        this.yaadeClientService = yaadeClientService;
        this.objectMapper = objectMapper;
    }

    /**
     * 执行一次 GitLab 仓库到 Yaade 的同步 API。
     */
    @Transactional
    public GitlabApiSyncResult syncBindingApi(Long bindingId, GitlabApiSyncRequest request) {
        ProjectGitlabBindingEntity binding = bindingRepository.findById(bindingId)
                .orElseThrow(() -> new IllegalArgumentException("GitLab 绑定不存在"));
        projectDataPermissionService.requireGitlabBindingVisible(binding);
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            throw new IllegalArgumentException("当前 GitLab 绑定已停用，不能同步 API");
        }
        String repoKind = resolveRepoKind(binding);
        if (!SUPPORTED_BACKEND_REPO_KIND.equals(repoKind) && !SUPPORTED_MIXED_REPO_KIND.equals(repoKind)) {
            throw new IllegalArgumentException("仅后端仓库和混合仓库支持同步 API");
        }
        String branch = resolveBranch(binding, request == null ? null : request.branch());
        GitlabCodeStructureClientService.StructureRepository repository = buildCodeStructureRepository(binding, branch);
        GitlabSpringApiExtractClientService.ExtractResponse extractResponse = extractClientService.extract(
                new GitlabSpringApiExtractClientService.ExtractRequest(repository)
        );
        SyncCounters counters = syncYaadeRequests(binding, branch, extractResponse);
        return new GitlabApiSyncResult(
                binding.getId(),
                binding.getProject().getId(),
                defaultString(extractResponse.branchName(), branch),
                defaultString(extractResponse.commitSha(), ""),
                extractResponse.scannedCount(),
                counters.createdCount,
                counters.updatedCount,
                counters.deletedCount,
                counters.skippedCount,
                counters.warnings,
                LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    /**
     * 同步时兼容两种形态：
     * 1. 历史平铺生成项：继续在项目根 collection 原位更新/删除，不主动搬家
     * 2. 新目录化生成项：按 Controller 子目录创建、更新和清理
     */
    private SyncCounters syncYaadeRequests(ProjectGitlabBindingEntity binding,
                                           String branch,
                                           GitlabSpringApiExtractClientService.ExtractResponse extractResponse) {
        ProjectEntity project = binding.getProject();
        YaadeProjectBindingSummary projectBinding = yaadeProjectSyncService.ensureProjectBinding(project).summary();
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        YaadeClientService.YaadeRemoteCollection rootCollection = yaadeClientService.findCollectionById(adminSession, projectBinding.yaadeCollectionId());
        List<CollectionScope> collectionScopes = loadCollectionScopes(adminSession, rootCollection);

        Map<String, GeneratedRequestRef> generatedByKey = new LinkedHashMap<>();
        Map<String, YaadeClientService.YaadeRemoteCollection> existingControllerCollections = new LinkedHashMap<>();
        Map<Long, Integer> nextRankByCollectionId = new LinkedHashMap<>();
        List<GeneratedRequestRef> generatedRequests = new ArrayList<>();
        List<String> warnings = new ArrayList<>(extractResponse.warnings() == null ? List.of() : extractResponse.warnings());

        for (CollectionScope scope : collectionScopes) {
            nextRankByCollectionId.put(scope.collection().id(), nextRequestRank(scope.requests()));
            for (YaadeClientService.YaadeRemoteRequest request : scope.requests()) {
                if (!isGeneratedFor(request, binding.getId(), branch)) {
                    continue;
                }
                GeneratedRequestRef reference = new GeneratedRequestRef(scope.collection(), request);
                generatedRequests.add(reference);
                if (!scope.rootCollection()) {
                    String controllerSignature = requestControllerSignature(request);
                    if (hasText(controllerSignature) && !existingControllerCollections.containsKey(controllerSignature)) {
                        existingControllerCollections.put(controllerSignature, scope.collection());
                    }
                }
                String key = requestKey(request);
                if (key.isBlank()) {
                    warnings.add("发现缺少 method/path 标记的历史生成请求，已保留：" + request.id());
                    continue;
                }
                if (generatedByKey.containsKey(key)) {
                    warnings.add("发现重复的历史生成请求，已保留第一条：" + key);
                    continue;
                }
                generatedByKey.put(key, reference);
            }
        }

        SyncCounters counters = new SyncCounters(warnings);
        LinkedHashSet<String> currentKeys = new LinkedHashSet<>();
        List<GitlabSpringApiExtractClientService.ExtractedEndpoint> endpoints = extractResponse.endpoints() == null
                ? List.of()
                : extractResponse.endpoints();
        Map<String, ControllerDirectoryPlan> directoryPlans = buildControllerDirectoryPlans(endpoints);

        for (GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint : endpoints) {
            String key = endpointKey(endpoint);
            if (!currentKeys.add(key)) {
                counters.skippedCount++;
                counters.warnings.add("接口重复，已跳过：" + key);
                continue;
            }
            GeneratedRequestRef existing = generatedByKey.get(key);
            YaadeClientService.YaadeRemoteCollection targetCollection;
            int rank;
            if (existing != null) {
                targetCollection = existing.collection();
                rank = requestRank(existing.request());
            } else {
                String controllerSignature = resolveControllerSignature(endpoint);
                ControllerDirectoryPlan directoryPlan = directoryPlans.get(controllerSignature);
                targetCollection = resolveControllerCollection(
                        adminSession,
                        rootCollection,
                        directoryPlan,
                        existingControllerCollections,
                        nextRankByCollectionId
                );
                rank = nextRankByCollectionId.getOrDefault(targetCollection.id(), 0);
                nextRankByCollectionId.put(targetCollection.id(), rank + 1);
            }
            ObjectNode data = buildYaadeRequestData(binding, branch, endpoint, rank);
            if (existing == null) {
                yaadeClientService.createRestRequest(adminSession, targetCollection.id(), data);
                counters.createdCount++;
                continue;
            }
            if (jsonEquals(existing.request().data(), data)) {
                counters.skippedCount++;
                continue;
            }
            yaadeClientService.updateRequest(adminSession, existing.request().withData(data));
            counters.updatedCount++;
        }

        LinkedHashSet<Long> maybeEmptyCollectionIds = new LinkedHashSet<>();
        for (GeneratedRequestRef reference : generatedRequests) {
            String key = requestKey(reference.request());
            if (!key.isBlank() && !currentKeys.contains(key)) {
                yaadeClientService.deleteRequest(adminSession, reference.request().id());
                counters.deletedCount++;
                if (!Objects.equals(reference.collection().id(), rootCollection.id())) {
                    maybeEmptyCollectionIds.add(reference.collection().id());
                }
            }
        }
        cleanupEmptyControllerCollections(adminSession, rootCollection.id(), maybeEmptyCollectionIds);
        return counters;
    }

    /**
     * 拉平成“项目根 + 全部子孙目录”的扫描视图，便于同时兼容旧平铺接口和新的 Controller 子目录。
     */
    private List<CollectionScope> loadCollectionScopes(YaadeClientService.YaadeSession adminSession,
                                                       YaadeClientService.YaadeRemoteCollection rootCollection) {
        List<CollectionScope> scopes = new ArrayList<>();
        for (YaadeClientService.YaadeRemoteCollection collection : yaadeClientService.listCollectionsInSubtree(adminSession, rootCollection.id())) {
            boolean root = Objects.equals(collection.id(), rootCollection.id());
            scopes.add(new CollectionScope(
                    collection,
                    yaadeClientService.listCollectionRequests(collection),
                    root
            ));
        }
        scopes.sort(Comparator
                .comparing(CollectionScope::rootCollection)
                .reversed()
                .thenComparing(scope -> scope.collection().rank() == null ? Integer.MAX_VALUE : scope.collection().rank()));
        return scopes;
    }

    /**
     * 为本次抽取结果计算目录名冲突后的最终子目录名称，保证“每个 Controller 一个目录”。
     */
    private Map<String, ControllerDirectoryPlan> buildControllerDirectoryPlans(List<GitlabSpringApiExtractClientService.ExtractedEndpoint> endpoints) {
        Map<String, GitlabSpringApiExtractClientService.ExtractedEndpoint> firstEndpointByController = new LinkedHashMap<>();
        Map<String, Integer> displayNameCounts = new LinkedHashMap<>();
        for (GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint : endpoints) {
            String controllerSignature = resolveControllerSignature(endpoint);
            if (firstEndpointByController.containsKey(controllerSignature)) {
                continue;
            }
            firstEndpointByController.put(controllerSignature, endpoint);
            String displayName = resolveControllerDisplayName(endpoint);
            displayNameCounts.put(displayName, displayNameCounts.getOrDefault(displayName, 0) + 1);
        }

        Map<String, ControllerDirectoryPlan> result = new LinkedHashMap<>();
        for (Map.Entry<String, GitlabSpringApiExtractClientService.ExtractedEndpoint> entry : firstEndpointByController.entrySet()) {
            GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint = entry.getValue();
            String displayName = resolveControllerDisplayName(endpoint);
            String className = resolveControllerClassName(endpoint);
            String directoryName = displayNameCounts.getOrDefault(displayName, 0) > 1
                    ? displayName + "（" + className + "）"
                    : displayName;
            result.put(entry.getKey(), new ControllerDirectoryPlan(entry.getKey(), className, directoryName));
        }
        return result;
    }

    /**
     * 优先复用已有目录；只有首次出现的 Controller 才在项目根 collection 下新建一个子目录。
     */
    private YaadeClientService.YaadeRemoteCollection resolveControllerCollection(
            YaadeClientService.YaadeSession adminSession,
            YaadeClientService.YaadeRemoteCollection rootCollection,
            ControllerDirectoryPlan directoryPlan,
            Map<String, YaadeClientService.YaadeRemoteCollection> existingControllerCollections,
            Map<Long, Integer> nextRankByCollectionId) {
        YaadeClientService.YaadeRemoteCollection existing = existingControllerCollections.get(directoryPlan.controllerSignature());
        if (existing != null) {
            return existing;
        }
        YaadeClientService.YaadeRemoteCollection created = yaadeClientService.createCollection(
                adminSession,
                directoryPlan.directoryName(),
                rootCollection.id(),
                rootCollection.groups()
        );
        existingControllerCollections.put(directoryPlan.controllerSignature(), created);
        nextRankByCollectionId.put(created.id(), 0);
        return created;
    }

    /**
     * 仅在本次同步确认某个 Controller 目录已经没有任何请求或子目录时，才删除空目录。
     */
    private void cleanupEmptyControllerCollections(YaadeClientService.YaadeSession adminSession,
                                                   Long rootCollectionId,
                                                   LinkedHashSet<Long> maybeEmptyCollectionIds) {
        for (Long collectionId : maybeEmptyCollectionIds) {
            List<YaadeClientService.YaadeRemoteCollection> subtree = yaadeClientService.listCollectionsInSubtree(adminSession, collectionId);
            if (subtree.size() != 1) {
                continue;
            }
            YaadeClientService.YaadeRemoteCollection collection = subtree.get(0);
            if (Objects.equals(collection.id(), rootCollectionId)) {
                continue;
            }
            if (!yaadeClientService.listCollectionRequests(collection).isEmpty()) {
                continue;
            }
            yaadeClientService.deleteCollection(adminSession, collection.id());
        }
    }

    private ObjectNode buildYaadeRequestData(ProjectGitlabBindingEntity binding,
                                             String branch,
                                             GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint,
                                             int rank) {
        ObjectNode data = objectMapper.createObjectNode();
        data.put("name", defaultString(endpoint.name(), endpoint.method() + " " + endpoint.path()));
        data.put("description", buildDescription(endpoint));
        data.put("uri", normalizePath(endpoint.path()));
        data.put("rank", rank);
        data.put("method", defaultString(endpoint.method(), "GET").toUpperCase(Locale.ROOT));
        data.put("body", defaultString(endpoint.bodyExample(), ""));
        data.put("contentType", defaultString(endpoint.requestContentType(), "none"));
        data.set("headers", buildKeyValueArray(endpoint.headers()));
        data.set("params", buildKeyValueArray(endpoint.queryParams()));
        data.set("formDataBody", objectMapper.createArrayNode());
        data.set("auth", objectMapper.createObjectNode());
        ObjectNode syncMarker = data.putObject("aiclubSync");
        syncMarker.put("source", SYNC_SOURCE);
        syncMarker.put("bindingId", String.valueOf(binding.getId()));
        syncMarker.put("branch", branch);
        syncMarker.put("method", defaultString(endpoint.method(), "GET").toUpperCase(Locale.ROOT));
        syncMarker.put("path", normalizePath(endpoint.path()));
        syncMarker.put("sourceSignature", defaultString(endpoint.sourceSignature(), ""));
        syncMarker.put("controllerSignature", resolveControllerSignature(endpoint));
        syncMarker.put("controllerClassName", resolveControllerClassName(endpoint));
        syncMarker.put("controllerDisplayName", resolveControllerDisplayName(endpoint));
        return data;
    }

    private String buildDescription(GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint) {
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

    private void appendParameterSection(List<String> lines,
                                        String title,
                                        List<GitlabSpringApiExtractClientService.ExtractedParameter> parameters) {
        if (parameters == null || parameters.isEmpty()) {
            return;
        }
        lines.add("### " + title);
        for (GitlabSpringApiExtractClientService.ExtractedParameter parameter : parameters) {
            String requiredText = parameter.required() ? "必填" : "可选";
            String defaultText = hasText(parameter.defaultValue()) ? "，默认值：" + parameter.defaultValue() : "";
            String description = hasText(parameter.description()) ? "，" + parameter.description() : "";
            lines.add("- `" + parameter.name() + "`：" + defaultString(parameter.type(), "-") + "，" + requiredText + defaultText + description);
        }
        lines.add("");
    }

    private ArrayNode buildKeyValueArray(List<GitlabSpringApiExtractClientService.ExtractedParameter> parameters) {
        ArrayNode array = objectMapper.createArrayNode();
        if (parameters == null) {
            return array;
        }
        for (GitlabSpringApiExtractClientService.ExtractedParameter parameter : parameters) {
            ObjectNode item = objectMapper.createObjectNode();
            item.put("key", defaultString(parameter.name(), ""));
            item.put("value", defaultString(parameter.defaultValue(), ""));
            item.put("description", defaultString(parameter.description(), ""));
            item.put("enabled", true);
            item.put("required", parameter.required());
            item.put("type", defaultString(parameter.type(), ""));
            array.add(item);
        }
        return array;
    }

    private String resolveControllerSignature(GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint) {
        String controllerSignature = trimToNull(endpoint.controllerSignature());
        if (controllerSignature != null) {
            return controllerSignature;
        }
        String sourceFile = defaultString(endpoint.sourceFile(), "");
        String className = resolveControllerClassName(endpoint);
        return hasText(sourceFile) ? sourceFile + "#" + className : className;
    }

    private String resolveControllerClassName(GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint) {
        String controllerClassName = trimToNull(endpoint.controllerClassName());
        if (controllerClassName != null) {
            return controllerClassName;
        }
        String sourceFile = trimToNull(endpoint.sourceFile());
        if (sourceFile != null && sourceFile.contains("/")) {
            String fileName = sourceFile.substring(sourceFile.lastIndexOf('/') + 1);
            if (fileName.endsWith(".java")) {
                return fileName.substring(0, fileName.length() - 5);
            }
        }
        return "UnknownController";
    }

    private String resolveControllerDisplayName(GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint) {
        return defaultString(trimToNull(endpoint.controllerDisplayName()), resolveControllerClassName(endpoint));
    }

    private String resolveRepoKind(ProjectGitlabBindingEntity binding) {
        String jsonText = trimToNull(binding.getTestProfileJson());
        if (jsonText == null) {
            return "";
        }
        try {
            return objectMapper.readTree(jsonText)
                    .path("repoKind")
                    .asText("")
                    .trim()
                    .toUpperCase(Locale.ROOT);
        } catch (Exception exception) {
            throw new IllegalArgumentException("GitLab 绑定中的 testProfileJson 不是合法 JSON", exception);
        }
    }

    private String resolveBranch(ProjectGitlabBindingEntity binding, String requestedBranch) {
        String normalized = trimToNull(requestedBranch);
        if (normalized != null) {
            return normalized;
        }
        if (hasText(binding.getDefaultTargetBranch())) {
            return binding.getDefaultTargetBranch().trim();
        }
        return DEFAULT_BRANCH;
    }

    private GitlabCodeStructureClientService.StructureRepository buildCodeStructureRepository(ProjectGitlabBindingEntity binding,
                                                                                              String branch) {
        String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        ProjectGitlabBindingEntity refreshedBinding = refreshCloneUrlsIfRequired(binding, token);
        String repoUrl = resolveCloneUrl(refreshedBinding);
        if (!hasText(repoUrl)) {
            throw new IllegalStateException("当前 GitLab 绑定缺少可用的 HTTP Clone 地址");
        }
        return new GitlabCodeStructureClientService.StructureRepository(
                String.valueOf(refreshedBinding.getId()),
                defaultString(hasText(refreshedBinding.getGitlabProjectPath()) ? refreshedBinding.getGitlabProjectPath() : refreshedBinding.getGitlabProjectRef(), ""),
                defaultString(refreshedBinding.getGitlabProjectRef(), ""),
                defaultString(refreshedBinding.getGitlabProjectPath(), ""),
                repoUrl,
                branch,
                refreshedBinding.getApiBaseUrl(),
                token
        );
    }

    private ProjectGitlabBindingEntity refreshCloneUrlsIfRequired(ProjectGitlabBindingEntity binding, String token) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding;
        }
        GitlabApiService.GitlabProject project = gitlabApiService.fetchProject(binding.getApiBaseUrl(), token, binding.getGitlabProjectRef());
        binding.setGitlabProjectId(project.id());
        binding.setGitlabProjectName(project.name());
        binding.setGitlabProjectPath(project.pathWithNamespace());
        binding.setGitlabProjectWebUrl(project.webUrl());
        binding.setGitlabHttpCloneUrl(project.httpCloneUrl());
        binding.setGitlabSshCloneUrl(project.sshCloneUrl());
        if (!hasText(binding.getDefaultTargetBranch()) && hasText(project.defaultBranch())) {
            binding.setDefaultTargetBranch(project.defaultBranch());
        }
        return bindingRepository.save(binding);
    }

    private String resolveCloneUrl(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding.getGitlabHttpCloneUrl().trim();
        }
        if (hasText(binding.getGitlabProjectWebUrl())) {
            String webUrl = binding.getGitlabProjectWebUrl().trim();
            return webUrl.endsWith(".git") ? webUrl : webUrl + ".git";
        }
        return null;
    }

    private int nextRequestRank(List<YaadeClientService.YaadeRemoteRequest> requests) {
        return requests.stream()
                .map(request -> request.data().path("rank"))
                .filter(JsonNode::isNumber)
                .map(JsonNode::asInt)
                .max(Comparator.naturalOrder())
                .orElse(-1) + 1;
    }

    private int requestRank(YaadeClientService.YaadeRemoteRequest request) {
        return request.data().path("rank").isNumber() ? request.data().path("rank").asInt() : 0;
    }

    private boolean isGeneratedFor(YaadeClientService.YaadeRemoteRequest request, Long bindingId, String branch) {
        JsonNode marker = request.data().path("aiclubSync");
        return SYNC_SOURCE.equals(marker.path("source").asText(""))
                && String.valueOf(bindingId).equals(marker.path("bindingId").asText(""))
                && Objects.equals(branch, marker.path("branch").asText(""));
    }

    private String requestControllerSignature(YaadeClientService.YaadeRemoteRequest request) {
        return trimToNull(request.data().path("aiclubSync").path("controllerSignature").asText(""));
    }

    private String requestKey(YaadeClientService.YaadeRemoteRequest request) {
        JsonNode marker = request.data().path("aiclubSync");
        String method = defaultString(marker.path("method").asText(null), request.data().path("method").asText(""));
        String path = defaultString(marker.path("path").asText(null), request.data().path("uri").asText(""));
        if (!hasText(method) || !hasText(path)) {
            return "";
        }
        return method.toUpperCase(Locale.ROOT) + " " + normalizePath(path);
    }

    private String endpointKey(GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint) {
        return defaultString(endpoint.method(), "GET").toUpperCase(Locale.ROOT) + " " + normalizePath(endpoint.path());
    }

    private String normalizePath(String path) {
        String normalized = defaultString(path, "/").trim();
        if (!normalized.startsWith("/")) {
            normalized = "/" + normalized;
        }
        return normalized.replaceAll("/{2,}", "/");
    }

    private boolean jsonEquals(ObjectNode left, ObjectNode right) {
        return left != null && right != null && left.equals(right);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    /**
     * collection 视图快照：同步期间不落库，只为本轮目录与请求归属判断服务。
     */
    private record CollectionScope(YaadeClientService.YaadeRemoteCollection collection,
                                   List<YaadeClientService.YaadeRemoteRequest> requests,
                                   boolean rootCollection) {
    }

    /**
     * 已存在的生成请求及其所在 collection。
     * 这样可以在匹配到历史平铺接口时继续原位更新，而不是强行搬进新目录。
     */
    private record GeneratedRequestRef(YaadeClientService.YaadeRemoteCollection collection,
                                       YaadeClientService.YaadeRemoteRequest request) {
    }

    /**
     * Controller 对应的目录规划结果。
     * 一个 Controller 只对应一个目录，同名展示名通过追加类名消歧。
     */
    private record ControllerDirectoryPlan(String controllerSignature,
                                           String controllerClassName,
                                           String directoryName) {
    }

    private static final class SyncCounters {
        private int createdCount;
        private int updatedCount;
        private int deletedCount;
        private int skippedCount;
        private final List<String> warnings;

        private SyncCounters(List<String> warnings) {
            this.warnings = warnings;
        }
    }
}
