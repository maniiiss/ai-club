package com.aiclub.platform.operationlog;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.LoginResult;
import com.aiclub.platform.security.AuthContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 通用操作日志的公共规则与脱敏辅助方法。
 */
public final class OperationLogSupport {

    /**
     * 请求快照整体最大长度，避免长文本把日志表撑爆。
     */
    public static final int MAX_REQUEST_SNAPSHOT_LENGTH = 8000;

    /**
     * 单个字符串字段最大保留长度。
     */
    public static final int MAX_STRING_VALUE_LENGTH = 1000;

    /**
     * 模块编码默认最大长度。
     */
    public static final int MAX_MODULE_CODE_LENGTH = 80;

    /**
     * 模块名称默认最大长度。
     */
    public static final int MAX_MODULE_NAME_LENGTH = 100;

    /**
     * 动作编码默认最大长度。
     */
    public static final int MAX_ACTION_CODE_LENGTH = 120;

    /**
     * 动作名称默认最大长度。
     */
    public static final int MAX_ACTION_NAME_LENGTH = 200;

    /**
     * 结果消息最大长度，需要与表结构保持一致。
     */
    public static final int MAX_RESULT_MESSAGE_LENGTH = 1000;

    /**
     * 用户代理字符串最大长度，需要与表结构保持一致。
     */
    public static final int MAX_USER_AGENT_LENGTH = 1000;

    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "DELETE");
    private static final List<String> COMMON_BIZ_ID_PARAMS = List.of(
            "id",
            "projectId",
            "taskId",
            "iterationId",
            "planId",
            "bindingId",
            "userId",
            "roleId",
            "permissionId",
            "configId",
            "agentId",
            "serverId",
            "commentId",
            "notificationId"
    );
    private static final List<String> SENSITIVE_FIELD_KEYWORDS = List.of(
            "password",
            "newpassword",
            "currentpassword",
            "token",
            "secret",
            "apikey",
            "authorization",
            "cookie",
            "staticvalue",
            "httpheadersjson"
    );
    private static final Map<String, String> MODULE_NAME_MAPPING = createModuleNameMapping();

    private OperationLogSupport() {
    }

    /**
     * 判断当前请求是否属于需要记录的写操作。
     */
    public static boolean isWriteMethod(String method) {
        return method != null && WRITE_METHODS.contains(method.toUpperCase(Locale.ROOT));
    }

    /**
     * 判断字段名是否命中默认敏感词。
     */
    public static boolean isSensitiveField(String fieldName) {
        if (!StringUtils.hasText(fieldName)) {
            return false;
        }
        String normalized = fieldName.replace("-", "").replace("_", "").trim().toLowerCase(Locale.ROOT);
        return SENSITIVE_FIELD_KEYWORDS.stream().anyMatch(normalized::contains);
    }

    /**
     * 从路径变量中提取通用业务主键。
     */
    public static ResolvedBizTarget resolveBizTarget(Map<String, String> pathVariables,
                                                     String routePattern,
                                                     String configuredBizType,
                                                     String configuredBizIdParam) {
        if (pathVariables == null || pathVariables.isEmpty()) {
            return new ResolvedBizTarget(blankToNull(configuredBizType), null);
        }

        if (StringUtils.hasText(configuredBizIdParam)) {
            Long bizId = parseLong(pathVariables.get(configuredBizIdParam));
            String bizType = StringUtils.hasText(configuredBizType)
                    ? configuredBizType.trim()
                    : inferBizTypeFromParam(configuredBizIdParam, routePattern);
            return new ResolvedBizTarget(blankToNull(bizType), bizId);
        }

        for (String candidate : COMMON_BIZ_ID_PARAMS) {
            if (!pathVariables.containsKey(candidate)) {
                continue;
            }
            Long bizId = parseLong(pathVariables.get(candidate));
            if (bizId == null) {
                continue;
            }
            String bizType = StringUtils.hasText(configuredBizType)
                    ? configuredBizType.trim()
                    : inferBizTypeFromParam(candidate, routePattern);
            return new ResolvedBizTarget(blankToNull(bizType), bizId);
        }
        return new ResolvedBizTarget(blankToNull(configuredBizType), null);
    }

    /**
     * 生成默认模块编码。
     */
    public static String deriveModuleCode(HandlerMethod handlerMethod, String requestUri) {
        String controllerName = handlerMethod.getBeanType().getSimpleName();
        if (controllerName.endsWith("Controller")) {
            controllerName = controllerName.substring(0, controllerName.length() - "Controller".length());
        }
        if (StringUtils.hasText(controllerName)) {
            return truncate(toUpperSnakeCase(controllerName), MAX_MODULE_CODE_LENGTH);
        }
        return truncate(toUpperSnakeCase(firstPathSegment(requestUri)), MAX_MODULE_CODE_LENGTH);
    }

    /**
     * 生成默认模块名称，优先使用预置中文映射。
     */
    public static String deriveModuleName(String moduleCode, HandlerMethod handlerMethod, String requestUri) {
        if (StringUtils.hasText(moduleCode)) {
            String mapped = MODULE_NAME_MAPPING.get(moduleCode.trim().toUpperCase(Locale.ROOT));
            if (StringUtils.hasText(mapped)) {
                return truncate(mapped, MAX_MODULE_NAME_LENGTH);
            }
        }
        String controllerName = handlerMethod.getBeanType().getSimpleName();
        if (controllerName.endsWith("Controller")) {
            controllerName = controllerName.substring(0, controllerName.length() - "Controller".length());
        }
        if (StringUtils.hasText(controllerName)) {
            return truncate(controllerName, MAX_MODULE_NAME_LENGTH);
        }
        return truncate(firstPathSegment(requestUri), MAX_MODULE_NAME_LENGTH);
    }

    /**
     * 生成默认动作编码。
     */
    public static String deriveActionCode(String httpMethod, String routePattern, String methodName) {
        String normalizedRoute = blankToEmpty(routePattern)
                .replace("/api/", "")
                .replace('/', '_')
                .replace("{", "")
                .replace("}", "");
        return truncate((blankToEmpty(httpMethod) + "_" + normalizedRoute + "_" + blankToEmpty(methodName))
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "")
                .toUpperCase(Locale.ROOT), MAX_ACTION_CODE_LENGTH);
    }

    /**
     * 生成默认动作名称。
     */
    public static String deriveActionName(String httpMethod, String routePattern, String methodName) {
        return truncate(blankToEmpty(httpMethod) + " " + blankToEmpty(routePattern) + " " + blankToEmpty(methodName),
                MAX_ACTION_NAME_LENGTH);
    }

    /**
     * 构建最终写入数据库的请求摘要。
     */
    public static String buildRequestSnapshot(HttpServletRequest request,
                                              OperationLogContext context,
                                              ObjectMapper objectMapper) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        root.put("contentType", blankToEmpty(request.getContentType()));
        root.set("pathVariables", sanitizePathVariables(request));
        root.set("query", sanitizeParameterMap(request.getParameterMap()));
        JsonNode requestBody = sanitizeRequestBodyNode(context == null ? null : context.getRequestBody());
        if (requestBody != null && !requestBody.isMissingNode()) {
            root.set("body", requestBody);
        }
        if (request instanceof MultipartHttpServletRequest multipartRequest) {
            JsonNode filesNode = buildMultipartFilesNode(multipartRequest);
            if (filesNode != null) {
                root.set("files", filesNode);
            }
        }
        String snapshot;
        try {
            snapshot = objectMapper.writeValueAsString(root);
        } catch (Exception ex) {
            snapshot = "{\"message\":\"request snapshot serialize failed\"}";
        }
        return truncate(snapshot, MAX_REQUEST_SNAPSHOT_LENGTH);
    }

    /**
     * 从响应对象里反推当前操作者。
     */
    public static ActorSnapshot resolveActorSnapshot(ApiResponse<?> apiResponse, AuthContext authContext) {
        if (authContext != null && authContext.userId() != null) {
            return new ActorSnapshot(authContext.userId(), authContext.username(), authContext.nickname());
        }
        if (apiResponse == null || !apiResponse.success() || apiResponse.data() == null) {
            return ActorSnapshot.empty();
        }
        Object data = apiResponse.data();
        if (data instanceof LoginResult loginResult && loginResult.user() != null) {
            CurrentUserInfo user = loginResult.user();
            return new ActorSnapshot(user.id(), user.username(), user.nickname());
        }
        if (data instanceof CurrentUserInfo currentUserInfo) {
            return new ActorSnapshot(currentUserInfo.id(), currentUserInfo.username(), currentUserInfo.nickname());
        }
        return ActorSnapshot.empty();
    }

    /**
     * 解析代理链中的真实客户端 IP。
     */
    public static String extractIpAddress(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            return truncate(forwardedFor.split(",")[0].trim(), 64);
        }
        String realIp = request.getHeader("X-Real-IP");
        if (StringUtils.hasText(realIp)) {
            return truncate(realIp.trim(), 64);
        }
        return truncate(request.getRemoteAddr(), 64);
    }

    /**
     * 获取匹配到的路由模板。
     */
    public static String resolveRoutePattern(HttpServletRequest request) {
        Object attribute = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (attribute instanceof String pattern && StringUtils.hasText(pattern)) {
            return truncate(pattern, 255);
        }
        return truncate(request.getRequestURI(), 255);
    }

    /**
     * 安全截断文本，避免超出列长度。
     */
    public static String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        if (maxLength <= 0 || value.length() <= maxLength) {
            return value;
        }
        if (maxLength <= 6) {
            return value.substring(0, maxLength);
        }
        return value.substring(0, maxLength - 6) + "...";
    }

    private static JsonNode sanitizePathVariables(HttpServletRequest request) {
        Object attribute = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (!(attribute instanceof Map<?, ?> variables) || variables.isEmpty()) {
            return JsonNodeFactory.instance.objectNode();
        }
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        for (Map.Entry<?, ?> entry : variables.entrySet()) {
            String key = String.valueOf(entry.getKey());
            String value = entry.getValue() == null ? "" : String.valueOf(entry.getValue());
            root.put(key, isSensitiveField(key) ? "******" : truncate(value, MAX_STRING_VALUE_LENGTH));
        }
        return root;
    }

    private static JsonNode sanitizeRequestBodyNode(JsonNode requestBody) {
        if (requestBody == null || requestBody.isNull() || requestBody.isMissingNode()) {
            return null;
        }
        return sanitizeNode(requestBody, null);
    }

    private static JsonNode sanitizeNode(JsonNode node, String fieldName) {
        if (node == null || node.isNull()) {
            return JsonNodeFactory.instance.nullNode();
        }
        if (isSensitiveField(fieldName)) {
            return JsonNodeFactory.instance.textNode("******");
        }
        if (node.isObject()) {
            ObjectNode result = JsonNodeFactory.instance.objectNode();
            node.fields().forEachRemaining(entry -> result.set(entry.getKey(), sanitizeNode(entry.getValue(), entry.getKey())));
            return result;
        }
        if (node.isArray()) {
            ArrayNode result = JsonNodeFactory.instance.arrayNode();
            node.forEach(item -> result.add(sanitizeNode(item, fieldName)));
            return result;
        }
        if (node.isTextual()) {
            return JsonNodeFactory.instance.textNode(truncate(node.asText(), MAX_STRING_VALUE_LENGTH));
        }
        return node;
    }

    private static JsonNode buildMultipartFilesNode(MultipartHttpServletRequest request) {
        Map<String, List<MultipartFile>> multiFileMap = request.getMultiFileMap();
        if (multiFileMap == null || multiFileMap.isEmpty()) {
            return null;
        }
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        multiFileMap.forEach((name, files) -> {
            ArrayNode arrayNode = JsonNodeFactory.instance.arrayNode();
            for (MultipartFile file : files) {
                ObjectNode fileNode = JsonNodeFactory.instance.objectNode();
                fileNode.put("fileName", truncate(file.getOriginalFilename(), 255));
                fileNode.put("size", file.getSize());
                fileNode.put("contentType", truncate(file.getContentType(), 120));
                arrayNode.add(fileNode);
            }
            root.set(name, arrayNode);
        });
        return root;
    }

    private static ObjectNode sanitizeParameterMap(Map<String, String[]> parameterMap) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        if (parameterMap == null || parameterMap.isEmpty()) {
            return root;
        }
        for (Map.Entry<String, String[]> entry : parameterMap.entrySet()) {
            String key = entry.getKey();
            String[] values = entry.getValue();
            if (values == null || values.length == 0) {
                root.put(key, "");
                continue;
            }
            if (values.length == 1) {
                root.put(key, isSensitiveField(key) ? "******" : truncate(values[0], MAX_STRING_VALUE_LENGTH));
                continue;
            }
            ArrayNode arrayNode = JsonNodeFactory.instance.arrayNode();
            Arrays.stream(values)
                    .map(value -> isSensitiveField(key) ? "******" : truncate(value, MAX_STRING_VALUE_LENGTH))
                    .forEach(arrayNode::add);
            root.set(key, arrayNode);
        }
        return root;
    }

    private static String inferBizTypeFromParam(String paramName, String routePattern) {
        if (!StringUtils.hasText(paramName)) {
            return null;
        }
        if (!"id".equals(paramName)) {
            String trimmed = paramName.endsWith("Id") ? paramName.substring(0, paramName.length() - 2) : paramName;
            return toUpperSnakeCase(trimmed);
        }
        if (!StringUtils.hasText(routePattern)) {
            return null;
        }
        String[] segments = routePattern.split("/");
        for (int i = 0; i < segments.length; i++) {
            if (!"{id}".equals(segments[i])) {
                continue;
            }
            if (i > 0 && StringUtils.hasText(segments[i - 1])) {
                return singularizeToCode(segments[i - 1]);
            }
        }
        return null;
    }

    private static String singularizeToCode(String segment) {
        String normalized = segment.replace("{", "").replace("}", "");
        if (normalized.endsWith("ies") && normalized.length() > 3) {
            normalized = normalized.substring(0, normalized.length() - 3) + "y";
        } else if (normalized.endsWith("s") && normalized.length() > 1) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return toUpperSnakeCase(normalized);
    }

    private static String toUpperSnakeCase(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String normalized = value.trim()
                .replace('-', '_')
                .replace(' ', '_')
                .replaceAll("([a-z0-9])([A-Z])", "$1_$2")
                .replaceAll("[^A-Za-z0-9_]", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "");
        return normalized.toUpperCase(Locale.ROOT);
    }

    private static String firstPathSegment(String requestUri) {
        if (!StringUtils.hasText(requestUri)) {
            return "";
        }
        String[] segments = requestUri.split("/");
        for (String segment : segments) {
            if (!StringUtils.hasText(segment) || "api".equals(segment)) {
                continue;
            }
            return segment;
        }
        return requestUri;
    }

    private static Long parseLong(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String blankToNull(String value) {
        String result = blankToEmpty(value);
        return result.isEmpty() ? null : result;
    }

    private static Map<String, String> createModuleNameMapping() {
        Map<String, String> mapping = new LinkedHashMap<>();
        mapping.put("AUTH", "认证与账户");
        mapping.put("USER", "用户管理");
        mapping.put("ROLE", "角色管理");
        mapping.put("PERMISSION", "权限管理");
        mapping.put("PROJECT", "项目管理");
        mapping.put("ITERATION", "迭代管理");
        mapping.put("AGENT", "智能体管理");
        mapping.put("TASK", "任务管理");
        mapping.put("TEST_PLAN", "测试管理");
        mapping.put("DASHBOARD", "首页看板");
        mapping.put("GITLAB", "代码仓库");
        mapping.put("CICD", "持续集成");
        mapping.put("MODEL", "模型管理");
        mapping.put("NOTIFICATION", "通知中心");
        mapping.put("HERMES", "Hermes 助手");
        mapping.put("OPERATION_LOG", "操作日志");
        mapping.put("SHORTCUT", "快捷入口管理");
        mapping.put("ENV_VAR", "环境变量管理");
        return mapping;
    }

    /**
     * 业务主键解析结果。
     */
    public record ResolvedBizTarget(String bizType, Long bizId) {
    }

    /**
     * 统一的操作者快照。
     */
    public record ActorSnapshot(Long userId, String username, String nickname) {

        public static ActorSnapshot empty() {
            return new ActorSnapshot(null, null, null);
        }
    }
}
