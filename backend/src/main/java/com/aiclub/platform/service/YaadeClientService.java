package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * Yaade HTTP API 客户端。
 * 统一封装本地登录、用户管理、collection 管理和嵌入代理原始转发能力。
 */
@Service
public class YaadeClientService {

    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);

    private final YaadeProperties yaadeProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public YaadeClientService(YaadeProperties yaadeProperties, ObjectMapper objectMapper) {
        this(
                yaadeProperties,
                objectMapper,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build()
        );
    }

    YaadeClientService(YaadeProperties yaadeProperties, ObjectMapper objectMapper, HttpClient httpClient) {
        this.yaadeProperties = yaadeProperties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    public YaadeSession loginAdmin() {
        return login(yaadeProperties.getAdminUsername(), yaadeProperties.getAdminPassword());
    }

    public YaadeSession login(String username, String password) {
        ObjectNode payload = objectMapper.createObjectNode()
                .put("username", username)
                .put("password", password);
        RawResponse response = send(
                "POST",
                "/api/login",
                null,
                Map.of(HttpHeaders.CONTENT_TYPE, "application/json"),
                bodyBytes(payload),
                DEFAULT_TIMEOUT
        );
        if (!response.isSuccess()) {
            throw new IllegalStateException("Yaade 登录失败，状态码: " + response.statusCode());
        }
        String cookieHeader = buildCookieHeader(response.setCookieHeaders());
        if (cookieHeader.isBlank()) {
            throw new IllegalStateException("Yaade 登录成功但未返回会话 Cookie");
        }
        return new YaadeSession(cookieHeader);
    }

    public void changeOwnPassword(YaadeSession session, String currentPassword, String newPassword) {
        ObjectNode payload = objectMapper.createObjectNode()
                .put("currentPassword", currentPassword)
                .put("newPassword", newPassword);
        RawResponse response = send(
                "PUT",
                "/api/user",
                session.cookieHeader(),
                Map.of(HttpHeaders.CONTENT_TYPE, "application/json"),
                bodyBytes(payload),
                DEFAULT_TIMEOUT
        );
        if (!response.isSuccess()) {
            throw new IllegalStateException("Yaade 修改用户密码失败，状态码: " + response.statusCode());
        }
    }

    public boolean isHealthy() {
        try {
            RawResponse response = send("GET", "/api/health", null, Map.of(), null, Duration.ofSeconds(10));
            return response.statusCode() < 500;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    public List<YaadeRemoteUser> listUsers(YaadeSession adminSession) {
        RawResponse response = send("GET", "/api/users", adminSession.cookieHeader(), Map.of(), null, DEFAULT_TIMEOUT);
        if (!response.isSuccess()) {
            throw new IllegalStateException("读取 Yaade 用户列表失败，状态码: " + response.statusCode());
        }
        List<YaadeRemoteUser> result = new ArrayList<>();
        JsonNode root = readTree(response.body());
        if (root.isArray()) {
            root.forEach(node -> result.add(toRemoteUser(node)));
        }
        return result;
    }

    public YaadeRemoteUser getUser(YaadeSession adminSession, Long userId) {
        RawResponse response = send("GET", "/api/users/" + userId, adminSession.cookieHeader(), Map.of(), null, DEFAULT_TIMEOUT);
        if (response.statusCode() == HttpStatus.NOT_FOUND.value()) {
            throw new NoSuchElementException("Yaade 用户不存在: " + userId);
        }
        if (!response.isSuccess()) {
            throw new IllegalStateException("读取 Yaade 用户失败，状态码: " + response.statusCode());
        }
        return toRemoteUser(readTree(response.body()));
    }

    public YaadeRemoteUser createUser(YaadeSession adminSession, String username, List<String> groups) {
        ObjectNode payload = objectMapper.createObjectNode()
                .put("username", username);
        ArrayNode groupArray = payload.putArray("groups");
        groups.forEach(groupArray::add);
        RawResponse response = send(
                "POST",
                "/api/users",
                adminSession.cookieHeader(),
                Map.of(HttpHeaders.CONTENT_TYPE, "application/json"),
                bodyBytes(payload),
                DEFAULT_TIMEOUT
        );
        if (!response.isSuccess()) {
            throw new IllegalStateException("创建 Yaade 用户失败，状态码: " + response.statusCode());
        }
        return toRemoteUser(readTree(response.body()));
    }

    public YaadeRemoteUser updateUserGroups(YaadeSession adminSession, Long userId, ObjectNode userData) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.set("data", userData);
        RawResponse response = send(
                "PUT",
                "/api/users/" + userId,
                adminSession.cookieHeader(),
                Map.of(HttpHeaders.CONTENT_TYPE, "application/json"),
                bodyBytes(payload),
                DEFAULT_TIMEOUT
        );
        if (!response.isSuccess()) {
            throw new IllegalStateException("更新 Yaade 用户分组失败，状态码: " + response.statusCode());
        }
        return getUser(adminSession, userId);
    }

    public void resetUserPassword(YaadeSession adminSession, Long userId) {
        RawResponse response = send(
                "PUT",
                "/api/users/" + userId + "/resetpassword",
                adminSession.cookieHeader(),
                Map.of(),
                null,
                DEFAULT_TIMEOUT
        );
        if (!response.isSuccess()) {
            throw new IllegalStateException("重置 Yaade 用户密码失败，状态码: " + response.statusCode());
        }
    }

    public List<YaadeRemoteCollection> listCollections(YaadeSession session) {
        RawResponse response = send("GET", "/api/collection", session.cookieHeader(), Map.of(), null, DEFAULT_TIMEOUT);
        if (!response.isSuccess()) {
            throw new IllegalStateException("读取 Yaade collection 列表失败，状态码: " + response.statusCode());
        }
        List<YaadeRemoteCollection> result = new ArrayList<>();
        JsonNode root = readTree(response.body());
        if (root.isArray()) {
            root.forEach(node -> flattenCollection(node, result));
        }
        return result;
    }

    public YaadeRemoteCollection createCollection(YaadeSession adminSession, String name, List<String> groups) {
        int nextRank = listCollections(adminSession).stream()
                .filter(collection -> collection.parentId() == null)
                .map(YaadeRemoteCollection::rank)
                .filter(Objects::nonNull)
                .max(Integer::compareTo)
                .orElse(-1) + 1;
        ObjectNode payload = objectMapper.createObjectNode()
                .put("name", name)
                .put("rank", nextRank);
        ArrayNode groupArray = payload.putArray("groups");
        groups.forEach(groupArray::add);
        RawResponse response = send(
                "POST",
                "/api/collection",
                adminSession.cookieHeader(),
                Map.of(HttpHeaders.CONTENT_TYPE, "application/json"),
                bodyBytes(payload),
                DEFAULT_TIMEOUT
        );
        if (!response.isSuccess()) {
            throw new IllegalStateException("创建 Yaade collection 失败，状态码: " + response.statusCode());
        }
        return toRemoteCollection((ObjectNode) readTree(response.body()));
    }

    public YaadeRemoteCollection updateCollection(YaadeSession adminSession, YaadeRemoteCollection collection) {
        RawResponse response = send(
                "PUT",
                "/api/collection",
                adminSession.cookieHeader(),
                Map.of(HttpHeaders.CONTENT_TYPE, "application/json"),
                bodyBytes(collection.raw()),
                DEFAULT_TIMEOUT
        );
        if (!response.isSuccess()) {
            throw new IllegalStateException("更新 Yaade collection 失败，状态码: " + response.statusCode());
        }
        return findCollectionById(adminSession, collection.id());
    }

    public YaadeRemoteCollection findCollectionById(YaadeSession session, Long collectionId) {
        return listCollections(session).stream()
                .filter(collection -> Objects.equals(collection.id(), collectionId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Yaade collection 不存在: " + collectionId));
    }

    public RawResponse forwardProxyRequest(String method,
                                           String relativePathWithQuery,
                                           String cookieHeader,
                                           Map<String, String> headers,
                                           byte[] body) {
        return send(method, relativePathWithQuery, cookieHeader, headers, body, Duration.ofMinutes(5));
    }

    private RawResponse send(String method,
                             String relativePathWithQuery,
                             String cookieHeader,
                             Map<String, String> headers,
                             byte[] body,
                             Duration timeout) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(buildUrl(relativePathWithQuery)))
                    .timeout(timeout == null ? DEFAULT_TIMEOUT : timeout);
            if (body == null || body.length == 0) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.method(method, HttpRequest.BodyPublishers.ofByteArray(body));
            }
            headers.forEach(builder::header);
            if (cookieHeader != null && !cookieHeader.isBlank()) {
                builder.header(HttpHeaders.COOKIE, cookieHeader);
            }
            HttpResponse<byte[]> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
            return new RawResponse(
                    response.statusCode(),
                    response.body(),
                    response.headers().map(),
                    response.headers().allValues("Set-Cookie")
            );
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw buildTransportException(method, relativePathWithQuery, ex);
        } catch (IOException ex) {
            throw buildTransportException(method, relativePathWithQuery, ex);
        }
    }

    /**
     * JDK HttpClient 在连接失败时经常只返回空 message，这里统一补全成可读提示，避免前端直接看到 `null`。
     */
    private IllegalStateException buildTransportException(String method, String relativePathWithQuery, Exception ex) {
        String requestSummary = method + " " + buildUrl(relativePathWithQuery);
        Throwable rootCause = rootCause(ex);
        if (ex instanceof ConnectException || rootCause instanceof ConnectException) {
            return new IllegalStateException("调用 Yaade 失败，无法连接 Yaade 服务: " + requestSummary, ex);
        }
        String detail = firstNonBlank(
                ex.getMessage(),
                rootCause == null ? null : rootCause.getMessage(),
                rootCause == null ? null : rootCause.getClass().getSimpleName(),
                ex.getClass().getSimpleName()
        );
        return new IllegalStateException("调用 Yaade 失败，" + requestSummary + "，原因: " + detail, ex);
    }

    private String buildUrl(String relativePathWithQuery) {
        String normalizedPath = relativePathWithQuery == null ? "" : relativePathWithQuery.trim();
        if (normalizedPath.isEmpty()) {
            normalizedPath = "/";
        }
        if (!normalizedPath.startsWith("/")) {
            normalizedPath = "/" + normalizedPath;
        }
        return yaadeProperties.getBaseUrl() + normalizedPath;
    }

    private Throwable rootCause(Throwable throwable) {
        Throwable current = throwable;
        while (current != null && current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current;
    }

    private JsonNode readTree(byte[] body) {
        try {
            return objectMapper.readTree(body == null ? new byte[0] : body);
        } catch (IOException ex) {
            throw new IllegalStateException("解析 Yaade 响应失败", ex);
        }
    }

    private byte[] bodyBytes(JsonNode payload) {
        try {
            return objectMapper.writeValueAsBytes(payload);
        } catch (IOException ex) {
            throw new IllegalStateException("序列化 Yaade 请求体失败", ex);
        }
    }

    private String buildCookieHeader(List<String> setCookieHeaders) {
        if (setCookieHeaders == null || setCookieHeaders.isEmpty()) {
            return "";
        }
        LinkedHashMap<String, String> cookies = new LinkedHashMap<>();
        for (String header : setCookieHeaders) {
            if (header == null || header.isBlank()) {
                continue;
            }
            String firstSegment = header.split(";", 2)[0];
            int separator = firstSegment.indexOf('=');
            if (separator <= 0) {
                continue;
            }
            String name = firstSegment.substring(0, separator).trim();
            String value = firstSegment.substring(separator + 1).trim();
            cookies.put(name, value);
        }
        return cookies.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + "; " + right)
                .orElse("");
    }

    private String firstNonBlank(String... values) {
        if (values == null || values.length == 0) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private void flattenCollection(JsonNode node, List<YaadeRemoteCollection> result) {
        if (node instanceof ObjectNode objectNode) {
            result.add(toRemoteCollection(objectNode));
            JsonNode children = objectNode.path("children");
            if (children.isArray()) {
                children.forEach(child -> flattenCollection(child, result));
            }
        }
    }

    private YaadeRemoteCollection toRemoteCollection(ObjectNode raw) {
        ObjectNode data = raw.path("data") instanceof ObjectNode dataNode ? dataNode.deepCopy() : objectMapper.createObjectNode();
        ArrayNode groups = data.path("groups") instanceof ArrayNode groupArray ? groupArray.deepCopy() : objectMapper.createArrayNode();
        ArrayNode requests = raw.path("requests") instanceof ArrayNode requestArray ? requestArray.deepCopy() : objectMapper.createArrayNode();
        ArrayNode scripts = raw.path("scripts") instanceof ArrayNode scriptArray ? scriptArray.deepCopy() : objectMapper.createArrayNode();
        ArrayNode children = raw.path("children") instanceof ArrayNode childArray ? childArray.deepCopy() : objectMapper.createArrayNode();
        ObjectNode normalized = objectMapper.createObjectNode()
                .put("id", raw.path("id").asLong())
                .put("ownerId", raw.path("ownerId").asLong())
                .put("version", raw.path("version").asText("1.0.0"));
        normalized.set("data", data.deepCopy());
        normalized.set("requests", requests);
        normalized.set("scripts", scripts);
        if (!children.isEmpty()) {
            normalized.set("children", children);
        }
        return new YaadeRemoteCollection(
                raw.path("id").asLong(),
                raw.path("ownerId").asLong(),
                raw.path("version").asText("1.0.0"),
                data.path("name").asText(""),
                data.path("parentId").isMissingNode() || data.path("parentId").isNull() ? null : data.path("parentId").asLong(),
                data.path("rank").isNumber() ? data.path("rank").asInt() : null,
                groupsToList(groups),
                normalized
        );
    }

    private YaadeRemoteUser toRemoteUser(JsonNode raw) {
        ObjectNode data = raw.path("data") instanceof ObjectNode dataNode ? dataNode.deepCopy() : objectMapper.createObjectNode();
        return new YaadeRemoteUser(
                raw.path("id").asLong(),
                raw.path("username").asText(""),
                data,
                groupsToList(data.path("groups"))
        );
    }

    private List<String> groupsToList(JsonNode groupsNode) {
        List<String> result = new ArrayList<>();
        if (groupsNode != null && groupsNode.isArray()) {
            groupsNode.forEach(node -> result.add(node.asText("")));
        }
        return result.stream()
                .filter(item -> item != null && !item.isBlank())
                .distinct()
                .toList();
    }

    public record YaadeSession(String cookieHeader) {
    }

    public record YaadeRemoteUser(Long id, String username, ObjectNode data, List<String> groups) {

        public ObjectNode withGroups(List<String> newGroups) {
            ObjectNode copied = data.deepCopy();
            ArrayNode groupsNode = copied.putArray("groups");
            newGroups.forEach(groupsNode::add);
            return copied;
        }
    }

    public record YaadeRemoteCollection(Long id,
                                        Long ownerId,
                                        String version,
                                        String name,
                                        Long parentId,
                                        Integer rank,
                                        List<String> groups,
                                        ObjectNode raw) {

        public YaadeRemoteCollection withNameAndGroups(ObjectMapper objectMapper, String newName, List<String> newGroups) {
            ObjectNode copied = raw.deepCopy();
            ObjectNode dataNode = copied.path("data") instanceof ObjectNode data ? data : objectMapper.createObjectNode();
            dataNode.put("name", newName);
            ArrayNode groupsNode = objectMapper.createArrayNode();
            newGroups.forEach(groupsNode::add);
            dataNode.set("groups", groupsNode);
            copied.set("data", dataNode);
            return new YaadeRemoteCollection(
                    id,
                    ownerId,
                    version,
                    newName,
                    parentId,
                    rank,
                    newGroups,
                    copied
            );
        }
    }

    public record RawResponse(int statusCode,
                              byte[] body,
                              Map<String, List<String>> headers,
                              List<String> setCookieHeaders) {

        public boolean isSuccess() {
            return statusCode >= 200 && statusCode < 300;
        }

        public String bodyAsString() {
            return new String(body == null ? new byte[0] : body, StandardCharsets.UTF_8);
        }

        public String contentType() {
            return firstHeaderValue(HttpHeaders.CONTENT_TYPE);
        }

        public boolean isUnauthorized() {
            return statusCode == HttpStatus.UNAUTHORIZED.value()
                    || statusCode == HttpStatus.FORBIDDEN.value()
                    || (statusCode >= 300 && statusCode < 400 && firstHeaderValue(HttpHeaders.LOCATION).toLowerCase(Locale.ROOT).contains("/api/login"));
        }

        public String firstHeaderValue(String headerName) {
            if (headerName == null || headers == null) {
                return "";
            }
            return headers.entrySet().stream()
                    .filter(entry -> headerName.equalsIgnoreCase(entry.getKey()))
                    .map(Map.Entry::getValue)
                    .filter(values -> values != null && !values.isEmpty())
                    .map(values -> values.get(0))
                    .findFirst()
                    .orElse("");
        }
    }
}
