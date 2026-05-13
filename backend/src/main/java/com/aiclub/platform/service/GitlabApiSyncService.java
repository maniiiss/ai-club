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
 * 负责校验仓库类型、调用 code-processing 抽取 Spring 接口，并把平台生成项幂等写入 Yaade。
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

    private SyncCounters syncYaadeRequests(ProjectGitlabBindingEntity binding,
                                           String branch,
                                           GitlabSpringApiExtractClientService.ExtractResponse extractResponse) {
        ProjectEntity project = binding.getProject();
        YaadeProjectBindingSummary projectBinding = yaadeProjectSyncService.ensureProjectBinding(project).summary();
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        YaadeClientService.YaadeRemoteCollection collection = yaadeClientService.findCollectionById(adminSession, projectBinding.yaadeCollectionId());
        List<YaadeClientService.YaadeRemoteRequest> existingRequests = yaadeClientService.listCollectionRequests(collection);
        Map<String, YaadeClientService.YaadeRemoteRequest> generatedByKey = new LinkedHashMap<>();
        List<YaadeClientService.YaadeRemoteRequest> generatedRequests = new ArrayList<>();
        List<String> warnings = new ArrayList<>(extractResponse.warnings() == null ? List.of() : extractResponse.warnings());
        for (YaadeClientService.YaadeRemoteRequest request : existingRequests) {
            if (!isGeneratedFor(request, binding.getId(), branch)) {
                continue;
            }
            generatedRequests.add(request);
            String key = requestKey(request);
            if (key.isBlank()) {
                warnings.add("发现缺少 method/path 标记的历史生成请求，已保留：" + request.id());
                continue;
            }
            if (generatedByKey.containsKey(key)) {
                warnings.add("发现重复的历史生成请求，已保留第一条：" + key);
                continue;
            }
            generatedByKey.put(key, request);
        }

        SyncCounters counters = new SyncCounters(warnings);
        LinkedHashSet<String> currentKeys = new LinkedHashSet<>();
        int baseRank = nextGeneratedRank(existingRequests, binding.getId(), branch);
        List<GitlabSpringApiExtractClientService.ExtractedEndpoint> endpoints = extractResponse.endpoints() == null
                ? List.of()
                : extractResponse.endpoints();
        int order = 0;
        for (GitlabSpringApiExtractClientService.ExtractedEndpoint endpoint : endpoints) {
            String key = endpointKey(endpoint);
            if (!currentKeys.add(key)) {
                counters.skippedCount++;
                counters.warnings.add("接口重复，已跳过：" + key);
                continue;
            }
            ObjectNode data = buildYaadeRequestData(binding, branch, endpoint, baseRank + order);
            order++;
            YaadeClientService.YaadeRemoteRequest existing = generatedByKey.get(key);
            if (existing == null) {
                yaadeClientService.createRestRequest(adminSession, collection.id(), data);
                counters.createdCount++;
                continue;
            }
            if (jsonEquals(existing.data(), data)) {
                counters.skippedCount++;
                continue;
            }
            yaadeClientService.updateRequest(adminSession, existing.withData(data));
            counters.updatedCount++;
        }

        for (YaadeClientService.YaadeRemoteRequest generatedRequest : generatedRequests) {
            String key = requestKey(generatedRequest);
            if (!key.isBlank() && !currentKeys.contains(key)) {
                yaadeClientService.deleteRequest(adminSession, generatedRequest.id());
                counters.deletedCount++;
            }
        }
        return counters;
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

    private int nextGeneratedRank(List<YaadeClientService.YaadeRemoteRequest> existingRequests, Long bindingId, String branch) {
        return existingRequests.stream()
                .filter(request -> !isGeneratedFor(request, bindingId, branch))
                .map(request -> request.data().path("rank"))
                .filter(JsonNode::isNumber)
                .map(JsonNode::asInt)
                .max(Comparator.naturalOrder())
                .orElse(-1) + 1;
    }

    private boolean isGeneratedFor(YaadeClientService.YaadeRemoteRequest request, Long bindingId, String branch) {
        JsonNode marker = request.data().path("aiclubSync");
        return SYNC_SOURCE.equals(marker.path("source").asText(""))
                && String.valueOf(bindingId).equals(marker.path("bindingId").asText(""))
                && Objects.equals(branch, marker.path("branch").asText(""));
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
