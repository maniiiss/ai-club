package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectApiDebugRecordEntity;
import com.aiclub.platform.domain.model.ProjectApiEndpointEntity;
import com.aiclub.platform.domain.model.ProjectApiEnvironmentEntity;
import com.aiclub.platform.domain.model.ProjectApiFolderEntity;
import com.aiclub.platform.domain.model.ProjectApiProfileEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectApiDebugConfigSummary;
import com.aiclub.platform.dto.ProjectApiDebugRecordSummary;
import com.aiclub.platform.dto.ProjectApiDebugRequestSnapshotSummary;
import com.aiclub.platform.dto.ProjectApiDebugResponseSnapshotSummary;
import com.aiclub.platform.dto.ProjectApiEndpointDetail;
import com.aiclub.platform.dto.ProjectApiEndpointSummary;
import com.aiclub.platform.dto.ProjectApiEnvironmentAuthConfigSummary;
import com.aiclub.platform.dto.ProjectApiEnvironmentSummary;
import com.aiclub.platform.dto.ProjectApiExportDocument;
import com.aiclub.platform.dto.ProjectApiFolderSummary;
import com.aiclub.platform.dto.ProjectApiFolderTreeNodeSummary;
import com.aiclub.platform.dto.ProjectApiImportResult;
import com.aiclub.platform.dto.ProjectApiKeyValueSummary;
import com.aiclub.platform.dto.ProjectApiParameterSummary;
import com.aiclub.platform.dto.ProjectApiProfileSummary;
import com.aiclub.platform.dto.ProjectApiResponseExampleSummary;
import com.aiclub.platform.dto.ProjectApiTreeSummary;
import com.aiclub.platform.dto.request.ProjectApiDebugExecuteRequest;
import com.aiclub.platform.dto.request.ProjectApiDebugConfigRequest;
import com.aiclub.platform.dto.request.ProjectApiEndpointRequest;
import com.aiclub.platform.dto.request.ProjectApiEnvironmentAuthConfigRequest;
import com.aiclub.platform.dto.request.ProjectApiEnvironmentRequest;
import com.aiclub.platform.dto.request.ProjectApiFolderRequest;
import com.aiclub.platform.dto.request.ProjectApiImportRequest;
import com.aiclub.platform.dto.request.ProjectApiKeyValueItemRequest;
import com.aiclub.platform.dto.request.ProjectApiParameterItemRequest;
import com.aiclub.platform.dto.request.ProjectApiProfileRequest;
import com.aiclub.platform.dto.request.ProjectApiResponseExampleRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.ProjectApiDebugRecordRepository;
import com.aiclub.platform.repository.ProjectApiEndpointRepository;
import com.aiclub.platform.repository.ProjectApiEnvironmentRepository;
import com.aiclub.platform.repository.ProjectApiFolderRepository;
import com.aiclub.platform.repository.ProjectApiProfileRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 项目级 API 管理服务，统一承接文档、环境、OpenAPI 导入导出和后端代理调试。
 */
@Service
@Transactional(readOnly = true)
public class ProjectApiManagementService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Set<String> HTTP_METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS");
    private static final Set<String> SUPPORTED_REQUEST_CONTENT_TYPES = Set.of(
            "none",
            "application/json",
            "application/x-www-form-urlencoded",
            "multipart/form-data",
            "text/plain"
    );
    private static final Set<String> SENSITIVE_FIELD_NAMES = Set.of(
            "authorization",
            "api-key",
            "apikey",
            "cookie",
            "set-cookie",
            "password",
            "token",
            "secret"
    );
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*}}");
    private static final Pattern OPENAPI_SERVER_VARIABLE_PATTERN = Pattern.compile("\\{([a-zA-Z0-9_.-]+)}");

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final ProjectApiProfileRepository profileRepository;
    private final ProjectApiFolderRepository folderRepository;
    private final ProjectApiEndpointRepository endpointRepository;
    private final ProjectApiEnvironmentRepository environmentRepository;
    private final ProjectApiDebugRecordRepository debugRecordRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ObjectMapper objectMapper;
    private final ObjectMapper yamlMapper;
    private final HttpClient httpClient;

    public ProjectApiManagementService(ProjectRepository projectRepository,
                                       UserRepository userRepository,
                                       ProjectApiProfileRepository profileRepository,
                                       ProjectApiFolderRepository folderRepository,
                                       ProjectApiEndpointRepository endpointRepository,
                                       ProjectApiEnvironmentRepository environmentRepository,
                                       ProjectApiDebugRecordRepository debugRecordRepository,
                                       ProjectDataPermissionService projectDataPermissionService,
                                       ObjectMapper objectMapper) {
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.folderRepository = folderRepository;
        this.endpointRepository = endpointRepository;
        this.environmentRepository = environmentRepository;
        this.debugRecordRepository = debugRecordRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.objectMapper = objectMapper;
        this.yamlMapper = new ObjectMapper(new YAMLFactory());
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    /**
     * 返回项目级 API 文档概览；未初始化时按项目名给出默认视图。
     */
    public ProjectApiProfileSummary getProfile(Long projectId) {
        ProjectEntity project = requireProjectVisibleIfPresent(projectId);
        return findProfileByScope(projectId)
                .map(this::toProfileSummary)
                .orElseGet(() -> new ProjectApiProfileSummary(
                        projectId,
                        defaultProfileTitle(project),
                        "",
                        "1.0.0"
                ));
    }

    /**
     * 更新项目级 API 文档元信息。
     */
    @Transactional
    public ProjectApiProfileSummary updateProfile(Long projectId, ProjectApiProfileRequest request) {
        ProjectEntity project = requireProjectEditableIfPresent(projectId);
        ProjectApiProfileEntity entity = findProfileByScope(projectId)
                .orElseGet(() -> {
                    ProjectApiProfileEntity created = new ProjectApiProfileEntity();
                    created.setProject(project);
                    return created;
                });
        entity.setTitle(defaultString(request.title()).trim());
        entity.setDescription(trimToEmpty(request.description()));
        entity.setVersion(defaultString(request.version()).trim());
        return toProfileSummary(profileRepository.save(entity));
    }

    /**
     * 读取目录树与根层接口列表。
     */
    public ProjectApiTreeSummary getTree(Long projectId) {
        requireProjectVisibleIfPresent(projectId);
        List<ProjectApiFolderEntity> folders = listFoldersByScope(projectId);
        List<ProjectApiEndpointEntity> endpoints = listEndpointsByScope(projectId);
        return buildTreeSummary(folders, endpoints);
    }

    /**
     * 创建目录。
     */
    @Transactional
    public ProjectApiFolderSummary createFolder(Long projectId, ProjectApiFolderRequest request) {
        ProjectEntity project = requireProjectEditableIfPresent(projectId);
        ProjectApiFolderEntity entity = new ProjectApiFolderEntity();
        entity.setProject(project);
        entity.setParentFolder(resolveFolder(projectId, request.parentFolderId()).orElse(null));
        entity.setName(defaultString(request.name()).trim());
        entity.setSortOrder(defaultInteger(request.sortOrder(), 0));
        return toFolderSummary(folderRepository.save(entity));
    }

    /**
     * 更新目录。
     */
    @Transactional
    public ProjectApiFolderSummary updateFolder(Long projectId, Long folderId, ProjectApiFolderRequest request) {
        requireProjectEditableIfPresent(projectId);
        ProjectApiFolderEntity entity = requireFolder(projectId, folderId);
        ProjectApiFolderEntity parentFolder = resolveFolder(projectId, request.parentFolderId()).orElse(null);
        validateFolderParent(entity, parentFolder);
        entity.setParentFolder(parentFolder);
        entity.setName(defaultString(request.name()).trim());
        entity.setSortOrder(defaultInteger(request.sortOrder(), entity.getSortOrder()));
        return toFolderSummary(folderRepository.save(entity));
    }

    /**
     * 删除空目录，防止误删仍有内容的目录树。
     */
    @Transactional
    public void deleteFolder(Long projectId, Long folderId) {
        requireProjectEditableIfPresent(projectId);
        ProjectApiFolderEntity folder = requireFolder(projectId, folderId);
        boolean hasChildren = listFoldersByScope(projectId).stream()
                .anyMatch(item -> item.getParentFolder() != null && Objects.equals(item.getParentFolder().getId(), folderId));
        if (hasChildren) {
            throw new IllegalArgumentException("当前目录下仍有子目录，不能直接删除");
        }
        boolean hasEndpoints = listEndpointsByScope(projectId).stream()
                .anyMatch(item -> item.getFolder() != null && Objects.equals(item.getFolder().getId(), folderId));
        if (hasEndpoints) {
            throw new IllegalArgumentException("当前目录下仍有接口，不能直接删除");
        }
        folderRepository.delete(folder);
    }

    /**
     * 读取接口详情。
     */
    public ProjectApiEndpointDetail getEndpoint(Long projectId, Long endpointId) {
        requireProjectVisibleIfPresent(projectId);
        return toEndpointDetail(requireEndpoint(projectId, endpointId));
    }

    /**
     * 创建接口。
     */
    @Transactional
    public ProjectApiEndpointDetail createEndpoint(Long projectId, ProjectApiEndpointRequest request) {
        ProjectEntity project = requireProjectEditableIfPresent(projectId);
        ProjectApiEndpointEntity entity = new ProjectApiEndpointEntity();
        entity.setProject(project);
        applyEndpointRequest(projectId, entity, request);
        return toEndpointDetail(endpointRepository.save(entity));
    }

    /**
     * 更新接口。
     */
    @Transactional
    public ProjectApiEndpointDetail updateEndpoint(Long projectId, Long endpointId, ProjectApiEndpointRequest request) {
        requireProjectEditableIfPresent(projectId);
        ProjectApiEndpointEntity entity = requireEndpoint(projectId, endpointId);
        applyEndpointRequest(projectId, entity, request);
        return toEndpointDetail(endpointRepository.save(entity));
    }

    /**
     * 删除接口定义。
     */
    @Transactional
    public void deleteEndpoint(Long projectId, Long endpointId) {
        requireProjectEditableIfPresent(projectId);
        endpointRepository.delete(requireEndpoint(projectId, endpointId));
    }

    /**
     * 读取项目环境列表。
     */
    public List<ProjectApiEnvironmentSummary> listEnvironments(Long projectId) {
        requireProjectVisibleIfPresent(projectId);
        return listEnvironmentsByScope(projectId).stream()
                .map(this::toEnvironmentSummary)
                .toList();
    }

    /**
     * 创建项目环境。
     */
    @Transactional
    public ProjectApiEnvironmentSummary createEnvironment(Long projectId, ProjectApiEnvironmentRequest request) {
        ProjectEntity project = requireProjectEditableIfPresent(projectId);
        ProjectApiEnvironmentEntity entity = new ProjectApiEnvironmentEntity();
        entity.setProject(project);
        applyEnvironmentRequest(projectId, entity, request);
        ProjectApiEnvironmentEntity saved = environmentRepository.save(entity);
        normalizeDefaultEnvironment(projectId, saved);
        return toEnvironmentSummary(saved);
    }

    /**
     * 更新项目环境。
     */
    @Transactional
    public ProjectApiEnvironmentSummary updateEnvironment(Long projectId, Long environmentId, ProjectApiEnvironmentRequest request) {
        requireProjectEditableIfPresent(projectId);
        ProjectApiEnvironmentEntity entity = requireEnvironment(projectId, environmentId);
        applyEnvironmentRequest(projectId, entity, request);
        ProjectApiEnvironmentEntity saved = environmentRepository.save(entity);
        normalizeDefaultEnvironment(projectId, saved);
        return toEnvironmentSummary(saved);
    }

    /**
     * 删除项目环境；若删除的是默认环境，会自动提升下一条记录为默认环境。
     */
    @Transactional
    public void deleteEnvironment(Long projectId, Long environmentId) {
        requireProjectEditableIfPresent(projectId);
        ProjectApiEnvironmentEntity environment = requireEnvironment(projectId, environmentId);
        boolean deletingDefault = Boolean.TRUE.equals(environment.getIsDefault());
        environmentRepository.delete(environment);
        if (deletingDefault) {
            listEnvironmentsByScope(projectId).stream().findFirst().ifPresent(next -> {
                next.setIsDefault(Boolean.TRUE);
                environmentRepository.save(next);
            });
        }
    }

    /**
     * 从 OpenAPI 文档导入接口、目录和环境，当前实现按“同项目同 method+path”做增量更新。
     */
    @Transactional
    public ProjectApiImportResult importOpenApi(Long projectId, ProjectApiImportRequest request) {
        ProjectEntity project = requireProjectEditableIfPresent(projectId);
        JsonNode root = parseOpenApi(request.format(), request.content());
        validateOpenApiRoot(root);

        upsertProfileFromOpenApi(projectId, project, root.path("info"));

        List<ProjectApiFolderEntity> folders = listFoldersByScope(projectId);
        List<ProjectApiEnvironmentEntity> environments = listEnvironmentsByScope(projectId);
        List<ProjectApiEndpointEntity> endpoints = listEndpointsByScope(projectId);

        Map<String, ProjectApiFolderEntity> rootFolderByName = new LinkedHashMap<>();
        for (ProjectApiFolderEntity folder : folders) {
            if (folder.getParentFolder() == null) {
                rootFolderByName.putIfAbsent(folder.getName(), folder);
            }
        }
        Map<String, ProjectApiEndpointEntity> endpointByMethodPath = new LinkedHashMap<>();
        for (ProjectApiEndpointEntity endpoint : endpoints) {
            endpointByMethodPath.put(endpointKey(endpoint.getMethod(), endpoint.getPath()), endpoint);
        }
        Map<String, ProjectApiEnvironmentEntity> environmentByName = new LinkedHashMap<>();
        for (ProjectApiEnvironmentEntity environment : environments) {
            environmentByName.putIfAbsent(environment.getName(), environment);
        }

        int importedEnvironmentCount = importServers(projectId, project, root.path("servers"), environmentByName);
        int importedFolderCount = 0;
        int importedEndpointCount = 0;

        JsonNode pathsNode = root.path("paths");
        if (pathsNode.isObject()) {
            var pathFields = pathsNode.fields();
            while (pathFields.hasNext()) {
                Map.Entry<String, JsonNode> pathEntry = pathFields.next();
                String apiPath = pathEntry.getKey();
                JsonNode pathNode = pathEntry.getValue();
                Map<String, JsonNode> mergedParameters = new LinkedHashMap<>();
                collectParameters(pathNode.path("parameters"), mergedParameters);

                var operationFields = pathNode.fields();
                while (operationFields.hasNext()) {
                    Map.Entry<String, JsonNode> operationEntry = operationFields.next();
                    String method = operationEntry.getKey().toUpperCase(Locale.ROOT);
                    if (!HTTP_METHODS.contains(method)) {
                        continue;
                    }
                    JsonNode operationNode = operationEntry.getValue();
                    JsonNode tagsNode = operationNode.path("tags");
                    ProjectApiFolderEntity targetFolder = null;
                    if (tagsNode.isArray() && !tagsNode.isEmpty()) {
                        String tagName = trimToNull(tagsNode.get(0).asText(""));
                        if (tagName != null) {
                            ProjectApiFolderEntity existingFolder = rootFolderByName.get(tagName);
                            if (existingFolder == null) {
                                existingFolder = new ProjectApiFolderEntity();
                                existingFolder.setProject(project);
                                existingFolder.setName(tagName);
                                existingFolder.setSortOrder(rootFolderByName.size());
                                existingFolder = folderRepository.save(existingFolder);
                                rootFolderByName.put(tagName, existingFolder);
                                importedFolderCount++;
                            }
                            targetFolder = existingFolder;
                        }
                    }

                    Map<String, JsonNode> parameterMap = new LinkedHashMap<>(mergedParameters);
                    collectParameters(operationNode.path("parameters"), parameterMap);

                    ProjectApiEndpointEntity endpoint = endpointByMethodPath.get(endpointKey(method, apiPath));
                    if (endpoint == null) {
                        endpoint = new ProjectApiEndpointEntity();
                        endpoint.setProject(project);
                        importedEndpointCount++;
                    }
                    endpoint.setFolder(targetFolder);
                    endpoint.setName(resolveEndpointName(operationNode, method, apiPath));
                    endpoint.setMethod(method);
                    endpoint.setPath(apiPath);
                    endpoint.setSummary(trimToEmpty(operationNode.path("summary").asText("")));
                    endpoint.setDescriptionMarkdown(trimToEmpty(operationNode.path("description").asText("")));

                    endpoint.setPathParamsJson(writeJsonText(readOpenApiParameters(parameterMap, "path")));
                    endpoint.setQueryParamsJson(writeJsonText(readOpenApiParameters(parameterMap, "query")));
                    endpoint.setHeaderParamsJson(writeJsonText(readOpenApiParameters(parameterMap, "header")));

                    RequestBodyImportResult requestBody = readOpenApiRequestBody(operationNode.path("requestBody"));
                    endpoint.setRequestContentType(requestBody.contentType());
                    endpoint.setBodyExampleText(requestBody.bodyExampleText());
                    endpoint.setResponseExamplesJson(writeJsonText(readOpenApiResponses(operationNode.path("responses"))));
                    endpoint.setDebugConfigJson("{}");

                    ProjectApiEndpointEntity saved = endpointRepository.save(endpoint);
                    endpointByMethodPath.put(endpointKey(saved.getMethod(), saved.getPath()), saved);
                }
            }
        }
        ensureSingleDefaultEnvironment(projectId);
        return new ProjectApiImportResult(importedFolderCount, importedEndpointCount, importedEnvironmentCount);
    }

    /**
     * 按当前项目全部接口导出 OpenAPI 3.0.3 文档。
     */
    public ProjectApiExportDocument exportOpenApi(Long projectId, String format) {
        ProjectEntity project = requireProjectVisibleIfPresent(projectId);
        ProjectApiProfileSummary profile = getProfile(projectId);
        List<ProjectApiFolderEntity> folders = listFoldersByScope(projectId);
        List<ProjectApiEndpointEntity> endpoints = listEndpointsByScope(projectId);
        List<ProjectApiEnvironmentEntity> environments = listEnvironmentsByScope(projectId);

        ObjectNode root = objectMapper.createObjectNode();
        root.put("openapi", "3.0.3");

        ObjectNode info = root.putObject("info");
        info.put("title", defaultString(profile.title()));
        if (hasText(profile.description())) {
            info.put("description", profile.description());
        }
        info.put("version", defaultString(profile.version()));

        ArrayNode serversNode = root.putArray("servers");
        for (ProjectApiEnvironmentEntity environment : environments) {
            ObjectNode serverNode = serversNode.addObject();
            serverNode.put("url", toOpenApiServerUrl(environment.getBaseUrl()));
            serverNode.put("description", environment.getName());
            ObjectNode variablesNode = serverNode.putObject("variables");
            parseStringMap(environment.getVariablesJson()).forEach((name, value) -> {
                ObjectNode variableNode = variablesNode.putObject(name);
                variableNode.put("default", value);
            });
        }

        ArrayNode tagsNode = root.putArray("tags");
        Set<String> tagNames = new LinkedHashSet<>();
        Map<Long, ProjectApiFolderEntity> folderById = new LinkedHashMap<>();
        for (ProjectApiFolderEntity folder : folders) {
            folderById.put(folder.getId(), folder);
            tagNames.add(buildFolderTag(folder, folderById));
        }
        for (String tagName : tagNames) {
            ObjectNode tagNode = tagsNode.addObject();
            tagNode.put("name", tagName);
        }

        ObjectNode pathsNode = root.putObject("paths");
        for (ProjectApiEndpointEntity endpoint : endpoints) {
            ObjectNode pathNode = (ObjectNode) pathsNode.get(endpoint.getPath());
            if (pathNode == null) {
                pathNode = pathsNode.putObject(endpoint.getPath());
            }
            ObjectNode operationNode = pathNode.putObject(endpoint.getMethod().toLowerCase(Locale.ROOT));
            if (endpoint.getFolder() != null) {
                ArrayNode endpointTags = operationNode.putArray("tags");
                endpointTags.add(buildFolderTag(endpoint.getFolder(), folderById));
            }
            if (hasText(endpoint.getSummary())) {
                operationNode.put("summary", endpoint.getSummary());
            }
            if (hasText(endpoint.getDescriptionMarkdown())) {
                operationNode.put("description", endpoint.getDescriptionMarkdown());
            }
            ArrayNode parametersNode = operationNode.putArray("parameters");
            appendParameters(parametersNode, parseParameters(endpoint.getPathParamsJson()), "path");
            appendParameters(parametersNode, parseParameters(endpoint.getQueryParamsJson()), "query");
            appendParameters(parametersNode, parseParameters(endpoint.getHeaderParamsJson()), "header");

            if (!"none".equalsIgnoreCase(endpoint.getRequestContentType()) && hasText(endpoint.getBodyExampleText())) {
                ObjectNode requestBody = operationNode.putObject("requestBody");
                requestBody.put("required", true);
                ObjectNode content = requestBody.putObject("content");
                ObjectNode mediaType = content.putObject(endpoint.getRequestContentType());
                mediaType.set("schema", defaultSchemaForContentType(endpoint.getRequestContentType()));
                JsonNode exampleNode = parseExampleNode(endpoint.getRequestContentType(), endpoint.getBodyExampleText());
                if (exampleNode != null) {
                    mediaType.set("example", exampleNode);
                }
            }

            ObjectNode responsesNode = operationNode.putObject("responses");
            List<ProjectApiResponseExampleSummary> responseExamples = parseResponseExamples(endpoint.getResponseExamplesJson());
            if (responseExamples.isEmpty()) {
                responsesNode.putObject("200").put("description", "成功");
            } else {
                for (ProjectApiResponseExampleSummary example : responseExamples) {
                    ObjectNode responseNode = responsesNode.putObject(String.valueOf(example.statusCode()));
                    responseNode.put("description", hasText(example.description()) ? example.description() : defaultString(example.name(), "响应"));
                    if (example.headers() != null && !example.headers().isEmpty()) {
                        ObjectNode headersNode = responseNode.putObject("headers");
                        for (ProjectApiKeyValueSummary header : example.headers()) {
                            if (!hasText(header.name())) {
                                continue;
                            }
                            ObjectNode headerNode = headersNode.putObject(header.name());
                            headerNode.putObject("schema").put("type", "string");
                            if (hasText(header.value())) {
                                headerNode.put("example", header.value());
                            }
                        }
                    }
                    if (hasText(example.contentType()) || hasText(example.bodyExample())) {
                        String responseContentType = hasText(example.contentType()) ? example.contentType() : "application/json";
                        ObjectNode contentNode = responseNode.putObject("content");
                        ObjectNode mediaTypeNode = contentNode.putObject(responseContentType);
                        mediaTypeNode.set("schema", defaultSchemaForContentType(responseContentType));
                        JsonNode bodyNode = parseExampleNode(responseContentType, example.bodyExample());
                        if (bodyNode != null) {
                            mediaTypeNode.set("example", bodyNode);
                        }
                    }
                }
            }
        }

        String normalizedFormat = normalizeExportFormat(format);
        String content = "yaml".equals(normalizedFormat) ? writeYamlText(root) : writeJsonText(root);
        String fileName = sanitizeFileName(project == null ? "unbound-api" : project.getName()) + "-openapi." + normalizedFormat;
        return new ProjectApiExportDocument(fileName, normalizedFormat, content);
    }

    /**
     * 返回最近 20 条调试记录，可按接口过滤。
     */
    public List<ProjectApiDebugRecordSummary> listDebugRecords(Long projectId, Long endpointId) {
        requireProjectVisibleIfPresent(projectId);
        List<ProjectApiDebugRecordEntity> records = endpointId == null
                ? listDebugRecordsByScope(projectId)
                : listDebugRecordsByScope(projectId, endpointId);
        return records.stream().map(this::toDebugRecordSummary).toList();
    }

    /**
     * 通过后端代理发起真实 HTTP 调试，并沉淀脱敏后的请求响应快照。
     */
    @Transactional
    public ProjectApiDebugRecordSummary executeDebug(Long projectId, Long endpointId, ProjectApiDebugExecuteRequest request) {
        requireProjectEditableIfPresent(projectId);
        ProjectApiEndpointEntity endpoint = requireEndpoint(projectId, endpointId);
        ProjectApiEnvironmentEntity environment = resolveDebugEnvironment(projectId, endpoint, request.environmentId()).orElse(null);
        UserEntity currentUser = requireCurrentUserEntity();

        DebugExecutionPayload payload = buildDebugExecutionPayload(endpoint, environment, request);
        long startedAt = System.nanoTime();
        ProjectApiDebugRecordEntity record = new ProjectApiDebugRecordEntity();
        record.setProject(endpoint.getProject());
        record.setEndpoint(endpoint);
        record.setEnvironment(environment);
        record.setCreatorUser(currentUser);

        try {
            HttpRequest httpRequest = buildHttpRequest(payload);
            HttpResponse<byte[]> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofByteArray());
            long durationMillis = (System.nanoTime() - startedAt) / 1_000_000L;

            DebugResponseSnapshot responseSnapshot = buildResponseSnapshot(response);
            record.setDurationMillis(durationMillis);
            record.setSuccess(response.statusCode() >= 200 && response.statusCode() < 300);
            record.setErrorMessage(record.getSuccess() ? "" : "HTTP " + response.statusCode());
            record.setRequestSnapshotJson(writeJsonText(payload.requestSnapshot()));
            record.setResponseSnapshotJson(writeJsonText(responseSnapshot.snapshot()));

            return toDebugRecordSummary(debugRecordRepository.save(record));
        } catch (IOException exception) {
            return persistDebugFailure(record, payload.requestSnapshot(), startedAt, "请求执行失败：" + defaultString(exception.getMessage(), "IO 错误"));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return persistDebugFailure(record, payload.requestSnapshot(), startedAt, "请求执行被中断");
        } catch (RuntimeException exception) {
            return persistDebugFailure(record, payload.requestSnapshot(), startedAt, defaultString(exception.getMessage(), "调试执行失败"));
        }
    }

    private ProjectApiDebugRecordSummary persistDebugFailure(ProjectApiDebugRecordEntity record,
                                                             ProjectApiDebugRequestSnapshotSummary requestSnapshot,
                                                             long startedAt,
                                                             String message) {
        record.setDurationMillis((System.nanoTime() - startedAt) / 1_000_000L);
        record.setSuccess(Boolean.FALSE);
        record.setErrorMessage(message);
        record.setRequestSnapshotJson(writeJsonText(requestSnapshot));
        record.setResponseSnapshotJson(writeJsonText(new ProjectApiDebugResponseSnapshotSummary(
                null,
                "",
                List.of(),
                Boolean.FALSE,
                0L,
                "",
                ""
        )));
        return toDebugRecordSummary(debugRecordRepository.save(record));
    }

    private void applyEndpointRequest(Long projectId, ProjectApiEndpointEntity entity, ProjectApiEndpointRequest request) {
        entity.setFolder(resolveFolder(projectId, request.folderId()).orElse(null));
        entity.setName(defaultString(request.name()).trim());
        entity.setMethod(normalizeMethod(request.method()));
        entity.setPath(normalizePath(request.path()));
        entity.setSummary(trimToEmpty(request.summary()));
        entity.setDescriptionMarkdown(trimToEmpty(request.descriptionMarkdown()));
        entity.setRequestContentType(normalizeRequestContentType(request.requestContentType()));
        entity.setPathParamsJson(writeJsonText(toParameterSummaries(request.pathParams())));
        entity.setQueryParamsJson(writeJsonText(toParameterSummaries(request.queryParams())));
        entity.setHeaderParamsJson(writeJsonText(toParameterSummaries(request.headerParams())));
        entity.setBodyExampleText(trimToEmpty(request.bodyExampleText()));
        entity.setResponseExamplesJson(writeJsonText(toResponseExampleSummaries(request.responseExamples())));
        entity.setDebugConfigJson(writeJsonText(toDebugConfigSummary(request.debugConfig())));
    }

    private void applyEnvironmentRequest(Long projectId, ProjectApiEnvironmentEntity entity, ProjectApiEnvironmentRequest request) {
        entity.setName(defaultString(request.name()).trim());
        entity.setBaseUrl(trimToEmpty(request.baseUrl()));
        entity.setVariablesJson(writeJsonText(normalizeStringMap(request.variables())));
        entity.setAuthType(normalizeAuthType(request.authType()));
        entity.setAuthConfigJson(writeJsonText(toEnvironmentAuthConfigSummary(request.authConfig())));
        entity.setIsDefault(Boolean.TRUE.equals(request.isDefault()));
        if (!entity.getBaseUrl().startsWith("http://") && !entity.getBaseUrl().startsWith("https://")) {
            throw new IllegalArgumentException("基础地址必须以 http:// 或 https:// 开头");
        }
        if ("API_KEY".equals(entity.getAuthType())) {
            ProjectApiEnvironmentAuthConfigSummary authConfig = parseEnvironmentAuthConfig(entity.getAuthConfigJson());
            if (!hasText(authConfig.apiKeyName()) || !hasText(authConfig.apiKeyLocation())) {
                throw new IllegalArgumentException("API Key 鉴权必须同时配置 key 名称和位置");
            }
        }
    }

    private ProjectApiTreeSummary buildTreeSummary(List<ProjectApiFolderEntity> folders, List<ProjectApiEndpointEntity> endpoints) {
        Map<Long, List<ProjectApiFolderEntity>> childrenByParentId = new LinkedHashMap<>();
        for (ProjectApiFolderEntity folder : folders) {
            Long parentId = folder.getParentFolder() == null ? null : folder.getParentFolder().getId();
            childrenByParentId.computeIfAbsent(parentId, key -> new ArrayList<>()).add(folder);
        }
        Map<Long, List<ProjectApiEndpointSummary>> endpointsByFolderId = new LinkedHashMap<>();
        List<ProjectApiEndpointSummary> rootEndpoints = new ArrayList<>();
        for (ProjectApiEndpointEntity endpoint : endpoints) {
            ProjectApiEndpointSummary summary = toEndpointSummary(endpoint);
            if (endpoint.getFolder() == null) {
                rootEndpoints.add(summary);
            } else {
                endpointsByFolderId.computeIfAbsent(endpoint.getFolder().getId(), key -> new ArrayList<>()).add(summary);
            }
        }
        List<ProjectApiFolderTreeNodeSummary> roots = buildFolderNodes(childrenByParentId, endpointsByFolderId, null);
        return new ProjectApiTreeSummary(roots, rootEndpoints);
    }

    private List<ProjectApiFolderTreeNodeSummary> buildFolderNodes(Map<Long, List<ProjectApiFolderEntity>> childrenByParentId,
                                                                   Map<Long, List<ProjectApiEndpointSummary>> endpointsByFolderId,
                                                                   Long parentId) {
        List<ProjectApiFolderEntity> children = new ArrayList<>(childrenByParentId.getOrDefault(parentId, List.of()));
        children.sort(Comparator.comparing(ProjectApiFolderEntity::getSortOrder).thenComparing(ProjectApiFolderEntity::getId));
        List<ProjectApiFolderTreeNodeSummary> results = new ArrayList<>();
        for (ProjectApiFolderEntity child : children) {
            results.add(new ProjectApiFolderTreeNodeSummary(
                    child.getId(),
                    child.getName(),
                    child.getSortOrder(),
                    buildFolderNodes(childrenByParentId, endpointsByFolderId, child.getId()),
                    endpointsByFolderId.getOrDefault(child.getId(), List.of())
            ));
        }
        return results;
    }

    private ProjectApiProfileSummary toProfileSummary(ProjectApiProfileEntity entity) {
        return new ProjectApiProfileSummary(
                entity.getProject() == null ? null : entity.getProject().getId(),
                entity.getTitle(),
                entity.getDescription(),
                entity.getVersion()
        );
    }

    private ProjectApiFolderSummary toFolderSummary(ProjectApiFolderEntity entity) {
        return new ProjectApiFolderSummary(
                entity.getId(),
                entity.getProject() == null ? null : entity.getProject().getId(),
                entity.getParentFolder() == null ? null : entity.getParentFolder().getId(),
                entity.getName(),
                entity.getSortOrder(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt())
        );
    }

    private ProjectApiEndpointSummary toEndpointSummary(ProjectApiEndpointEntity entity) {
        return new ProjectApiEndpointSummary(
                entity.getId(),
                entity.getFolder() == null ? null : entity.getFolder().getId(),
                entity.getName(),
                entity.getMethod(),
                entity.getPath(),
                entity.getSummary()
        );
    }

    private ProjectApiEndpointDetail toEndpointDetail(ProjectApiEndpointEntity entity) {
        return new ProjectApiEndpointDetail(
                entity.getId(),
                entity.getProject() == null ? null : entity.getProject().getId(),
                entity.getFolder() == null ? null : entity.getFolder().getId(),
                entity.getName(),
                entity.getMethod(),
                entity.getPath(),
                entity.getSummary(),
                entity.getDescriptionMarkdown(),
                entity.getRequestContentType(),
                parseParameters(entity.getPathParamsJson()),
                parseParameters(entity.getQueryParamsJson()),
                parseParameters(entity.getHeaderParamsJson()),
                entity.getBodyExampleText(),
                parseResponseExamples(entity.getResponseExamplesJson()),
                parseDebugConfig(entity.getDebugConfigJson()),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt())
        );
    }

    private ProjectApiEnvironmentSummary toEnvironmentSummary(ProjectApiEnvironmentEntity entity) {
        return new ProjectApiEnvironmentSummary(
                entity.getId(),
                entity.getProject() == null ? null : entity.getProject().getId(),
                entity.getName(),
                entity.getBaseUrl(),
                parseStringMap(entity.getVariablesJson()),
                entity.getAuthType(),
                parseEnvironmentAuthConfig(entity.getAuthConfigJson()),
                entity.getIsDefault(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt())
        );
    }

    private ProjectApiDebugRecordSummary toDebugRecordSummary(ProjectApiDebugRecordEntity entity) {
        return new ProjectApiDebugRecordSummary(
                entity.getId(),
                entity.getEndpoint() == null ? null : entity.getEndpoint().getId(),
                entity.getEndpoint() == null ? "" : entity.getEndpoint().getName(),
                entity.getEnvironment() == null ? null : entity.getEnvironment().getId(),
                entity.getEnvironment() == null ? "" : entity.getEnvironment().getName(),
                entity.getSuccess(),
                entity.getErrorMessage(),
                entity.getDurationMillis(),
                readValue(entity.getRequestSnapshotJson(), ProjectApiDebugRequestSnapshotSummary.class, new ProjectApiDebugRequestSnapshotSummary("", "", "", List.of(), "")),
                readValue(entity.getResponseSnapshotJson(), ProjectApiDebugResponseSnapshotSummary.class, new ProjectApiDebugResponseSnapshotSummary(null, "", List.of(), Boolean.FALSE, 0L, "", "")),
                entity.getCreatorUser() == null ? "" : defaultString(entity.getCreatorUser().getNickname(), entity.getCreatorUser().getUsername()),
                formatTime(entity.getCreatedAt())
        );
    }

    private ProjectApiDebugConfigSummary toDebugConfigSummary(ProjectApiDebugConfigRequest request) {
        if (request == null) {
            return new ProjectApiDebugConfigSummary(null);
        }
        return new ProjectApiDebugConfigSummary(request.defaultEnvironmentId());
    }

    private ProjectApiEnvironmentAuthConfigSummary toEnvironmentAuthConfigSummary(ProjectApiEnvironmentAuthConfigRequest request) {
        if (request == null) {
            return new ProjectApiEnvironmentAuthConfigSummary("", "", "", "", "", "");
        }
        return new ProjectApiEnvironmentAuthConfigSummary(
                trimToEmpty(request.token()),
                trimToEmpty(request.username()),
                trimToEmpty(request.password()),
                trimToEmpty(request.apiKeyName()),
                trimToEmpty(request.apiKeyValue()),
                trimToEmpty(request.apiKeyLocation())
        );
    }

    private List<ProjectApiParameterSummary> toParameterSummaries(List<ProjectApiParameterItemRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }
        List<ProjectApiParameterSummary> results = new ArrayList<>();
        for (ProjectApiParameterItemRequest request : requests) {
            if (request == null || !hasText(request.name())) {
                continue;
            }
            results.add(new ProjectApiParameterSummary(
                    request.name().trim(),
                    Boolean.TRUE.equals(request.required()),
                    defaultString(request.type(), "string"),
                    trimToEmpty(request.example()),
                    trimToEmpty(request.description())
            ));
        }
        return results;
    }

    private List<ProjectApiResponseExampleSummary> toResponseExampleSummaries(List<ProjectApiResponseExampleRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }
        List<ProjectApiResponseExampleSummary> results = new ArrayList<>();
        for (ProjectApiResponseExampleRequest request : requests) {
            if (request == null || request.statusCode() == null) {
                continue;
            }
            results.add(new ProjectApiResponseExampleSummary(
                    trimToEmpty(request.name()),
                    request.statusCode(),
                    defaultString(request.contentType(), "application/json"),
                    toKeyValueSummaries(request.headers()),
                    trimToEmpty(request.bodyExample()),
                    trimToEmpty(request.description())
            ));
        }
        return results;
    }

    private List<ProjectApiKeyValueSummary> toKeyValueSummaries(List<ProjectApiKeyValueItemRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }
        List<ProjectApiKeyValueSummary> results = new ArrayList<>();
        for (ProjectApiKeyValueItemRequest request : requests) {
            if (request == null || !hasText(request.name())) {
                continue;
            }
            results.add(new ProjectApiKeyValueSummary(
                    request.name().trim(),
                    trimToEmpty(request.value()),
                    request.enabled() == null ? Boolean.TRUE : request.enabled()
            ));
        }
        return results;
    }

    private List<ProjectApiParameterSummary> parseParameters(String json) {
        try {
            JsonNode node = objectMapper.readTree(defaultString(json, "[]"));
            if (!node.isArray()) {
                return List.of();
            }
            List<ProjectApiParameterSummary> results = new ArrayList<>();
            for (JsonNode item : node) {
                results.add(new ProjectApiParameterSummary(
                        item.path("name").asText(""),
                        item.path("required").asBoolean(false),
                        item.path("type").asText("string"),
                        item.path("example").asText(""),
                        item.path("description").asText("")
                ));
            }
            return results;
        } catch (JsonProcessingException exception) {
            return List.of();
        }
    }

    private List<ProjectApiResponseExampleSummary> parseResponseExamples(String json) {
        try {
            JsonNode node = objectMapper.readTree(defaultString(json, "[]"));
            if (!node.isArray()) {
                return List.of();
            }
            List<ProjectApiResponseExampleSummary> results = new ArrayList<>();
            for (JsonNode item : node) {
                List<ProjectApiKeyValueSummary> headers = new ArrayList<>();
                JsonNode headersNode = item.path("headers");
                if (headersNode.isArray()) {
                    for (JsonNode headerNode : headersNode) {
                        headers.add(new ProjectApiKeyValueSummary(
                                headerNode.path("name").asText(""),
                                headerNode.path("value").asText(""),
                                headerNode.path("enabled").asBoolean(true)
                        ));
                    }
                }
                results.add(new ProjectApiResponseExampleSummary(
                        item.path("name").asText(""),
                        item.path("statusCode").asInt(200),
                        item.path("contentType").asText("application/json"),
                        headers,
                        item.path("bodyExample").asText(""),
                        item.path("description").asText("")
                ));
            }
            return results;
        } catch (JsonProcessingException exception) {
            return List.of();
        }
    }

    private ProjectApiDebugConfigSummary parseDebugConfig(String json) {
        return readValue(json, ProjectApiDebugConfigSummary.class, new ProjectApiDebugConfigSummary(null));
    }

    private ProjectApiEnvironmentAuthConfigSummary parseEnvironmentAuthConfig(String json) {
        return readValue(json, ProjectApiEnvironmentAuthConfigSummary.class, new ProjectApiEnvironmentAuthConfigSummary("", "", "", "", "", ""));
    }

    private Map<String, String> parseStringMap(String json) {
        try {
            JsonNode node = objectMapper.readTree(defaultString(json, "{}"));
            if (!node.isObject()) {
                return Map.of();
            }
            LinkedHashMap<String, String> results = new LinkedHashMap<>();
            node.fields().forEachRemaining(entry -> results.put(entry.getKey(), entry.getValue().asText("")));
            return results;
        } catch (JsonProcessingException exception) {
            return Map.of();
        }
    }

    private void normalizeDefaultEnvironment(Long projectId, ProjectApiEnvironmentEntity target) {
        if (Boolean.TRUE.equals(target.getIsDefault())) {
            for (ProjectApiEnvironmentEntity item : listEnvironmentsByScope(projectId)) {
                if (!Objects.equals(item.getId(), target.getId()) && Boolean.TRUE.equals(item.getIsDefault())) {
                    item.setIsDefault(Boolean.FALSE);
                    environmentRepository.save(item);
                }
            }
            return;
        }
        ensureSingleDefaultEnvironment(projectId);
    }

    private void ensureSingleDefaultEnvironment(Long projectId) {
        List<ProjectApiEnvironmentEntity> environments = listEnvironmentsByScope(projectId);
        if (environments.isEmpty()) {
            return;
        }
        boolean foundDefault = false;
        for (ProjectApiEnvironmentEntity environment : environments) {
            if (Boolean.TRUE.equals(environment.getIsDefault())) {
                if (!foundDefault) {
                    foundDefault = true;
                } else {
                    environment.setIsDefault(Boolean.FALSE);
                    environmentRepository.save(environment);
                }
            }
        }
        if (!foundDefault) {
            ProjectApiEnvironmentEntity first = environments.get(0);
            first.setIsDefault(Boolean.TRUE);
            environmentRepository.save(first);
        }
    }

    private Optional<ProjectApiEnvironmentEntity> resolveDebugEnvironment(Long projectId, ProjectApiEndpointEntity endpoint, Long requestedEnvironmentId) {
        if (requestedEnvironmentId != null) {
            return Optional.of(requireEnvironment(projectId, requestedEnvironmentId));
        }
        ProjectApiDebugConfigSummary debugConfig = parseDebugConfig(endpoint.getDebugConfigJson());
        if (debugConfig.defaultEnvironmentId() != null) {
            return Optional.of(requireEnvironment(projectId, debugConfig.defaultEnvironmentId()));
        }
        return listEnvironmentsByScope(projectId).stream().findFirst();
    }

    private DebugExecutionPayload buildDebugExecutionPayload(ProjectApiEndpointEntity endpoint,
                                                            ProjectApiEnvironmentEntity environment,
                                                            ProjectApiDebugExecuteRequest request) {
        String method = normalizeMethod(defaultString(request.method(), endpoint.getMethod()));
        String path = normalizePath(defaultString(request.path(), endpoint.getPath()));
        String contentType = normalizeRequestContentType(defaultString(request.requestContentType(), endpoint.getRequestContentType()));
        Map<String, String> environmentVariables = environment == null ? Map.of() : parseStringMap(environment.getVariablesJson());

        Map<String, String> pathParams = buildParameterValueMap(parseParameters(endpoint.getPathParamsJson()), request.pathParams());
        Map<String, String> queryParams = buildParameterValueMap(parseParameters(endpoint.getQueryParamsJson()), request.queryParams());
        Map<String, String> headers = buildParameterValueMap(parseParameters(endpoint.getHeaderParamsJson()), request.headerParams());

        path = applyVariables(path, environmentVariables);
        String resolvedPath = applyPathParams(path, pathParams, environmentVariables);
        LinkedHashMap<String, String> resolvedQueryParams = applyVariablesToMap(queryParams, environmentVariables);
        LinkedHashMap<String, String> resolvedHeaders = applyVariablesToMap(headers, environmentVariables);
        String bodyText = applyVariables(hasText(request.bodyText()) ? request.bodyText() : endpoint.getBodyExampleText(), environmentVariables);

        String baseUrl = environment == null ? "" : applyVariables(environment.getBaseUrl(), environmentVariables);
        ProjectApiEnvironmentAuthConfigSummary authConfig = environment == null
                ? new ProjectApiEnvironmentAuthConfigSummary("", "", "", "", "", "")
                : parseEnvironmentAuthConfig(environment.getAuthConfigJson());
        applyAuthHeadersAndQuery(resolvedHeaders, resolvedQueryParams, environment == null ? "NONE" : environment.getAuthType(), authConfig, environmentVariables);

        String resolvedUrl = buildResolvedUrl(baseUrl, resolvedPath, resolvedQueryParams);
        if (!"none".equalsIgnoreCase(contentType) && !resolvedHeaders.containsKey("Content-Type")) {
            resolvedHeaders.put("Content-Type", "multipart/form-data".equals(contentType) ? "" : contentType);
        }
        if ("multipart/form-data".equals(contentType)) {
            MultipartPayload multipartPayload = buildMultipartPayload(bodyText);
            resolvedHeaders.put("Content-Type", "multipart/form-data; boundary=" + multipartPayload.boundary());
            return new DebugExecutionPayload(
                    method,
                    contentType,
                    resolvedUrl,
                    resolvedHeaders,
                    multipartPayload.body(),
                    buildRequestSnapshot(method, resolvedUrl, contentType, resolvedHeaders, bodyText)
            );
        }
        return new DebugExecutionPayload(
                method,
                contentType,
                resolvedUrl,
                resolvedHeaders,
                normalizeRequestBody(contentType, bodyText),
                buildRequestSnapshot(method, resolvedUrl, contentType, resolvedHeaders, bodyText)
        );
    }

    private Map<String, String> buildParameterValueMap(List<ProjectApiParameterSummary> defaults,
                                                       List<ProjectApiKeyValueItemRequest> overrides) {
        LinkedHashMap<String, String> values = new LinkedHashMap<>();
        for (ProjectApiParameterSummary item : defaults) {
            if (hasText(item.name())) {
                values.put(item.name(), trimToEmpty(item.example()));
            }
        }
        if (overrides != null) {
            for (ProjectApiKeyValueItemRequest item : overrides) {
                if (item != null && hasText(item.name()) && !Boolean.FALSE.equals(item.enabled())) {
                    values.put(item.name().trim(), trimToEmpty(item.value()));
                }
            }
        }
        return values;
    }

    private LinkedHashMap<String, String> applyVariablesToMap(Map<String, String> values, Map<String, String> variables) {
        LinkedHashMap<String, String> resolved = new LinkedHashMap<>();
        values.forEach((key, value) -> resolved.put(key, applyVariables(value, variables)));
        return resolved;
    }

    private void applyAuthHeadersAndQuery(LinkedHashMap<String, String> headers,
                                          LinkedHashMap<String, String> queryParams,
                                          String authType,
                                          ProjectApiEnvironmentAuthConfigSummary authConfig,
                                          Map<String, String> variables) {
        String normalizedAuthType = normalizeAuthType(authType);
        if ("BEARER".equals(normalizedAuthType) && hasText(authConfig.token())) {
            headers.put("Authorization", "Bearer " + applyVariables(authConfig.token(), variables));
        } else if ("BASIC".equals(normalizedAuthType) && (hasText(authConfig.username()) || hasText(authConfig.password()))) {
            String credential = applyVariables(authConfig.username(), variables) + ":" + applyVariables(authConfig.password(), variables);
            headers.put("Authorization", "Basic " + Base64.getEncoder().encodeToString(credential.getBytes(StandardCharsets.UTF_8)));
        } else if ("API_KEY".equals(normalizedAuthType) && hasText(authConfig.apiKeyName()) && hasText(authConfig.apiKeyValue())) {
            String keyName = authConfig.apiKeyName().trim();
            String keyValue = applyVariables(authConfig.apiKeyValue(), variables);
            if ("QUERY".equalsIgnoreCase(authConfig.apiKeyLocation())) {
                queryParams.put(keyName, keyValue);
            } else {
                headers.put(keyName, keyValue);
            }
        }
    }

    private HttpRequest buildHttpRequest(DebugExecutionPayload payload) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(payload.url()))
                .timeout(Duration.ofSeconds(60));
        payload.headers().forEach((name, value) -> {
            if (hasText(name) && value != null && !value.isEmpty()) {
                builder.header(name, value);
            }
        });
        String requestBody = defaultString(payload.body(), "");
        if (hasRequestBody(payload.method(), requestBody, payload.contentType())) {
            builder.method(payload.method(), HttpRequest.BodyPublishers.ofByteArray(requestBody.getBytes(StandardCharsets.UTF_8)));
        } else {
            builder.method(payload.method(), HttpRequest.BodyPublishers.noBody());
        }
        return builder.build();
    }

    private DebugResponseSnapshot buildResponseSnapshot(HttpResponse<byte[]> response) {
        String contentType = response.headers().firstValue("Content-Type").orElse("");
        boolean binary = !isTextResponse(contentType);
        List<ProjectApiKeyValueSummary> headers = response.headers().map().entrySet().stream()
                .flatMap(entry -> entry.getValue().stream().map(value -> new ProjectApiKeyValueSummary(entry.getKey(), sanitizeIfSensitive(entry.getKey(), value), Boolean.TRUE)))
                .toList();
        byte[] bodyBytes = response.body() == null ? new byte[0] : response.body();
        if (binary) {
            return new DebugResponseSnapshot(new ProjectApiDebugResponseSnapshotSummary(
                    response.statusCode(),
                    contentType,
                    headers,
                    Boolean.TRUE,
                    (long) bodyBytes.length,
                    "",
                    "二进制响应，共 " + bodyBytes.length + " 字节"
            ));
        }
        String textBody = new String(bodyBytes, StandardCharsets.UTF_8);
        return new DebugResponseSnapshot(new ProjectApiDebugResponseSnapshotSummary(
                response.statusCode(),
                contentType,
                headers,
                Boolean.FALSE,
                (long) bodyBytes.length,
                sanitizeBody(contentType, textBody),
                ""
        ));
    }

    private String normalizeRequestBody(String contentType, String bodyText) {
        if ("application/x-www-form-urlencoded".equals(contentType)) {
            return encodeFormBody(bodyText);
        }
        return defaultString(bodyText, "");
    }

    private MultipartPayload buildMultipartPayload(String bodyText) {
        String boundary = "AICLUB_BOUNDARY_" + System.currentTimeMillis();
        StringBuilder builder = new StringBuilder();
        parseObjectBody(bodyText).forEach((name, value) -> {
            builder.append("--").append(boundary).append("\r\n");
            builder.append("Content-Disposition: form-data; name=\"").append(name).append("\"\r\n\r\n");
            builder.append(value).append("\r\n");
        });
        builder.append("--").append(boundary).append("--\r\n");
        return new MultipartPayload(boundary, builder.toString());
    }

    private String encodeFormBody(String bodyText) {
        List<String> pairs = new ArrayList<>();
        parseObjectBody(bodyText).forEach((name, value) -> pairs.add(urlEncode(name) + "=" + urlEncode(value)));
        return String.join("&", pairs);
    }

    private Map<String, String> parseObjectBody(String bodyText) {
        if (!hasText(bodyText)) {
            return Map.of();
        }
        try {
            JsonNode node = objectMapper.readTree(bodyText);
            if (!node.isObject()) {
                throw new IllegalArgumentException("表单请求体示例必须是 JSON 对象");
            }
            LinkedHashMap<String, String> values = new LinkedHashMap<>();
            node.fields().forEachRemaining(entry -> values.put(entry.getKey(), entry.getValue().isTextual() ? entry.getValue().asText("") : entry.getValue().toString()));
            return values;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("表单请求体示例不是合法 JSON 对象");
        }
    }

    private ProjectApiDebugRequestSnapshotSummary buildRequestSnapshot(String method,
                                                                      String url,
                                                                      String contentType,
                                                                      Map<String, String> headers,
                                                                      String bodyText) {
        List<ProjectApiKeyValueSummary> sanitizedHeaders = headers.entrySet().stream()
                .map(entry -> new ProjectApiKeyValueSummary(entry.getKey(), sanitizeIfSensitive(entry.getKey(), entry.getValue()), Boolean.TRUE))
                .toList();
        return new ProjectApiDebugRequestSnapshotSummary(
                method,
                sanitizeUrl(url),
                contentType,
                sanitizedHeaders,
                sanitizeBody(contentType, bodyText)
        );
    }

    private JsonNode parseOpenApi(String format, String content) {
        try {
            String normalized = normalizeImportFormat(format);
            if ("json".equals(normalized)) {
                return objectMapper.readTree(content);
            }
            return yamlMapper.readTree(content);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("OpenAPI 文档解析失败，请确认内容和格式匹配");
        }
    }

    private void validateOpenApiRoot(JsonNode root) {
        String openapi = trimToNull(root.path("openapi").asText(""));
        if (openapi == null || !openapi.startsWith("3.0")) {
            throw new IllegalArgumentException("当前只支持导入 OpenAPI 3.0.x 文档");
        }
        if (!root.path("paths").isObject()) {
            throw new IllegalArgumentException("OpenAPI 文档缺少 paths 定义");
        }
    }

    private void upsertProfileFromOpenApi(Long projectId, ProjectEntity project, JsonNode infoNode) {
        ProjectApiProfileEntity entity = findProfileByScope(projectId)
                .orElseGet(() -> {
                    ProjectApiProfileEntity created = new ProjectApiProfileEntity();
                    created.setProject(project);
                    return created;
                });
        entity.setTitle(defaultString(trimToNull(infoNode.path("title").asText("")), defaultProfileTitle(project)));
        entity.setDescription(trimToEmpty(infoNode.path("description").asText("")));
        entity.setVersion(defaultString(trimToNull(infoNode.path("version").asText("")), "1.0.0"));
        profileRepository.save(entity);
    }

    private int importServers(Long projectId,
                              ProjectEntity project,
                              JsonNode serversNode,
                              Map<String, ProjectApiEnvironmentEntity> environmentByName) {
        if (!serversNode.isArray()) {
            return 0;
        }
        int importedCount = 0;
        int index = 0;
        for (JsonNode serverNode : serversNode) {
            String url = trimToNull(serverNode.path("url").asText(""));
            if (url == null) {
                continue;
            }
            String environmentName = defaultString(trimToNull(serverNode.path("description").asText("")), "环境" + (index + 1));
            ProjectApiEnvironmentEntity environment = environmentByName.get(environmentName);
            if (environment == null) {
                environment = new ProjectApiEnvironmentEntity();
                environment.setProject(project);
                importedCount++;
            }
            environment.setName(environmentName);
            environment.setBaseUrl(fromOpenApiServerUrl(url));
            environment.setVariablesJson(writeJsonText(readServerVariables(serverNode.path("variables"))));
            environment.setAuthType("NONE");
            environment.setAuthConfigJson("{}");
            environment.setIsDefault(index == 0);
            ProjectApiEnvironmentEntity saved = environmentRepository.save(environment);
            environmentByName.put(environmentName, saved);
            index++;
        }
        return importedCount;
    }

    private Map<String, String> readServerVariables(JsonNode variablesNode) {
        LinkedHashMap<String, String> variables = new LinkedHashMap<>();
        if (variablesNode.isObject()) {
            variablesNode.fields().forEachRemaining(entry -> variables.put(entry.getKey(), entry.getValue().path("default").asText("")));
        }
        return variables;
    }

    private Map<String, JsonNode> collectParameters(JsonNode parametersNode, Map<String, JsonNode> target) {
        if (parametersNode.isArray()) {
            for (JsonNode item : parametersNode) {
                String paramIn = trimToNull(item.path("in").asText(""));
                String paramName = trimToNull(item.path("name").asText(""));
                if (paramIn != null && paramName != null) {
                    target.put(paramIn + ":" + paramName, item);
                }
            }
        }
        return target;
    }

    private List<ProjectApiParameterSummary> readOpenApiParameters(Map<String, JsonNode> parameterMap, String targetIn) {
        List<ProjectApiParameterSummary> results = new ArrayList<>();
        parameterMap.forEach((key, node) -> {
            if (!key.startsWith(targetIn + ":")) {
                return;
            }
            JsonNode schemaNode = node.path("schema");
            String example = readNodeText(node.path("example"));
            if (!hasText(example)) {
                example = readNodeText(schemaNode.path("example"));
            }
            results.add(new ProjectApiParameterSummary(
                    node.path("name").asText(""),
                    node.path("required").asBoolean("path".equals(targetIn)),
                    defaultString(trimToNull(schemaNode.path("type").asText("")), "string"),
                    example,
                    trimToEmpty(node.path("description").asText(""))
            ));
        });
        return results;
    }

    private RequestBodyImportResult readOpenApiRequestBody(JsonNode requestBodyNode) {
        JsonNode contentNode = requestBodyNode.path("content");
        if (!contentNode.isObject()) {
            return new RequestBodyImportResult("none", "");
        }
        for (String supportedType : SUPPORTED_REQUEST_CONTENT_TYPES) {
            if ("none".equals(supportedType)) {
                continue;
            }
            JsonNode mediaTypeNode = contentNode.path(supportedType);
            if (!mediaTypeNode.isMissingNode()) {
                return new RequestBodyImportResult(supportedType, readMediaTypeExample(mediaTypeNode));
            }
        }
        var fields = contentNode.fields();
        if (fields.hasNext()) {
            Map.Entry<String, JsonNode> first = fields.next();
            return new RequestBodyImportResult(first.getKey(), readMediaTypeExample(first.getValue()));
        }
        return new RequestBodyImportResult("none", "");
    }

    private List<ProjectApiResponseExampleSummary> readOpenApiResponses(JsonNode responsesNode) {
        if (!responsesNode.isObject()) {
            return List.of();
        }
        List<ProjectApiResponseExampleSummary> results = new ArrayList<>();
        var fields = responsesNode.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            Integer statusCode = parseStatusCode(entry.getKey());
            if (statusCode == null) {
                continue;
            }
            JsonNode responseNode = entry.getValue();
            String description = trimToEmpty(responseNode.path("description").asText(""));
            JsonNode contentNode = responseNode.path("content");
            if (contentNode.isObject() && contentNode.fields().hasNext()) {
                Map.Entry<String, JsonNode> contentEntry = contentNode.fields().next();
                results.add(new ProjectApiResponseExampleSummary(
                        entry.getKey(),
                        statusCode,
                        contentEntry.getKey(),
                        List.of(),
                        readMediaTypeExample(contentEntry.getValue()),
                        description
                ));
            } else {
                results.add(new ProjectApiResponseExampleSummary(
                        entry.getKey(),
                        statusCode,
                        "",
                        List.of(),
                        "",
                        description
                ));
            }
        }
        return results;
    }

    private String readMediaTypeExample(JsonNode mediaTypeNode) {
        JsonNode exampleNode = mediaTypeNode.path("example");
        if (!exampleNode.isMissingNode() && !exampleNode.isNull()) {
            return readNodeText(exampleNode);
        }
        JsonNode examplesNode = mediaTypeNode.path("examples");
        if (examplesNode.isObject() && examplesNode.fields().hasNext()) {
            return readNodeText(examplesNode.fields().next().getValue().path("value"));
        }
        JsonNode schemaExampleNode = mediaTypeNode.path("schema").path("example");
        if (!schemaExampleNode.isMissingNode() && !schemaExampleNode.isNull()) {
            return readNodeText(schemaExampleNode);
        }
        return "";
    }

    private Integer parseStatusCode(String raw) {
        try {
            return Integer.valueOf(raw);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String readNodeText(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        if (node.isTextual()) {
            return node.asText("");
        }
        return writeJsonText(node);
    }

    private void appendParameters(ArrayNode parametersNode, List<ProjectApiParameterSummary> parameters, String location) {
        for (ProjectApiParameterSummary parameter : parameters) {
            if (!hasText(parameter.name())) {
                continue;
            }
            ObjectNode node = parametersNode.addObject();
            node.put("name", parameter.name());
            node.put("in", location);
            node.put("required", "path".equals(location) || Boolean.TRUE.equals(parameter.required()));
            if (hasText(parameter.description())) {
                node.put("description", parameter.description());
            }
            ObjectNode schema = node.putObject("schema");
            schema.put("type", defaultString(parameter.type(), "string"));
            JsonNode exampleNode = parseScalarExampleNode(parameter.example(), parameter.type());
            if (exampleNode != null) {
                node.set("example", exampleNode);
            }
        }
    }

    private JsonNode defaultSchemaForContentType(String contentType) {
        ObjectNode schema = objectMapper.createObjectNode();
        if ("text/plain".equals(contentType)) {
            schema.put("type", "string");
        } else if ("application/x-www-form-urlencoded".equals(contentType) || "multipart/form-data".equals(contentType)) {
            schema.put("type", "object");
        } else {
            schema.put("type", "object");
        }
        return schema;
    }

    private JsonNode parseExampleNode(String contentType, String exampleText) {
        if (!hasText(exampleText)) {
            return null;
        }
        try {
            if ("application/json".equals(contentType) || "application/x-www-form-urlencoded".equals(contentType) || "multipart/form-data".equals(contentType)) {
                return objectMapper.readTree(exampleText);
            }
        } catch (JsonProcessingException ignored) {
            // 回退到字符串示例，避免因为示例不完整而中断整个导出。
        }
        return objectMapper.getNodeFactory().textNode(exampleText);
    }

    private JsonNode parseScalarExampleNode(String example, String type) {
        if (!hasText(example)) {
            return null;
        }
        try {
            if ("integer".equalsIgnoreCase(type)) {
                return objectMapper.getNodeFactory().numberNode(Integer.parseInt(example));
            }
            if ("number".equalsIgnoreCase(type)) {
                return objectMapper.getNodeFactory().numberNode(Double.parseDouble(example));
            }
            if ("boolean".equalsIgnoreCase(type)) {
                return objectMapper.getNodeFactory().booleanNode(Boolean.parseBoolean(example));
            }
        } catch (NumberFormatException ignored) {
            return objectMapper.getNodeFactory().textNode(example);
        }
        return objectMapper.getNodeFactory().textNode(example);
    }

    private String sanitizeUrl(String url) {
        int questionMarkIndex = url.indexOf('?');
        if (questionMarkIndex < 0) {
            return url;
        }
        String base = url.substring(0, questionMarkIndex);
        String queryString = url.substring(questionMarkIndex + 1);
        List<String> sanitizedPairs = new ArrayList<>();
        for (String pair : queryString.split("&")) {
            if (!hasText(pair)) {
                continue;
            }
            int equalsIndex = pair.indexOf('=');
            String name = equalsIndex >= 0 ? pair.substring(0, equalsIndex) : pair;
            String value = equalsIndex >= 0 ? pair.substring(equalsIndex + 1) : "";
            sanitizedPairs.add(name + "=" + sanitizeIfSensitive(name, value));
        }
        return sanitizedPairs.isEmpty() ? base : base + "?" + String.join("&", sanitizedPairs);
    }

    private String sanitizeBody(String contentType, String body) {
        if (!hasText(body)) {
            return "";
        }
        try {
            if (hasText(contentType) && (contentType.contains("json") || contentType.contains("form-urlencoded") || contentType.contains("multipart/form-data"))) {
                JsonNode root = objectMapper.readTree(body);
                return writeJsonText(maskSensitiveNode(root, null));
            }
        } catch (JsonProcessingException ignored) {
            return body;
        }
        return body;
    }

    private JsonNode maskSensitiveNode(JsonNode node, String fieldName) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return objectMapper.getNodeFactory().nullNode();
        }
        if (fieldName != null && isSensitiveName(fieldName)) {
            return objectMapper.getNodeFactory().textNode("******");
        }
        if (node.isObject()) {
            ObjectNode copy = objectMapper.createObjectNode();
            node.fields().forEachRemaining(entry -> copy.set(entry.getKey(), maskSensitiveNode(entry.getValue(), entry.getKey())));
            return copy;
        }
        if (node.isArray()) {
            ArrayNode arrayNode = objectMapper.createArrayNode();
            for (JsonNode item : node) {
                arrayNode.add(maskSensitiveNode(item, fieldName));
            }
            return arrayNode;
        }
        return node.deepCopy();
    }

    private String sanitizeIfSensitive(String name, String value) {
        return isSensitiveName(name) ? "******" : defaultString(value, "");
    }

    private boolean isSensitiveName(String name) {
        return name != null && SENSITIVE_FIELD_NAMES.contains(name.trim().toLowerCase(Locale.ROOT));
    }

    private boolean isTextResponse(String contentType) {
        if (!hasText(contentType)) {
            return true;
        }
        String normalized = contentType.toLowerCase(Locale.ROOT);
        return normalized.startsWith("text/")
                || normalized.contains("json")
                || normalized.contains("xml")
                || normalized.contains("javascript")
                || normalized.contains("x-www-form-urlencoded");
    }

    private boolean hasRequestBody(String method, String requestBody, String contentType) {
        return hasText(requestBody) && !"GET".equals(method) && !"HEAD".equals(method)
                || ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method))
                && !"none".equalsIgnoreCase(contentType)
                && hasText(requestBody);
    }

    private String buildResolvedUrl(String baseUrl, String path, Map<String, String> queryParams) {
        String base = trimToEmpty(baseUrl);
        String resolvedPath = trimToEmpty(path);
        String joined;
        if (resolvedPath.startsWith("http://") || resolvedPath.startsWith("https://")) {
            joined = resolvedPath;
        } else {
            joined = trimTrailingSlash(base) + ensureLeadingSlash(resolvedPath);
        }
        if (queryParams.isEmpty()) {
            return joined;
        }
        List<String> pairs = new ArrayList<>();
        queryParams.forEach((key, value) -> {
            if (hasText(key)) {
                pairs.add(urlEncode(key) + "=" + urlEncode(defaultString(value)));
            }
        });
        if (pairs.isEmpty()) {
            return joined;
        }
        return joined + (joined.contains("?") ? "&" : "?") + String.join("&", pairs);
    }

    private String applyPathParams(String path, Map<String, String> pathParams, Map<String, String> variables) {
        String resolved = defaultString(path, "");
        for (Map.Entry<String, String> entry : pathParams.entrySet()) {
            String value = applyVariables(entry.getValue(), variables);
            resolved = resolved.replace("{" + entry.getKey() + "}", value);
            resolved = resolved.replace(":" + entry.getKey(), value);
        }
        return resolved;
    }

    private String applyVariables(String text, Map<String, String> variables) {
        if (!hasText(text) || variables.isEmpty()) {
            return defaultString(text, "");
        }
        Matcher matcher = VARIABLE_PATTERN.matcher(text);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            String key = matcher.group(1);
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(defaultString(variables.get(key), "")));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private String toOpenApiServerUrl(String baseUrl) {
        return defaultString(baseUrl).replace("{{", "{").replace("}}", "}");
    }

    private String fromOpenApiServerUrl(String url) {
        Matcher matcher = OPENAPI_SERVER_VARIABLE_PATTERN.matcher(url);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(buffer, Matcher.quoteReplacement("{{" + matcher.group(1) + "}}"));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private String buildFolderTag(ProjectApiFolderEntity folder, Map<Long, ProjectApiFolderEntity> folderById) {
        Deque<String> parts = new ArrayDeque<>();
        ProjectApiFolderEntity cursor = folder;
        while (cursor != null) {
            parts.addFirst(cursor.getName());
            cursor = cursor.getParentFolder() == null ? null : folderById.get(cursor.getParentFolder().getId());
        }
        return String.join(" / ", parts);
    }

    private String resolveEndpointName(JsonNode operationNode, String method, String path) {
        String summary = trimToNull(operationNode.path("summary").asText(""));
        if (summary != null) {
            return summary;
        }
        String operationId = trimToNull(operationNode.path("operationId").asText(""));
        if (operationId != null) {
            return operationId;
        }
        return method + " " + path;
    }

    private String endpointKey(String method, String path) {
        return normalizeMethod(method) + " " + normalizePath(path);
    }

    private String normalizeMethod(String method) {
        String normalized = defaultString(method).trim().toUpperCase(Locale.ROOT);
        if (!HTTP_METHODS.contains(normalized)) {
            throw new IllegalArgumentException("不支持的 HTTP 方法：" + method);
        }
        return normalized;
    }

    private String normalizeRequestContentType(String contentType) {
        String normalized = trimToNull(contentType);
        if (normalized == null) {
            return "none";
        }
        if (!SUPPORTED_REQUEST_CONTENT_TYPES.contains(normalized)) {
            throw new IllegalArgumentException("当前只支持固定的请求内容类型");
        }
        return normalized;
    }

    private String normalizeAuthType(String authType) {
        String normalized = defaultString(trimToNull(authType), "NONE").toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "NONE", "BEARER", "BASIC", "API_KEY" -> normalized;
            default -> throw new IllegalArgumentException("不支持的鉴权类型：" + authType);
        };
    }

    private String normalizePath(String path) {
        String normalized = trimToNull(path);
        if (normalized == null) {
            throw new IllegalArgumentException("接口路径不能为空");
        }
        if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
            return normalized;
        }
        return ensureLeadingSlash(normalized);
    }

    private String normalizeImportFormat(String format) {
        String normalized = defaultString(format).trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "json", ".json" -> "json";
            case "yaml", "yml", ".yaml", ".yml" -> "yaml";
            default -> throw new IllegalArgumentException("导入格式只支持 json 或 yaml");
        };
    }

    private String normalizeExportFormat(String format) {
        String normalized = trimToNull(format);
        if (normalized == null) {
            return "json";
        }
        return normalizeImportFormat(normalized);
    }

    private String defaultProfileTitle(ProjectEntity project) {
        if (project == null) {
            return "未关联项目 API 文档";
        }
        return defaultString(trimToNull(project.getName()), "项目") + " API 文档";
    }

    private ProjectEntity requireProjectVisibleIfPresent(Long projectId) {
        if (projectId == null) {
            return null;
        }
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在"));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private ProjectEntity requireProjectEditableIfPresent(Long projectId) {
        if (projectId == null) {
            return null;
        }
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在"));
        projectDataPermissionService.requireProjectEditable(project);
        return project;
    }

    private ProjectApiFolderEntity requireFolder(Long projectId, Long folderId) {
        return (projectId == null
                ? folderRepository.findByProjectIsNullAndId(folderId)
                : folderRepository.findByProject_IdAndId(projectId, folderId))
                .orElseThrow(() -> new NoSuchElementException("API 目录不存在"));
    }

    private Optional<ProjectApiFolderEntity> resolveFolder(Long projectId, Long folderId) {
        if (folderId == null) {
            return Optional.empty();
        }
        return Optional.of(requireFolder(projectId, folderId));
    }

    private ProjectApiEndpointEntity requireEndpoint(Long projectId, Long endpointId) {
        return (projectId == null
                ? endpointRepository.findByProjectIsNullAndId(endpointId)
                : endpointRepository.findByProject_IdAndId(projectId, endpointId))
                .orElseThrow(() -> new NoSuchElementException("API 接口不存在"));
    }

    private ProjectApiEnvironmentEntity requireEnvironment(Long projectId, Long environmentId) {
        return (projectId == null
                ? environmentRepository.findByProjectIsNullAndId(environmentId)
                : environmentRepository.findByProject_IdAndId(projectId, environmentId))
                .orElseThrow(() -> new NoSuchElementException("API 环境不存在"));
    }

    private Optional<ProjectApiProfileEntity> findProfileByScope(Long projectId) {
        return projectId == null ? profileRepository.findByProjectIsNull() : profileRepository.findByProject_Id(projectId);
    }

    private List<ProjectApiFolderEntity> listFoldersByScope(Long projectId) {
        return projectId == null
                ? folderRepository.findByProjectIsNullOrderBySortOrderAscIdAsc()
                : folderRepository.findByProject_IdOrderBySortOrderAscIdAsc(projectId);
    }

    private List<ProjectApiEndpointEntity> listEndpointsByScope(Long projectId) {
        return projectId == null
                ? endpointRepository.findByProjectIsNullOrderByIdAsc()
                : endpointRepository.findByProject_IdOrderByIdAsc(projectId);
    }

    private List<ProjectApiEnvironmentEntity> listEnvironmentsByScope(Long projectId) {
        return projectId == null
                ? environmentRepository.findByProjectIsNullOrderByIsDefaultDescIdAsc()
                : environmentRepository.findByProject_IdOrderByIsDefaultDescIdAsc(projectId);
    }

    private List<ProjectApiDebugRecordEntity> listDebugRecordsByScope(Long projectId) {
        return projectId == null
                ? debugRecordRepository.findTop20ByProjectIsNullOrderByCreatedAtDescIdDesc()
                : debugRecordRepository.findTop20ByProject_IdOrderByCreatedAtDescIdDesc(projectId);
    }

    private List<ProjectApiDebugRecordEntity> listDebugRecordsByScope(Long projectId, Long endpointId) {
        return projectId == null
                ? debugRecordRepository.findTop20ByProjectIsNullAndEndpoint_IdOrderByCreatedAtDescIdDesc(endpointId)
                : debugRecordRepository.findTop20ByProject_IdAndEndpoint_IdOrderByCreatedAtDescIdDesc(projectId, endpointId);
    }

    private void validateFolderParent(ProjectApiFolderEntity entity, ProjectApiFolderEntity parentFolder) {
        if (parentFolder == null) {
            return;
        }
        if (Objects.equals(entity.getId(), parentFolder.getId())) {
            throw new IllegalArgumentException("目录不能把自己设为父节点");
        }
        ProjectApiFolderEntity cursor = parentFolder;
        while (cursor != null) {
            if (Objects.equals(cursor.getId(), entity.getId())) {
                throw new IllegalArgumentException("目录不能移动到自己的子节点下");
            }
            cursor = cursor.getParentFolder();
        }
    }

    private UserEntity requireCurrentUserEntity() {
        AuthContext authContext = AuthContextHolder.get().orElseThrow(() -> new UnauthorizedException("Not logged in"));
        return userRepository.findById(authContext.userId())
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
    }

    private <T> T readValue(String json, Class<T> type, T fallback) {
        try {
            return objectMapper.readValue(defaultString(json), type);
        } catch (IOException exception) {
            return fallback;
        }
    }

    private Map<String, String> normalizeStringMap(Map<String, String> map) {
        if (map == null || map.isEmpty()) {
            return Map.of();
        }
        LinkedHashMap<String, String> normalized = new LinkedHashMap<>();
        map.forEach((key, value) -> {
            if (hasText(key)) {
                normalized.put(key.trim(), trimToEmpty(value));
            }
        });
        return normalized;
    }

    private String writeJsonText(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("JSON 序列化失败", exception);
        }
    }

    private String writeYamlText(Object value) {
        try {
            return yamlMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("YAML 序列化失败", exception);
        }
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? "" : time.format(TIME_FORMATTER);
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String defaultString(String value, String fallback) {
        return hasText(value) ? value : defaultString(fallback);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private Integer defaultInteger(Integer value, Integer fallback) {
        return value == null ? fallback : value;
    }

    private String trimTrailingSlash(String value) {
        if (!hasText(value)) {
            return "";
        }
        String result = value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private String ensureLeadingSlash(String value) {
        if (!hasText(value)) {
            return "/";
        }
        return value.startsWith("/") ? value : "/" + value;
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(defaultString(value), StandardCharsets.UTF_8);
    }

    private String sanitizeFileName(String value) {
        return defaultString(value, "project-api").replaceAll("[\\\\/:*?\"<>|\\s]+", "-");
    }

    private record RequestBodyImportResult(String contentType, String bodyExampleText) {
    }

    private record DebugExecutionPayload(
            String method,
            String contentType,
            String url,
            LinkedHashMap<String, String> headers,
            String body,
            ProjectApiDebugRequestSnapshotSummary requestSnapshot
    ) {
    }

    private record MultipartPayload(String boundary, String body) {
    }

    private record DebugResponseSnapshot(ProjectApiDebugResponseSnapshotSummary snapshot) {
    }
}
