package com.aiclub.platform.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GitPilot 单轮回答的隐藏展示元数据。
 * 业务意图：让模型在同一轮回答中生成标题和追问，同时避免把控制信息暴露给用户。
 */
public record AssistantResponseMetadata(
        String content,
        String title,
        List<String> suggestions
) {

    private static final String MARKER_PREFIX = "<!-- gitpilot-meta:";
    private static final Pattern MARKER_PATTERN = Pattern.compile(
            "(?s)\\s*<!--\\s*gitpilot-meta:\\s*(\\{.*?})\\s*-->\\s*$"
    );
    private static final int MAX_TITLE_LENGTH = 100;
    private static final int MAX_SUGGESTIONS = 3;
    private static final int MAX_SUGGESTION_LENGTH = 120;

    public AssistantResponseMetadata {
        content = content == null ? "" : content.trim();
        title = title == null ? "" : trim(title, MAX_TITLE_LENGTH);
        suggestions = normalizeSuggestions(suggestions);
    }

    /**
     * 从模型回答末尾解析隐藏元数据；缺失或格式错误时保留正文并返回空元数据。
     */
    public static AssistantResponseMetadata parse(String rawContent, ObjectMapper objectMapper) {
        String source = rawContent == null ? "" : rawContent;
        Matcher matcher = MARKER_PATTERN.matcher(source);
        if (!matcher.find()) {
            return new AssistantResponseMetadata(source, "", List.of());
        }
        String content = source.substring(0, matcher.start()).trim();
        try {
            JsonNode root = objectMapper.readTree(matcher.group(1));
            String title = root.path("title").asText("");
            JsonNode suggestionsNode = root.has("followUps") ? root.path("followUps") : root.path("suggestions");
            List<String> suggestions = new ArrayList<>();
            if (suggestionsNode.isArray()) {
                for (JsonNode item : suggestionsNode) {
                    if (item.isTextual()) {
                        suggestions.add(item.asText());
                    }
                }
            }
            return new AssistantResponseMetadata(content, title, suggestions);
        } catch (Exception ignored) {
            return new AssistantResponseMetadata(content, "", List.of());
        }
    }

    /**
     * 返回流式过滤器识别元数据起点所需的保留前缀长度。
     */
    public static String markerPrefix() {
        return MARKER_PREFIX;
    }

    private static List<String> normalizeSuggestions(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        Set<String> unique = new LinkedHashSet<>();
        for (String value : values) {
            if (value == null || value.trim().isEmpty()) {
                continue;
            }
            unique.add(trim(value.trim(), MAX_SUGGESTION_LENGTH));
            if (unique.size() >= MAX_SUGGESTIONS) {
                break;
            }
        }
        return List.copyOf(unique);
    }

    private static String trim(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }
}
