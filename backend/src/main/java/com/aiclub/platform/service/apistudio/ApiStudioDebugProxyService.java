package com.aiclub.platform.service.apistudio;

import com.aiclub.platform.domain.model.ApiStudioDebugRecordEntity;
import com.aiclub.platform.domain.model.ApiStudioEndpointEntity;
import com.aiclub.platform.domain.model.ApiStudioEndpointParameterEntity;
import com.aiclub.platform.domain.model.ApiStudioEnvironmentEntity;
import com.aiclub.platform.domain.model.ApiStudioEnvironmentVariableEntity;
import com.aiclub.platform.dto.apistudio.ApiStudioDebugExecutionResult;
import com.aiclub.platform.dto.apistudio.ApiStudioDebugRecordItem;
import com.aiclub.platform.dto.request.apistudio.ApiStudioDebugExecutionRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ApiStudioDebugRecordRepository;
import com.aiclub.platform.repository.ApiStudioEndpointParameterRepository;
import com.aiclub.platform.repository.ApiStudioEndpointRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 原生 API 工作台 - 调试代理服务。
 * 安全边界：
 *  - 调试请求只能访问当前项目所选环境 baseUrl 同源目标。
 *  - 禁止用户传完整任意 URL，仅接受 API 已保存的 path 以及临时覆盖。
 *  - 不跟随跨源重定向（HttpClient 设为 NEVER follow，由我们自己控制）。
 *  - 超时、最大响应体大小由统一常量控制。
 *  - 敏感 Header 入库前脱敏。
 */
@Service
public class ApiStudioDebugProxyService {

    private static final Logger log = LoggerFactory.getLogger(ApiStudioDebugProxyService.class);

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB 入库截断
    private static final int MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
    private static final Pattern VAR_PATTERN = Pattern.compile("\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*}}");
    private static final Set<String> SENSITIVE_HEADERS = Set.of("authorization", "cookie", "x-api-key", "x-token");

    private final ApiStudioEndpointRepository endpointRepository;
    private final ApiStudioEndpointParameterRepository parameterRepository;
    private final ApiStudioEnvironmentService environmentService;
    private final ApiStudioDebugRecordRepository debugRecordRepository;
    private final ApiStudioDirectoryService directoryService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public ApiStudioDebugProxyService(ApiStudioEndpointRepository endpointRepository,
                                      ApiStudioEndpointParameterRepository parameterRepository,
                                      ApiStudioEnvironmentService environmentService,
                                      ApiStudioDebugRecordRepository debugRecordRepository,
                                      ApiStudioDirectoryService directoryService,
                                      ObjectMapper objectMapper) {
        this.endpointRepository = endpointRepository;
        this.parameterRepository = parameterRepository;
        this.environmentService = environmentService;
        this.debugRecordRepository = debugRecordRepository;
        this.directoryService = directoryService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    // ========== 执行调试 ==========

    @Transactional
    public ApiStudioDebugExecutionResult execute(Long projectId, Long endpointId, ApiStudioDebugExecutionRequest request) {
        directoryService.requireEditableProject(projectId);

        ApiStudioEndpointEntity endpoint = endpointRepository.findById(endpointId)
                .orElseThrow(() -> new NoSuchElementException("API 不存在: " + endpointId));
        if (!Objects.equals(endpoint.getProjectId(), projectId)) {
            throw new ForbiddenException("API 不属于当前项目");
        }
        if (request.environmentId() == null) {
            throw new IllegalArgumentException("调试必须选择环境");
        }
        ApiStudioEnvironmentEntity environment = environmentService.loadEntity(projectId, request.environmentId());

        // 准备变量解析上下文
        Map<String, String> variableContext = buildVariableContext(environment, request.variableOverrides());

        // 解析路径参数
        String resolvedPath = resolvePath(endpoint, request, variableContext);

        // 解析 query 字符串
        String resolvedQuery = resolveQuery(endpoint, request, variableContext);

        // 拼接最终 URL，并强制校验同源
        URI baseUri = URI.create(resolveVars(environment.getBaseUrl(), variableContext));
        URI finalUri = combine(baseUri, resolvedPath, resolvedQuery);
        if (!sameOrigin(baseUri, finalUri)) {
            throw new IllegalArgumentException("调试目标不在环境 baseUrl 同源范围内: " + finalUri);
        }

        // 合并 Header
        Map<String, String> headers = mergeHeaders(endpoint, environment, request, variableContext);

        // 构造请求体
        byte[] bodyBytes = buildRequestBody(endpoint, request, headers, variableContext);

        // 真正执行
        long startMs = System.currentTimeMillis();
        Integer statusCode = null;
        String errorMessage = null;
        boolean success = false;
        Map<String, List<String>> responseHeaders = Map.of();
        String responseBodyText = "";
        long responseBytes = 0;
        boolean truncated = false;
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(finalUri).timeout(REQUEST_TIMEOUT);
            for (Map.Entry<String, String> h : headers.entrySet()) {
                if (isRestrictedHeader(h.getKey())) continue;
                builder.header(h.getKey(), h.getValue() == null ? "" : h.getValue());
            }
            String method = endpoint.getMethod() == null ? "GET" : endpoint.getMethod().toUpperCase(Locale.ROOT);
            HttpRequest.BodyPublisher publisher = bodyBytes == null || bodyBytes.length == 0
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofByteArray(bodyBytes);
            builder.method(method, publisher);
            HttpResponse<byte[]> resp = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());

            // 同源重定向检查（HttpClient 配置 NEVER followRedirects，3xx 我们也直接当结果返回）
            statusCode = resp.statusCode();
            responseHeaders = resp.headers().map();
            byte[] body = resp.body() == null ? new byte[0] : resp.body();
            responseBytes = body.length;
            if (body.length > MAX_RESPONSE_BYTES) {
                truncated = true;
                responseBodyText = new String(body, 0, MAX_RESPONSE_BYTES, StandardCharsets.UTF_8);
            } else {
                responseBodyText = new String(body, StandardCharsets.UTF_8);
            }
            success = statusCode != null && statusCode >= 200 && statusCode < 400;
        } catch (Exception ex) {
            log.warn("API Studio 调试请求失败: {} {}", endpoint.getMethod(), finalUri, ex);
            errorMessage = ex.getClass().getSimpleName() + ": " + (ex.getMessage() == null ? "" : ex.getMessage());
        }
        long durationMs = System.currentTimeMillis() - startMs;

        // 写入个人调试记录（敏感 Header 脱敏）
        Long recordId = persistRecord(projectId, endpointId, environment.getId(),
                method(endpoint), finalUri.toString(), headers, bodyBytes,
                statusCode, durationMs, success, errorMessage,
                responseHeaders, responseBodyText, responseBytes, truncated);

        return new ApiStudioDebugExecutionResult(
                recordId, success, statusCode, durationMs, errorMessage,
                finalUri.toString(), method(endpoint),
                redactHeadersForResponse(headers, true),
                truncateBodyPreview(bodyBytes),
                responseHeaders,
                responseBodyText, responseBytes, truncated);
    }

    // ========== 调试记录查询 ==========

    public Page<ApiStudioDebugRecordItem> listRecords(Long projectId, Long endpointId, int page, int size) {
        directoryService.requireVisibleProject(projectId);
        Long userId = requireCurrentUserId();
        PageRequest pageable = PageRequest.of(Math.max(page - 1, 0), Math.min(Math.max(size, 1), 200));
        Page<ApiStudioDebugRecordEntity> resultPage = endpointId == null
                ? debugRecordRepository.findByProjectIdAndCreatorUserIdOrderByCreatedAtDesc(projectId, userId, pageable)
                : debugRecordRepository.findByProjectIdAndCreatorUserIdAndEndpointIdOrderByCreatedAtDesc(projectId, userId, endpointId, pageable);
        return resultPage.map(this::toItem);
    }

    public ApiStudioDebugRecordItem getRecord(Long projectId, Long recordId) {
        directoryService.requireVisibleProject(projectId);
        Long userId = requireCurrentUserId();
        ApiStudioDebugRecordEntity entity = debugRecordRepository.findById(recordId)
                .orElseThrow(() -> new NoSuchElementException("调试记录不存在: " + recordId));
        if (!Objects.equals(entity.getProjectId(), projectId)) {
            throw new ForbiddenException("调试记录不属于当前项目");
        }
        if (!Objects.equals(entity.getCreatorUserId(), userId)) {
            throw new ForbiddenException("无权查看他人调试记录");
        }
        return toItem(entity);
    }

    @Transactional
    public void deleteRecord(Long projectId, Long recordId) {
        directoryService.requireVisibleProject(projectId);
        Long userId = requireCurrentUserId();
        ApiStudioDebugRecordEntity entity = debugRecordRepository.findById(recordId)
                .orElseThrow(() -> new NoSuchElementException("调试记录不存在: " + recordId));
        if (!Objects.equals(entity.getProjectId(), projectId)) {
            throw new ForbiddenException("调试记录不属于当前项目");
        }
        if (!Objects.equals(entity.getCreatorUserId(), userId)) {
            throw new ForbiddenException("无权删除他人调试记录");
        }
        debugRecordRepository.delete(entity);
    }

    // ========== 内部 ==========

    private String method(ApiStudioEndpointEntity endpoint) {
        return endpoint.getMethod() == null ? "GET" : endpoint.getMethod().toUpperCase(Locale.ROOT);
    }

    private Long requireCurrentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId)
                .orElseThrow(() -> new ForbiddenException("未登录"));
    }

    private Map<String, String> buildVariableContext(ApiStudioEnvironmentEntity env, Map<String, String> overrides) {
        Map<String, String> ctx = new HashMap<>();
        // baseUrl 是内置变量
        ctx.put("baseUrl", env.getBaseUrl());
        for (ApiStudioEnvironmentVariableEntity v : environmentService.loadVariables(env.getId())) {
            // secret 也允许在调试期间使用（仅服务端持有）
            ctx.put(v.getName(), v.getValueCiphertext() == null ? "" : v.getValueCiphertext());
        }
        if (overrides != null) {
            ctx.putAll(overrides);
        }
        return ctx;
    }

    private String resolveVars(String text, Map<String, String> ctx) {
        if (text == null) return "";
        Matcher m = VAR_PATTERN.matcher(text);
        StringBuffer sb = new StringBuffer();
        int safety = 0;
        while (m.find()) {
            String name = m.group(1);
            if (!ctx.containsKey(name)) {
                throw new IllegalArgumentException("未定义的变量: " + name);
            }
            String value = ctx.get(name);
            // 简单一次性解析，禁止变量值本身再含变量引用避免循环
            if (safety++ > 256) {
                throw new IllegalArgumentException("变量解析次数过多");
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(value == null ? "" : value));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private String resolvePath(ApiStudioEndpointEntity endpoint, ApiStudioDebugExecutionRequest request, Map<String, String> vars) {
        String path = endpoint.getPath() == null ? "/" : endpoint.getPath();
        // 1. 替换 {param} 形式的 path 变量（来自参数定义和 pathOverrides）
        Map<String, String> pathValues = new HashMap<>();
        for (ApiStudioEndpointParameterEntity p : parameterRepository.findByEndpointIdOrderByLocationAscSortOrderAscIdAsc(endpoint.getId())) {
            if ("PATH".equalsIgnoreCase(p.getLocation())) {
                String value = p.getDefaultValue() != null ? p.getDefaultValue() : (p.getExampleValue() != null ? p.getExampleValue() : "");
                pathValues.put(p.getName(), value);
            }
        }
        if (request.pathOverrides() != null) {
            pathValues.putAll(request.pathOverrides());
        }
        for (Map.Entry<String, String> e : pathValues.entrySet()) {
            path = path.replace("{" + e.getKey() + "}", e.getValue() == null ? "" : e.getValue());
        }
        // 2. 解析 {{var}} 变量
        return resolveVars(path, vars);
    }

    private String resolveQuery(ApiStudioEndpointEntity endpoint, ApiStudioDebugExecutionRequest request, Map<String, String> vars) {
        Map<String, String> q = new LinkedHashMap<>();
        for (ApiStudioEndpointParameterEntity p : parameterRepository.findByEndpointIdOrderByLocationAscSortOrderAscIdAsc(endpoint.getId())) {
            if ("QUERY".equalsIgnoreCase(p.getLocation())) {
                String value = p.getDefaultValue() != null ? p.getDefaultValue() : "";
                if ((value == null || value.isEmpty()) && p.getExampleValue() != null) value = p.getExampleValue();
                if (Boolean.TRUE.equals(p.getRequired()) || (value != null && !value.isEmpty())) {
                    q.put(p.getName(), value == null ? "" : value);
                }
            }
        }
        if (request.queryOverrides() != null) {
            q.putAll(request.queryOverrides());
        }
        if (q.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, String> e : q.entrySet()) {
            String key = URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8);
            String val = URLEncoder.encode(resolveVars(e.getValue() == null ? "" : e.getValue(), vars), StandardCharsets.UTF_8);
            if (!first) sb.append("&");
            sb.append(key).append("=").append(val);
            first = false;
        }
        return sb.toString();
    }

    private URI combine(URI base, String path, String query) {
        String baseStr = base.toString();
        if (baseStr.endsWith("/")) baseStr = baseStr.substring(0, baseStr.length() - 1);
        String pathStr = path.startsWith("/") ? path : "/" + path;
        String full = baseStr + pathStr + (query == null || query.isEmpty() ? "" : ("?" + query));
        return URI.create(full);
    }

    private boolean sameOrigin(URI base, URI target) {
        if (base.getScheme() == null || target.getScheme() == null) return false;
        if (!base.getScheme().equalsIgnoreCase(target.getScheme())) return false;
        if (base.getHost() == null || target.getHost() == null) return false;
        if (!base.getHost().equalsIgnoreCase(target.getHost())) return false;
        int basePort = base.getPort() == -1 ? defaultPort(base.getScheme()) : base.getPort();
        int targetPort = target.getPort() == -1 ? defaultPort(target.getScheme()) : target.getPort();
        return basePort == targetPort;
    }

    private int defaultPort(String scheme) {
        return "https".equalsIgnoreCase(scheme) ? 443 : 80;
    }

    private Map<String, String> mergeHeaders(ApiStudioEndpointEntity endpoint,
                                             ApiStudioEnvironmentEntity environment,
                                             ApiStudioDebugExecutionRequest request,
                                             Map<String, String> vars) {
        Map<String, String> headers = new LinkedHashMap<>();
        // 环境公共 Header（最低优先级）
        if (environment.getCommonHeadersJson() != null && !environment.getCommonHeadersJson().isBlank()) {
            try {
                Map<String, Object> map = objectMapper.readValue(environment.getCommonHeadersJson(), Map.class);
                for (Map.Entry<String, Object> e : map.entrySet()) {
                    headers.put(e.getKey(), resolveVars(String.valueOf(e.getValue()), vars));
                }
            } catch (JsonProcessingException ignore) {
            }
        }
        // 环境认证 Header
        applyAuthHeader(environment, headers, vars);
        // API Header
        for (ApiStudioEndpointParameterEntity p : parameterRepository.findByEndpointIdOrderByLocationAscSortOrderAscIdAsc(endpoint.getId())) {
            if ("HEADER".equalsIgnoreCase(p.getLocation())) {
                String value = p.getDefaultValue() != null ? p.getDefaultValue() : (p.getExampleValue() != null ? p.getExampleValue() : "");
                headers.put(p.getName(), resolveVars(value, vars));
            }
        }
        // 调试临时 Header（最高优先级）
        if (request.headerOverrides() != null) {
            for (Map.Entry<String, String> e : request.headerOverrides().entrySet()) {
                headers.put(e.getKey(), resolveVars(e.getValue() == null ? "" : e.getValue(), vars));
            }
        }
        return headers;
    }

    private void applyAuthHeader(ApiStudioEnvironmentEntity env, Map<String, String> headers, Map<String, String> vars) {
        String auth = env.getAuthType() == null ? "NONE" : env.getAuthType().toUpperCase(Locale.ROOT);
        if (auth.equals("BEARER") && env.getAuthConfigJson() != null) {
            try {
                Map<String, Object> cfg = objectMapper.readValue(env.getAuthConfigJson(), Map.class);
                Object token = cfg.get("token");
                if (token != null) {
                    headers.put("Authorization", "Bearer " + resolveVars(String.valueOf(token), vars));
                }
            } catch (JsonProcessingException ignore) {
            }
        } else if (auth.equals("API_KEY") && env.getAuthConfigJson() != null) {
            try {
                Map<String, Object> cfg = objectMapper.readValue(env.getAuthConfigJson(), Map.class);
                Object name = cfg.get("headerName");
                Object value = cfg.get("value");
                if (name != null && value != null) {
                    headers.put(String.valueOf(name), resolveVars(String.valueOf(value), vars));
                }
            } catch (JsonProcessingException ignore) {
            }
        }
    }

    private byte[] buildRequestBody(ApiStudioEndpointEntity endpoint, ApiStudioDebugExecutionRequest request,
                                    Map<String, String> headers, Map<String, String> vars) {
        String bodyType = request.requestBodyType() != null ? request.requestBodyType().toUpperCase(Locale.ROOT)
                : (endpoint.getRequestBodyType() == null ? "NONE" : endpoint.getRequestBodyType().toUpperCase(Locale.ROOT));
        if ("NONE".equals(bodyType)) return new byte[0];

        if ("JSON".equals(bodyType) || "RAW_TEXT".equals(bodyType)) {
            String raw = request.requestBody() != null ? request.requestBody() : endpoint.getRequestBodyExample();
            if (raw == null) return new byte[0];
            String resolved = resolveVars(raw, vars);
            if (!headers.containsKey("Content-Type")) {
                headers.put("Content-Type", "JSON".equals(bodyType) ? "application/json" : "text/plain");
            }
            byte[] bytes = resolved.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_REQUEST_BODY_BYTES) {
                throw new IllegalArgumentException("请求体超过最大限制 5MB");
            }
            return bytes;
        }
        if ("FORM_URLENCODED".equals(bodyType)) {
            Map<String, String> form = new LinkedHashMap<>();
            collectFormFields(endpoint, "FORM_URLENCODED", form, vars);
            if (request.formOverrides() != null) {
                for (ApiStudioDebugExecutionRequest.FormFieldOverride o : request.formOverrides()) {
                    form.put(o.name(), o.value() == null ? "" : resolveVars(o.value(), vars));
                }
            }
            StringBuilder sb = new StringBuilder();
            boolean first = true;
            for (Map.Entry<String, String> e : form.entrySet()) {
                if (!first) sb.append("&");
                sb.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8))
                        .append("=")
                        .append(URLEncoder.encode(e.getValue() == null ? "" : e.getValue(), StandardCharsets.UTF_8));
                first = false;
            }
            if (!headers.containsKey("Content-Type")) {
                headers.put("Content-Type", "application/x-www-form-urlencoded");
            }
            return sb.toString().getBytes(StandardCharsets.UTF_8);
        }
        if ("FORM_DATA".equals(bodyType)) {
            // 第一版仅支持文本字段 multipart，文件上传通过单独通道（后续）
            String boundary = "----AiClubBoundary" + UUID.randomUUID();
            Map<String, String> form = new LinkedHashMap<>();
            collectFormFields(endpoint, "FORM_DATA", form, vars);
            if (request.formOverrides() != null) {
                for (ApiStudioDebugExecutionRequest.FormFieldOverride o : request.formOverrides()) {
                    if (!Boolean.TRUE.equals(o.file())) {
                        form.put(o.name(), o.value() == null ? "" : resolveVars(o.value(), vars));
                    }
                }
            }
            StringBuilder sb = new StringBuilder();
            for (Map.Entry<String, String> e : form.entrySet()) {
                sb.append("--").append(boundary).append("\r\n");
                sb.append("Content-Disposition: form-data; name=\"").append(e.getKey()).append("\"\r\n\r\n");
                sb.append(e.getValue() == null ? "" : e.getValue()).append("\r\n");
            }
            sb.append("--").append(boundary).append("--\r\n");
            if (!headers.containsKey("Content-Type")) {
                headers.put("Content-Type", "multipart/form-data; boundary=" + boundary);
            }
            return sb.toString().getBytes(StandardCharsets.UTF_8);
        }
        return new byte[0];
    }

    private void collectFormFields(ApiStudioEndpointEntity endpoint, String location, Map<String, String> form, Map<String, String> vars) {
        for (ApiStudioEndpointParameterEntity p : parameterRepository.findByEndpointIdOrderByLocationAscSortOrderAscIdAsc(endpoint.getId())) {
            if (location.equalsIgnoreCase(p.getLocation())) {
                String value = p.getDefaultValue() != null ? p.getDefaultValue() : (p.getExampleValue() != null ? p.getExampleValue() : "");
                form.put(p.getName(), resolveVars(value, vars));
            }
        }
    }

    private boolean isRestrictedHeader(String name) {
        if (name == null) return true;
        String lower = name.toLowerCase(Locale.ROOT);
        // HttpClient 不允许设置部分头
        return Set.of("host", "content-length", "connection", "upgrade").contains(lower);
    }

    private Map<String, List<String>> redactHeadersForResponse(Map<String, String> headers, boolean redact) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : headers.entrySet()) {
            String value = e.getValue();
            if (redact && SENSITIVE_HEADERS.contains(e.getKey().toLowerCase(Locale.ROOT))) {
                value = "***";
            }
            out.put(e.getKey(), List.of(value == null ? "" : value));
        }
        return out;
    }

    private String truncateBodyPreview(byte[] body) {
        if (body == null || body.length == 0) return "";
        int max = Math.min(body.length, 8 * 1024);
        return new String(body, 0, max, StandardCharsets.UTF_8);
    }

    private Long persistRecord(Long projectId, Long endpointId, Long environmentId,
                               String method, String finalUrl, Map<String, String> headers, byte[] bodyBytes,
                               Integer statusCode, long durationMs, boolean success, String errorMessage,
                               Map<String, List<String>> responseHeaders, String responseBody, long responseBytes, boolean truncated) {
        try {
            Map<String, Object> reqSnap = new LinkedHashMap<>();
            reqSnap.put("method", method);
            reqSnap.put("url", finalUrl);
            reqSnap.put("headers", redactHeadersForResponse(headers, true));
            reqSnap.put("bodyPreview", truncateBodyPreview(bodyBytes));

            Map<String, Object> respSnap = new LinkedHashMap<>();
            respSnap.put("statusCode", statusCode);
            respSnap.put("headers", responseHeaders);
            respSnap.put("bodyPreview", responseBody);
            respSnap.put("bytes", responseBytes);
            respSnap.put("truncated", truncated);

            ApiStudioDebugRecordEntity entity = new ApiStudioDebugRecordEntity();
            entity.setProjectId(projectId);
            entity.setEndpointId(endpointId);
            entity.setEnvironmentId(environmentId);
            entity.setCreatorUserId(requireCurrentUserId());
            entity.setRequestSnapshotJson(objectMapper.writeValueAsString(reqSnap));
            entity.setResponseSnapshotJson(objectMapper.writeValueAsString(respSnap));
            entity.setStatusCode(statusCode);
            entity.setDurationMillis(durationMs);
            entity.setSuccess(success);
            entity.setErrorMessage(errorMessage);
            entity.setCreatedAt(LocalDateTime.now());
            return debugRecordRepository.save(entity).getId();
        } catch (JsonProcessingException e) {
            log.warn("无法序列化调试记录", e);
            return null;
        }
    }

    private ApiStudioDebugRecordItem toItem(ApiStudioDebugRecordEntity e) {
        return new ApiStudioDebugRecordItem(
                e.getId(), e.getProjectId(), e.getEndpointId(), e.getEnvironmentId(),
                e.getCreatorUserId(), e.getRequestSnapshotJson(), e.getResponseSnapshotJson(),
                e.getStatusCode(), e.getDurationMillis(), e.getSuccess(),
                e.getErrorMessage(), e.getCreatedAt());
    }

    // 抑制 IDE 未使用警告
    @SuppressWarnings("unused")
    private static final List<String> ALL_RESTRICTED = new ArrayList<>();
}
