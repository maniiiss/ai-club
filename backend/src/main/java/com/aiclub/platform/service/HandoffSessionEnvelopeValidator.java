package com.aiclub.platform.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Backend 侧 HandoffSessionEnvelope v1 校验器。
 * 业务意图：即使未来 CLI 或其他客户端绕过本地校验，平台落库/入队前仍不会接受凭据、私有对象或超限上下文。
 */
@Component
public class HandoffSessionEnvelopeValidator {

    public static final String PROTOCOL_VERSION = "v1";
    public static final int MAX_HISTORY_MESSAGES = 50;
    public static final int MAX_MESSAGE_BYTES = 16 * 1024;
    public static final int MAX_HISTORY_BYTES = 256 * 1024;
    public static final int MAX_SUMMARY_BYTES = 32 * 1024;
    public static final int MAX_CONTEXT_ITEM_COUNT = 50;
    public static final int MAX_CONTEXT_ITEM_BYTES = 1024;
    public static final int MAX_ENVELOPE_BYTES = 512 * 1024;

    public static final String HANDOFF_PROTOCOL_UNSUPPORTED = "HANDOFF_PROTOCOL_UNSUPPORTED";
    public static final String HANDOFF_ENVELOPE_TOO_LARGE = "HANDOFF_ENVELOPE_TOO_LARGE";
    public static final String HANDOFF_SENSITIVE_CONTENT = "HANDOFF_SENSITIVE_CONTENT";
    public static final String HANDOFF_INVALID_WORKSPACE = "HANDOFF_INVALID_WORKSPACE";

    private static final Set<String> ENVELOPE_FIELDS = Set.of(
            "protocolVersion", "sourceClient", "conversationHistory", "summary", "decisions", "pendingItems", "workspace");
    private static final Set<String> SOURCE_CLIENT_FIELDS = Set.of("runtimeCode", "runtimeVersion", "cliVersion");
    private static final Set<String> MESSAGE_FIELDS = Set.of("role", "content");
    private static final Set<String> WORKSPACE_FIELDS = Set.of("baseCommit", "handoffCommit", "currentBranch");
    private static final Pattern SENSITIVE_PATTERN = Pattern.compile(
            "(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|cli[_ -]?token|git[_ -]?token|private[_ -]?key|authorization)\\s*[:=]\\s*['\"]?[\\w./+=-]{8,}"
                    + "|(?:authorization\\s*:\\s*(?:bearer|basic)|x-api-key\\s*:)\\s*\\S+"
                    + "|\\b(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})\\b"
                    + "|\\bAKIA[0-9A-Z]{16}\\b"
                    + "|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"
                    + "|(^|[\\\\/])\\.env(?:$|[.\\\\/])"
                    + "|(?:^|\\s)(?:export\\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\\s*=\\s*\\S+",
            Pattern.CASE_INSENSITIVE);

    private final ObjectMapper objectMapper;

    public HandoffSessionEnvelopeValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 校验并返回同一棵 JsonNode，调用方可直接把结果交给后续 DTO 映射。 */
    public JsonNode validate(JsonNode envelope) {
        if (envelope == null || !envelope.isObject()) {
            throw error(HANDOFF_PROTOCOL_UNSUPPORTED, "handoff envelope 必须是 JSON 对象");
        }
        ensureEnvelopeSize(envelope);
        ensureFields(envelope, ENVELOPE_FIELDS, "handoff envelope 含有未知字段", HANDOFF_PROTOCOL_UNSUPPORTED);
        if (!text(envelope, "protocolVersion").equals(PROTOCOL_VERSION)) {
            throw error(HANDOFF_PROTOCOL_UNSUPPORTED, "不支持的 handoff protocol");
        }

        JsonNode sourceClient = requiredObject(envelope, "sourceClient", HANDOFF_PROTOCOL_UNSUPPORTED);
        ensureFields(sourceClient, SOURCE_CLIENT_FIELDS, "sourceClient 含有未知字段", HANDOFF_PROTOCOL_UNSUPPORTED);
        for (String field : SOURCE_CLIENT_FIELDS) requiredText(sourceClient, field, HANDOFF_PROTOCOL_UNSUPPORTED, 64);

        JsonNode history = envelope.get("conversationHistory");
        if (history == null || !history.isArray()) throw error(HANDOFF_PROTOCOL_UNSUPPORTED, "conversationHistory 必须是数组");
        if (history.size() > MAX_HISTORY_MESSAGES) throw error(HANDOFF_ENVELOPE_TOO_LARGE, "conversationHistory 超过条数限制");
        int historyBytes = 0;
        for (int index = 0; index < history.size(); index++) {
            JsonNode message = history.get(index);
            if (message == null || !message.isObject()) throw error(HANDOFF_PROTOCOL_UNSUPPORTED, "conversationHistory 项必须是对象");
            ensureFields(message, MESSAGE_FIELDS, "conversationHistory 含有未知字段", HANDOFF_PROTOCOL_UNSUPPORTED);
            String role = requiredText(message, "role", HANDOFF_PROTOCOL_UNSUPPORTED);
            if (!List.of("user", "assistant").contains(role)) throw error(HANDOFF_PROTOCOL_UNSUPPORTED, "conversationHistory role 不受支持");
            String content = requiredText(message, "content", HANDOFF_PROTOCOL_UNSUPPORTED);
            int bytes = utf8Bytes(content);
            if (bytes > MAX_MESSAGE_BYTES) throw error(HANDOFF_ENVELOPE_TOO_LARGE, "conversationHistory 单条消息超限");
            historyBytes += bytes;
        }
        if (historyBytes > MAX_HISTORY_BYTES) throw error(HANDOFF_ENVELOPE_TOO_LARGE, "conversationHistory 总大小超限");

        String summary = requiredString(envelope, "summary", HANDOFF_PROTOCOL_UNSUPPORTED);
        if (utf8Bytes(summary) > MAX_SUMMARY_BYTES) throw error(HANDOFF_ENVELOPE_TOO_LARGE, "summary 超过大小限制");
        validateContextItems(envelope, "decisions");
        validateContextItems(envelope, "pendingItems");

        JsonNode workspace = requiredObject(envelope, "workspace", HANDOFF_INVALID_WORKSPACE);
        ensureFields(workspace, WORKSPACE_FIELDS, "workspace 含有未知字段", HANDOFF_INVALID_WORKSPACE);
        requiredText(workspace, "baseCommit", HANDOFF_INVALID_WORKSPACE, 128);
        requiredText(workspace, "handoffCommit", HANDOFF_INVALID_WORKSPACE, 128);
        requiredText(workspace, "currentBranch", HANDOFF_INVALID_WORKSPACE, 512);
        scanSensitive(envelope);
        return envelope;
    }

    /** 供 Controller/Service 直接校验 Map/DTO，避免每个入口重复处理 JSON 转换。 */
    public JsonNode validate(Object envelope) {
        return validate(objectMapper.valueToTree(envelope));
    }

    private void validateContextItems(JsonNode envelope, String field) {
        JsonNode items = envelope.get(field);
        if (items == null || !items.isArray()) throw error(HANDOFF_PROTOCOL_UNSUPPORTED, field + " 必须是数组");
        if (items.size() > MAX_CONTEXT_ITEM_COUNT) throw error(HANDOFF_ENVELOPE_TOO_LARGE, field + " 超过条数限制");
        for (JsonNode item : items) {
            String value = item != null && item.isTextual() ? item.textValue() : "";
            if (value.isBlank()) throw error(HANDOFF_PROTOCOL_UNSUPPORTED, field + " 不能包含空字段");
            if (utf8Bytes(value) > MAX_CONTEXT_ITEM_BYTES) throw error(HANDOFF_ENVELOPE_TOO_LARGE, field + " 单项大小超限");
        }
    }

    private void ensureEnvelopeSize(JsonNode envelope) {
        try {
            if (objectMapper.writeValueAsBytes(envelope).length > MAX_ENVELOPE_BYTES) {
                throw error(HANDOFF_ENVELOPE_TOO_LARGE, "handoff envelope 超过大小限制");
            }
        } catch (JsonProcessingException exception) {
            throw error(HANDOFF_PROTOCOL_UNSUPPORTED, "handoff envelope 无法序列化");
        }
    }

    private JsonNode requiredObject(JsonNode parent, String field, String code) {
        JsonNode child = parent.get(field);
        if (child == null || !child.isObject()) throw error(code, field + " 必须是对象");
        return child;
    }

    private String requiredText(JsonNode parent, String field, String code) {
        return requiredText(parent, field, code, 0);
    }

    private String requiredText(JsonNode parent, String field, String code, int maxBytes) {
        String value = text(parent, field);
        if (value.isBlank()) throw error(code, field + " 必须是非空字符串");
        if (maxBytes > 0 && utf8Bytes(value) > maxBytes) throw error(HANDOFF_ENVELOPE_TOO_LARGE, field + " 超过大小限制");
        return value;
    }

    private String requiredString(JsonNode parent, String field, String code) {
        JsonNode value = parent.get(field);
        if (value == null || !value.isTextual()) throw error(code, field + " 必须是字符串");
        return value.textValue();
    }

    private String text(JsonNode parent, String field) {
        JsonNode value = parent.get(field);
        return value != null && value.isTextual() ? value.textValue() : "";
    }

    private void ensureFields(JsonNode object, Set<String> allowed, String message, String code) {
        Iterator<String> names = object.fieldNames();
        while (names.hasNext()) {
            if (!allowed.contains(names.next())) throw error(code, message);
        }
    }

    private void scanSensitive(JsonNode node) {
        if (node == null) return;
        if (node.isTextual() && SENSITIVE_PATTERN.matcher(node.textValue()).find()) {
            throw error(HANDOFF_SENSITIVE_CONTENT, "handoff 内容命中敏感信息规则");
        }
        if (node.isContainerNode()) node.elements().forEachRemaining(this::scanSensitive);
    }

    private int utf8Bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    private HandoffSessionEnvelopeValidationException error(String code, String message) {
        return new HandoffSessionEnvelopeValidationException(code, message);
    }

    public static final class HandoffSessionEnvelopeValidationException extends IllegalArgumentException {
        private final String code;

        public HandoffSessionEnvelopeValidationException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
