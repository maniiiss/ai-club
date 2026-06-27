package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.dto.ApiTestAssertionSuggestion;
import com.aiclub.platform.dto.ApiTestCaseAiResult;
import com.aiclub.platform.dto.ApiTestCaseSuggestion;
import com.aiclub.platform.dto.request.ApiTestGenerationRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.service.ApiTestContextSource.ApiTestGenerationContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 单接口 AI 测试用例生成服务。
 * V1 只生成可审核建议，不保存、不执行、不写回主接口表，避免把不确定的 AI 输出直接变成自动化资产。
 * 数据源通过 {@link ApiTestContextSource} 解耦，主实现为原生 API Studio。
 */
@Service
@Transactional(readOnly = true)
public class ApiTestCaseAiService {

    private static final int MAX_CASE_COUNT = 8;
    private static final String MASKED_VALUE = "***已脱敏***";
    private static final Pattern THINK_BLOCK_PATTERN = Pattern.compile("(?is)<think>.*?</think>");
    private static final Pattern JSON_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```json\\s*(\\{.*})\\s*```");
    private static final Pattern SECRET_ASSIGNMENT_PATTERN = Pattern.compile(
            "(?i)(authorization|cookie|token|password|secret|api[-_]?key|access[-_]?key|refresh[-_]?key)(\\s*[:=]\\s*)([^,;\\n\\r}]+)"
    );

    private final ApiTestContextSource contextSource;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final ModelConfigService modelConfigService;
    private final ObjectMapper objectMapper;

    public ApiTestCaseAiService(ApiTestContextSource contextSource,
                                AiModelConfigRepository aiModelConfigRepository,
                                ModelConfigService modelConfigService,
                                ObjectMapper objectMapper) {
        this.contextSource = contextSource;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.modelConfigService = modelConfigService;
        this.objectMapper = objectMapper;
    }

    public ApiTestCaseAiResult generate(Long projectId, Long endpointId, ApiTestGenerationRequest request) {
        ApiTestGenerationContext context = contextSource.requireContext(projectId, endpointId);
        AiModelConfigEntity modelConfig = resolveModelConfig(request == null ? null : request.modelConfigId());
        String raw = invokePrompt(modelConfig, buildUserPrompt(context));
        return parseResult(raw, context, modelConfig);
    }

    private String invokePrompt(AiModelConfigEntity modelConfig, String userPrompt) {
        return modelConfigService.invokePrompt(
                modelConfigService.resolveModelConfig(modelConfig.getId()),
                systemPrompt(),
                userPrompt,
                2800
        );
    }

    private AiModelConfigEntity resolveModelConfig(Long modelConfigId) {
        if (modelConfigId != null) {
            AiModelConfigEntity modelConfig = aiModelConfigRepository.findById(modelConfigId)
                    .orElseThrow(() -> new NoSuchElementException("模型配置不存在或未启用: " + modelConfigId));
            if (!Boolean.TRUE.equals(modelConfig.getEnabled())) {
                throw new NoSuchElementException("模型配置不存在或未启用: " + modelConfigId);
            }
            if (!isChatModelConfig(modelConfig)) {
                throw new IllegalArgumentException("API 测试用例 AI 仅支持对话模型配置");
            }
            return modelConfig;
        }
        return aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT).stream()
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("没有可用的已启用对话模型配置"));
    }

    private String systemPrompt() {
        return """
                你是资深接口测试工程师，请基于单个 REST API 契约生成结构化测试用例建议。
                严格要求：
                1. 只输出 JSON 对象，不要输出思考过程，不要输出 <think> 标签，不要使用 Markdown 代码块包裹 JSON。
                2. 最多生成 8 条用例，优先覆盖正向、必填缺失、类型错误、边界值、鉴权、权限、业务规则和响应断言。
                3. 不要编造生产环境地址、真实 token、真实密码或真实 API Key；请求样例中的敏感值必须继续使用占位符。
                4. 断言必须具体可执行，优先给出状态码、JSONPath、Header、Body 包含和响应耗时断言。
                5. JSON 格式必须严格如下：
                {
                  "markdown": "## 测试设计总览\n- ...",
                  "testCases": [
                    {
                      "title": "用例标题",
                      "caseType": "正向测试",
                      "priority": "P1",
                      "precondition": "前置条件",
                      "requestExample": "请求样例，可用 JSON 或 curl 片段",
                      "assertions": [
                        {
                          "type": "STATUS_CODE",
                          "target": "status",
                          "operator": "EQ",
                          "expected": "200",
                          "description": "响应状态码为 200"
                        }
                      ],
                      "riskNotes": "风险说明"
                    }
                  ]
                }
                6. caseType 仅允许：正向测试、异常测试、边界测试、鉴权测试、权限测试、性能测试、回归测试。
                7. priority 仅允许：P0、P1、P2、P3。
                8. assertion.type 仅允许：STATUS_CODE、JSON_PATH、HEADER、BODY_CONTAINS、RESPONSE_TIME。
                9. assertion.operator 仅允许：EQ、NE、CONTAINS、EXISTS、LTE、GTE。
                """;
    }

    private String buildUserPrompt(ApiTestGenerationContext context) {
        ObjectNode contextNode = objectMapper.createObjectNode();
        contextNode.put("projectName", defaultString(context.project().getName()));
        contextNode.put("collectionPath", defaultString(context.collectionPath()));
        contextNode.put("requestId", context.endpointId());
        contextNode.set("request", buildSanitizedRequestContext(context.requestData()));
        try {
            return "请基于以下已脱敏的 REST API 定义生成接口测试用例建议：\n"
                    + objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(contextNode);
        } catch (Exception exception) {
            throw new IllegalStateException("序列化 API 测试用例 AI 上下文失败", exception);
        }
    }

    private ObjectNode buildSanitizedRequestContext(JsonNode data) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", text(data, "name"));
        request.put("method", text(data, "method").toUpperCase(Locale.ROOT));
        request.put("path", normalizePath(text(data, "uri")));
        request.put("description", text(data, "description"));
        request.put("contentType", text(data, "contentType"));
        request.set("headers", sanitizeJson(data.path("headers"), "headers"));
        request.set("params", sanitizeJson(data.path("params"), "params"));
        request.set("formDataBody", sanitizeJson(data.path("formDataBody"), "formDataBody"));
        request.set("auth", sanitizeJson(data.path("auth"), "auth"));
        request.put("body", sanitizeBodyText(text(data, "body")));
        return request;
    }

    private JsonNode sanitizeJson(JsonNode node, String fieldName) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return NullNode.getInstance();
        }
        if (node.isObject()) {
            ObjectNode result = objectMapper.createObjectNode();
            boolean valueMaskedByKey = isSensitiveName(text(node, "key")) || isSensitiveName(text(node, "name"));
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                String childName = field.getKey();
                JsonNode child = field.getValue();
                if (("value".equalsIgnoreCase(childName) || "defaultValue".equalsIgnoreCase(childName)) && valueMaskedByKey) {
                    result.put(childName, MASKED_VALUE);
                } else if (isDirectSensitiveField(childName) && child.isValueNode()) {
                    result.put(childName, MASKED_VALUE);
                } else {
                    result.set(childName, sanitizeJson(child, childName));
                }
            }
            return result;
        }
        if (node.isArray()) {
            ArrayNode result = objectMapper.createArrayNode();
            for (JsonNode item : node) {
                result.add(sanitizeJson(item, fieldName));
            }
            return result;
        }
        if (node.isTextual()) {
            if (isDirectSensitiveField(fieldName)) {
                return TextNode.valueOf(MASKED_VALUE);
            }
            return TextNode.valueOf(sanitizeBodyText(node.asText()));
        }
        return node.deepCopy();
    }

    private String sanitizeBodyText(String value) {
        if (!hasText(value)) {
            return "";
        }
        String trimmed = value.trim();
        try {
            JsonNode parsed = objectMapper.readTree(trimmed);
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(sanitizeJson(parsed, "body"));
        } catch (Exception ignored) {
            Matcher matcher = SECRET_ASSIGNMENT_PATTERN.matcher(trimmed);
            return matcher.replaceAll(match -> match.group(1) + match.group(2) + MASKED_VALUE);
        }
    }

    private ApiTestCaseAiResult parseResult(String raw,
                                            ApiTestGenerationContext context,
                                            AiModelConfigEntity modelConfig) {
        try {
            JsonNode root = objectMapper.readTree(extractJsonObject(raw));
            List<ApiTestCaseSuggestion> cases = parseTestCases(root.path("testCases"));
            if (cases.isEmpty()) {
                throw new IllegalStateException("AI 未返回有效测试用例");
            }
            String markdown = trimToNull(root.path("markdown").asText(""));
            if (markdown == null) {
                markdown = buildFallbackMarkdown(cases);
            }
            JsonNode data = context.requestData();
            return new ApiTestCaseAiResult(
                    context.endpointId(),
                    defaultString(data.path("name").asText("")),
                    defaultString(data.path("method").asText("GET")).toUpperCase(Locale.ROOT),
                    normalizePath(data.path("uri").asText("/")),
                    markdown,
                    modelConfig.getId(),
                    modelConfig.getName(),
                    cases
            );
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("解析 API 测试用例 AI 结果失败", exception);
        }
    }

    private List<ApiTestCaseSuggestion> parseTestCases(JsonNode node) {
        List<ApiTestCaseSuggestion> result = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return result;
        }
        for (JsonNode item : node) {
            if (result.size() >= MAX_CASE_COUNT) {
                break;
            }
            String title = trimToNull(item.path("title").asText(""));
            if (title == null) {
                continue;
            }
            result.add(new ApiTestCaseSuggestion(
                    title,
                    normalizeCaseType(item.path("caseType").asText("")),
                    normalizePriority(item.path("priority").asText("")),
                    defaultString(item.path("precondition").asText("")),
                    stringifyNode(item.path("requestExample")),
                    parseAssertions(item.path("assertions")),
                    defaultString(item.path("riskNotes").asText(""))
            ));
        }
        return result;
    }

    private List<ApiTestAssertionSuggestion> parseAssertions(JsonNode node) {
        List<ApiTestAssertionSuggestion> result = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return result;
        }
        for (JsonNode item : node) {
            result.add(new ApiTestAssertionSuggestion(
                    normalizeAssertionType(item.path("type").asText("")),
                    defaultString(item.path("target").asText("")),
                    normalizeOperator(item.path("operator").asText("")),
                    stringifyNode(item.path("expected")),
                    defaultString(item.path("description").asText(""))
            ));
        }
        return result;
    }

    private String stringifyNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        if (node.isTextual()) {
            return defaultString(node.asText(""));
        }
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(node);
        } catch (Exception ignored) {
            return node.toString();
        }
    }

    private String extractJsonObject(String raw) {
        String cleaned = stripThinkingContent(raw);
        Matcher jsonCodeBlockMatcher = JSON_CODE_BLOCK_PATTERN.matcher(cleaned);
        if (jsonCodeBlockMatcher.find()) {
            return jsonCodeBlockMatcher.group(1).trim();
        }
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return cleaned.substring(start, end + 1).trim();
        }
        return cleaned.trim();
    }

    private String stripThinkingContent(String raw) {
        String cleaned = defaultString(raw);
        cleaned = THINK_BLOCK_PATTERN.matcher(cleaned).replaceAll("").trim();
        int closingThinkIndex = cleaned.toLowerCase(Locale.ROOT).indexOf("</think>");
        if (closingThinkIndex >= 0) {
            cleaned = cleaned.substring(closingThinkIndex + "</think>".length()).trim();
        }
        return cleaned;
    }

    private String buildFallbackMarkdown(List<ApiTestCaseSuggestion> cases) {
        StringBuilder builder = new StringBuilder("## 测试设计总览\n");
        builder.append("- 共生成 ").append(cases.size()).append(" 条接口测试用例建议。\n");
        for (ApiTestCaseSuggestion item : cases) {
            builder.append("- ").append(item.priority()).append(" ").append(item.caseType()).append("：").append(item.title()).append("\n");
        }
        return builder.toString().trim();
    }

    private String normalizeCaseType(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "正向测试";
        }
        return switch (normalized) {
            case "正向测试", "异常测试", "边界测试", "鉴权测试", "权限测试", "性能测试", "回归测试" -> normalized;
            default -> "正向测试";
        };
    }

    private String normalizePriority(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "P2";
        }
        return switch (normalized.toUpperCase(Locale.ROOT)) {
            case "P0", "P1", "P2", "P3" -> normalized.toUpperCase(Locale.ROOT);
            default -> "P2";
        };
    }

    private String normalizeAssertionType(String value) {
        String normalized = defaultString(value).toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "STATUS_CODE", "JSON_PATH", "HEADER", "BODY_CONTAINS", "RESPONSE_TIME" -> normalized;
            default -> "STATUS_CODE";
        };
    }

    private String normalizeOperator(String value) {
        String normalized = defaultString(value).toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "EQ", "NE", "CONTAINS", "EXISTS", "LTE", "GTE" -> normalized;
            default -> "EQ";
        };
    }

    private boolean isDirectSensitiveField(String fieldName) {
        String normalized = defaultString(fieldName).toLowerCase(Locale.ROOT).replace("_", "-");
        return normalized.equals("authorization")
                || normalized.equals("cookie")
                || normalized.equals("set-cookie")
                || normalized.contains("token")
                || normalized.contains("password")
                || normalized.contains("secret")
                || normalized.contains("api-key")
                || normalized.contains("apikey")
                || normalized.equals("x-api-key");
    }

    private boolean isSensitiveName(String value) {
        String normalized = defaultString(value).toLowerCase(Locale.ROOT).replace("_", "-");
        return normalized.contains("authorization")
                || normalized.contains("cookie")
                || normalized.contains("token")
                || normalized.contains("password")
                || normalized.contains("secret")
                || normalized.contains("api-key")
                || normalized.contains("apikey")
                || normalized.equals("key");
    }

    private String text(JsonNode node, String fieldName) {
        if (node == null || node.path(fieldName).isMissingNode() || node.path(fieldName).isNull()) {
            return "";
        }
        return node.path(fieldName).asText("");
    }

    private String normalizePath(String path) {
        String normalized = defaultString(path);
        if (!normalized.startsWith("/")) {
            normalized = "/" + normalized;
        }
        return normalized.replaceAll("/{2,}", "/");
    }

    private boolean isChatModelConfig(AiModelConfigEntity modelConfig) {
        return ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(defaultString(modelConfig.getModelType()));
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
