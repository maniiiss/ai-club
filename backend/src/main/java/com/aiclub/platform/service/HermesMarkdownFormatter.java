package com.aiclub.platform.service;

import java.util.regex.Pattern;

/**
 * 收口 Hermes 最终回答中违反 CommonMark 语法边界的常见格式。
 * 业务意图：模型偶发遗漏强调标记后的空格或编号列表的条目边界；在持久化和最终 SSE 事件前修复，避免前端改写合法文本。
 */
public final class HermesMarkdownFormatter {

    private static final Pattern STRONG_FOLLOWED_BY_TEXT = Pattern.compile("(\\*\\*[^*\\r\\n]+\\*\\*)(?=\\p{L}|\\p{N})");
    private static final Pattern UNPADDED_UNORDERED_LIST_MARKER = Pattern.compile("(?m)^(\\s*[-+*])(?=\\S)");
    private static final Pattern UNPADDED_ORDERED_LIST_MARKER = Pattern.compile("(?m)^(\\s*\\d+[.)])(?=\\S)");
    private static final Pattern ORDERED_LIST_LINE = Pattern.compile("^\\s*\\d+[.)]\\s+");
    private static final Pattern GLUED_ORDERED_LIST_MARKER = Pattern.compile("(?<=[\\p{L}）)])(?=\\d+[.)](?=\\S))");

    private HermesMarkdownFormatter() {
    }

    public static String formatForDisplay(String content) {
        String normalized = content == null ? "" : content.replace("\r\n", "\n").replace('\r', '\n');
        normalized = STRONG_FOLLOWED_BY_TEXT.matcher(normalized).replaceAll("$1 ");
        normalized = normalizeListMarkerSpacing(normalized);
        normalized = splitGluedOrderedListItems(normalized);
        return normalizeListMarkerSpacing(normalized);
    }

    private static String normalizeListMarkerSpacing(String content) {
        return UNPADDED_ORDERED_LIST_MARKER.matcher(
                        UNPADDED_UNORDERED_LIST_MARKER.matcher(content).replaceAll("$1 ")
                )
                .replaceAll("$1 ");
    }

    private static String splitGluedOrderedListItems(String content) {
        String[] lines = content.split("\n", -1);
        StringBuilder result = new StringBuilder(content.length());
        for (int index = 0; index < lines.length; index += 1) {
            if (index > 0) {
                result.append('\n');
            }
            String line = lines[index];
            result.append(ORDERED_LIST_LINE.matcher(line).find()
                    ? GLUED_ORDERED_LIST_MARKER.matcher(line).replaceAll("\n")
                    : line);
        }
        return result.toString();
    }
}
