package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantMcpToolSummary;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * GitPilot 外部 MCP HTTP 客户端。
 * 业务意图：backend 统一持有用户凭证并负责 MCP 握手、工具发现和调用，Runtime 不接触长期密钥。
 */
@Service
public class ExternalMcpClient {

    private static final String PROTOCOL_VERSION = "2025-03-26";
    private static final int MAX_RESPONSE_LENGTH = 200_000;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final PlatformEnvVarResolver platformEnvVarResolver;
    private final String fallbackAllowedHosts;
    private final AtomicLong requestSequence = new AtomicLong(1);

    /** Spring 运行时构造函数；白名单实际通过环境变量解析器动态读取。 */
    @Autowired
    public ExternalMcpClient(ObjectMapper objectMapper,
                             PlatformEnvVarResolver platformEnvVarResolver,
                             @Value("${platform.assistant.external-mcp.connect-timeout-ms:5000}") int connectTimeoutMs,
                             @Value("${platform.assistant.external-mcp.request-timeout-ms:20000}") int requestTimeoutMs) {
        this(objectMapper, platformEnvVarResolver, connectTimeoutMs, requestTimeoutMs, "");
    }

    /** 测试构造函数；允许 Mock MCP Server 使用 localhost 白名单，不依赖 Spring 容器。 */
    ExternalMcpClient(ObjectMapper objectMapper, int connectTimeoutMs, int requestTimeoutMs, String fallbackAllowedHosts) {
        this(objectMapper, null, connectTimeoutMs, requestTimeoutMs, fallbackAllowedHosts);
    }

    private ExternalMcpClient(ObjectMapper objectMapper,
                              PlatformEnvVarResolver platformEnvVarResolver,
                              int connectTimeoutMs,
                              int requestTimeoutMs,
                              String fallbackAllowedHosts) {
        this.objectMapper = objectMapper;
        this.platformEnvVarResolver = platformEnvVarResolver;
        this.fallbackAllowedHosts = fallbackAllowedHosts == null ? "" : fallbackAllowedHosts;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.max(1000, connectTimeoutMs)))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
        this.requestTimeoutMs = Math.max(1000, requestTimeoutMs);
    }

    private final int requestTimeoutMs;

    /**
     * 连接远程 MCP 服务并读取服务信息和工具目录。
     */
    public DiscoveryResult discover(String endpointUrl, String transport, String authType, String credential) {
        URI endpoint = validateEndpoint(endpointUrl);
        String normalizedTransport = normalize(transport, "AUTO");
        try {
            RpcConnection connection = initialize(endpoint, authType, credential);
            JsonNode toolsResponse = sendRpc(connection.endpoint(), authType, credential, connection.sessionId(),
                    "tools/list", objectMapper.createObjectNode());
            return parseDiscovery(connection.serverInfo(), toolsResponse);
        } catch (RuntimeException firstFailure) {
            if (!"AUTO".equals(normalizedTransport) && !"SSE".equals(normalizedTransport)) {
                throw firstFailure;
            }
            URI sseMessageEndpoint = resolveSseMessageEndpoint(endpoint, authType, credential);
            RpcConnection connection = initialize(sseMessageEndpoint, authType, credential);
            JsonNode toolsResponse = sendRpc(connection.endpoint(), authType, credential, connection.sessionId(),
                    "tools/list", objectMapper.createObjectNode());
            return parseDiscovery(connection.serverInfo(), toolsResponse);
        }
    }

    /**
     * 调用指定外部 MCP 工具并将结果压缩为可供 Runtime 继续推理的文本。
     */
    public String call(String endpointUrl,
                       String transport,
                       String authType,
                       String credential,
                       String toolName,
                       Map<String, Object> arguments) {
        URI endpoint = validateEndpoint(endpointUrl);
        try {
            RpcConnection connection = initialize(endpoint, authType, credential);
            return callOnConnection(connection, authType, credential, toolName, arguments);
        } catch (RuntimeException firstFailure) {
            if (!"AUTO".equals(normalize(transport, "AUTO")) && !"SSE".equals(normalize(transport, "AUTO"))) {
                throw firstFailure;
            }
            URI sseMessageEndpoint = resolveSseMessageEndpoint(endpoint, authType, credential);
            RpcConnection connection = initialize(sseMessageEndpoint, authType, credential);
            return callOnConnection(connection, authType, credential, toolName, arguments);
        }
    }

    private String callOnConnection(RpcConnection connection,
                                    String authType,
                                    String credential,
                                    String toolName,
                                    Map<String, Object> arguments) {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("name", toolName);
        params.set("arguments", objectMapper.valueToTree(arguments == null ? Map.of() : arguments));
        JsonNode response = sendRpc(connection.endpoint(), authType, credential, connection.sessionId(), "tools/call", params);
        JsonNode result = response.path("result");
        if (result.path("isError").asBoolean(false)) {
            throw new IllegalStateException("外部 MCP 工具返回错误：" + extractContent(result.path("content")));
        }
        String content = extractContent(result.path("content"));
        if (content.isBlank() && result.has("structuredContent")) {
            content = result.path("structuredContent").toString();
        }
        return limit(content.isBlank() ? response.toString() : content);
    }

    private RpcConnection initialize(URI endpoint, String authType, String credential) {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("protocolVersion", PROTOCOL_VERSION);
        params.set("capabilities", objectMapper.createObjectNode());
        ObjectNode clientInfo = params.putObject("clientInfo");
        clientInfo.put("name", "gitpilot");
        clientInfo.put("version", "1.0");
        JsonNode response = sendRpc(endpoint, authType, credential, "", "initialize", params);
        String sessionId = response.path("_sessionId").asText("");
        JsonNode serverInfo = response.path("result").path("serverInfo");
        sendNotification(endpoint, authType, credential, sessionId, "notifications/initialized");
        return new RpcConnection(endpoint, sessionId, serverInfo);
    }

    private JsonNode sendRpc(URI endpoint,
                             String authType,
                             String credential,
                             String sessionId,
                             String method,
                             JsonNode params) {
        try {
            ObjectNode request = objectMapper.createObjectNode();
            request.put("jsonrpc", "2.0");
            request.put("id", requestSequence.getAndIncrement());
            request.put("method", method);
            request.set("params", params == null ? objectMapper.createObjectNode() : params);
            HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofMillis(requestTimeoutMs))
                    .header("Accept", "application/json, text/event-stream")
                    .header("Content-Type", "application/json");
            applyAuthentication(builder, authType, credential);
            if (sessionId != null && !sessionId.isBlank()) {
                builder.header("Mcp-Session-Id", sessionId);
            }
            HttpResponse<String> response = httpClient.send(
                    builder.POST(HttpRequest.BodyPublishers.ofString(request.toString(), StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("外部 MCP 请求失败，HTTP " + response.statusCode());
            }
            JsonNode parsed = parseResponse(response.body());
            if (parsed.has("error")) {
                throw new IllegalStateException("外部 MCP 返回协议错误：" + parsed.path("error").toString());
            }
            if (response.headers().firstValue("Mcp-Session-Id").isPresent()) {
                ((ObjectNode) parsed).put("_sessionId", response.headers().firstValue("Mcp-Session-Id").orElse(""));
            }
            return parsed;
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException("外部 MCP 请求异常：" + safeMessage(exception), exception);
        }
    }

    private void sendNotification(URI endpoint, String authType, String credential, String sessionId, String method) {
        try {
            ObjectNode request = objectMapper.createObjectNode();
            request.put("jsonrpc", "2.0");
            request.put("method", method);
            HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofMillis(requestTimeoutMs))
                    .header("Accept", "application/json, text/event-stream")
                    .header("Content-Type", "application/json");
            applyAuthentication(builder, authType, credential);
            if (sessionId != null && !sessionId.isBlank()) builder.header("Mcp-Session-Id", sessionId);
            httpClient.send(builder.POST(HttpRequest.BodyPublishers.ofString(request.toString(), StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.discarding());
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException("外部 MCP 初始化通知失败：" + safeMessage(exception), exception);
        }
    }

    private URI resolveSseMessageEndpoint(URI endpoint, String authType, String credential) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofMillis(requestTimeoutMs))
                    .header("Accept", "text/event-stream");
            applyAuthentication(builder, authType, credential);
            HttpResponse<InputStream> response = httpClient.send(builder.GET().build(), HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("外部 MCP SSE 连接失败，HTTP " + response.statusCode());
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String event = "";
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) event = line.substring(6).trim();
                    if (line.startsWith("data:") && (event.isBlank() || "endpoint".equalsIgnoreCase(event))) {
                        String value = line.substring(5).trim();
                        if (!value.isBlank()) return validateEndpoint(endpoint.resolve(value).toString());
                    }
                }
            }
            throw new IllegalStateException("外部 MCP SSE 未返回消息端点");
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException("外部 MCP SSE 握手失败：" + safeMessage(exception), exception);
        }
    }

    private DiscoveryResult parseDiscovery(JsonNode initializeResponse, JsonNode toolsResponse) {
        JsonNode serverInfo = initializeResponse == null ? objectMapper.createObjectNode() : initializeResponse;
        List<AssistantMcpToolSummary> tools = new ArrayList<>();
        JsonNode toolArray = toolsResponse.path("result").path("tools");
        if (!toolArray.isArray()) throw new IllegalStateException("外部 MCP 未返回有效工具目录");
        for (JsonNode tool : toolArray) {
            String name = tool.path("name").asText("").trim();
            if (name.isBlank()) continue;
            JsonNode annotations = tool.path("annotations");
            boolean readOnly = annotations.path("readOnlyHint").asBoolean(false)
                    && !annotations.path("destructiveHint").asBoolean(false);
            tools.add(new AssistantMcpToolSummary("", name, tool.path("description").asText(""),
                    readOnly, !readOnly, tool.path("inputSchema")));
        }
        return new DiscoveryResult(serverInfo.path("name").asText(""), serverInfo.path("version").asText(""), tools);
    }

    private JsonNode parseResponse(String body) {
        String normalized = limit(body).trim();
        if (normalized.isBlank()) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(normalized);
        } catch (Exception ignored) {
            StringBuilder data = new StringBuilder();
            for (String line : normalized.split("\\R")) {
                if (line.startsWith("data:")) data.append(line.substring(5).trim());
            }
            if (data.isEmpty()) throw new IllegalStateException("外部 MCP 返回内容不是 JSON 或 SSE");
            try { return objectMapper.readTree(data.toString()); }
            catch (Exception exception) { throw new IllegalStateException("外部 MCP SSE 数据格式无效", exception); }
        }
    }

    private String extractContent(JsonNode content) {
        if (!content.isArray()) return content.isMissingNode() ? "" : content.asText("");
        StringBuilder builder = new StringBuilder();
        for (JsonNode item : content) {
            String text = item.path("text").asText("");
            if (!text.isBlank()) builder.append(text);
            else if (item.has("data")) builder.append(item.path("data").asText(""));
        }
        return builder.toString();
    }

    private URI validateEndpoint(String endpointUrl) {
        try {
            URI endpoint = URI.create(endpointUrl == null ? "" : endpointUrl.trim());
            if (!"http".equalsIgnoreCase(endpoint.getScheme()) && !"https".equalsIgnoreCase(endpoint.getScheme())) {
                throw new IllegalArgumentException("MCP 地址必须使用 HTTP 或 HTTPS");
            }
            if (endpoint.getHost() == null || endpoint.getUserInfo() != null) {
                throw new IllegalArgumentException("MCP 地址格式不正确");
            }
            if (!isNetworkAllowed(endpoint)) throw new IllegalArgumentException("MCP 地址不在管理员允许的网络范围内");
            return endpoint;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("MCP 地址格式不正确", exception);
        }
    }

    private boolean isNetworkAllowed(URI endpoint) {
        String host = endpoint.getHost().toLowerCase(Locale.ROOT);
        boolean privateHost = host.equals("localhost") || host.endsWith(".localhost") || host.equals("metadata.google.internal");
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                privateHost |= address.isAnyLocalAddress() || address.isLoopbackAddress()
                        || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                        || address.isMulticastAddress() || address.getHostAddress().equals("169.254.169.254");
            }
        } catch (Exception ignored) {
            // DNS 失败交给实际连接报错；不因为解析失败绕过白名单。
        }
        if (privateHost) return matchesAllowlist(host);
        return "https".equalsIgnoreCase(endpoint.getScheme()) || matchesAllowlist(host);
    }

    private boolean matchesAllowlist(String host) {
        for (String rule : resolveAllowedHosts()) {
            if (host.equals(rule) || host.endsWith("." + rule)) return true;
            if (!rule.contains("/")) continue;
            try {
                String[] parts = rule.split("/", 2);
                InetAddress network = InetAddress.getByName(parts[0]);
                int prefix = Integer.parseInt(parts[1]);
                for (InetAddress address : InetAddress.getAllByName(host)) {
                    if (sameNetwork(network, address, prefix)) return true;
                }
            } catch (Exception ignored) {
                // 非法白名单项不应阻断其他合法规则，也不能放宽默认网络策略。
            }
        }
        return false;
    }

    /** 判断两个地址是否命中同一个管理员 CIDR 网段。 */
    private boolean sameNetwork(InetAddress left, InetAddress right, int prefixLength) {
        byte[] leftBytes = left.getAddress();
        byte[] rightBytes = right.getAddress();
        if (leftBytes.length != rightBytes.length || prefixLength < 0 || prefixLength > leftBytes.length * 8) return false;
        int fullBytes = prefixLength / 8;
        int remainingBits = prefixLength % 8;
        for (int index = 0; index < fullBytes; index++) if (leftBytes[index] != rightBytes[index]) return false;
        if (remainingBits == 0) return true;
        int mask = 0xFF << (8 - remainingBits);
        return (leftBytes[fullBytes] & mask) == (rightBytes[fullBytes] & mask);
    }

    private void applyAuthentication(HttpRequest.Builder builder, String authType, String credential) {
        String type = normalize(authType, "NONE");
        if (credential == null || credential.isBlank() || "NONE".equals(type)) return;
        if ("BEARER".equals(type)) builder.header("Authorization", "Bearer " + credential.trim());
        else if ("API_KEY".equals(type)) builder.header("X-API-Key", credential.trim());
        else throw new IllegalArgumentException("不支持的 MCP 认证方式：" + type);
    }

    private List<String> splitAllowedHosts(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return java.util.Arrays.stream(raw.split(","))
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .filter(value -> !value.isBlank())
                .toList();
    }

    /** 动态读取环境变量管理中的白名单，保证管理员修改后无需重启 backend。 */
    private List<String> resolveAllowedHosts() {
        String raw = platformEnvVarResolver == null
                ? fallbackAllowedHosts
                : platformEnvVarResolver.resolveOptional(
                        PlatformEnvVarRegistry.KEY_ASSISTANT_EXTERNAL_MCP_ALLOWED_HOSTS,
                        () -> fallbackAllowedHosts);
        return splitAllowedHosts(raw);
    }

    private String normalize(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim().toUpperCase(Locale.ROOT);
    }

    private String limit(String value) {
        if (value == null) return "";
        return value.length() <= MAX_RESPONSE_LENGTH ? value : value.substring(0, MAX_RESPONSE_LENGTH);
    }

    private String safeMessage(Exception exception) {
        String message = exception == null ? "" : exception.getMessage();
        return message == null || message.isBlank() ? "未知错误" : limit(message);
    }

    /** MCP 连接发现结果。 */
    public record DiscoveryResult(String serverName, String serverVersion, List<AssistantMcpToolSummary> tools) {
        public DiscoveryResult { tools = tools == null ? List.of() : List.copyOf(tools); }
    }

    private record RpcConnection(URI endpoint, String sessionId, JsonNode serverInfo) { }
}
