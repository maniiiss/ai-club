package com.aiclub.platform.util;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 需求模板文档工具。
 */
public final class RequirementDocumentUtils {

    /**
     * 用户故事章节标题。
     */
    public static final String USER_STORY_TITLE = "用户故事";

    /**
     * 需求描述章节标题。
     */
    public static final String REQUIREMENT_DESCRIPTION_TITLE = "需求描述";

    /**
     * 验收标准章节标题。
     */
    public static final String ACCEPTANCE_CRITERIA_TITLE = "验收标准";

    private static final Pattern LEVEL_TWO_HEADING_PATTERN = Pattern.compile("(?m)^##\\s+(.+?)\\s*$");

    private RequirementDocumentUtils() {
    }

    /**
     * 规范化需求 Markdown 文档的换行与首尾空白。
     */
    public static String normalizeDocument(String markdown) {
        return defaultString(markdown)
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .trim();
    }

    /**
     * 返回默认的需求模板。
     */
    public static String defaultTemplate() {
        return """
                ## 用户故事

                ## 需求描述

                ## 验收标准
                """.trim();
    }

    /**
     * 校验需求文档是否满足固定章节与正文必填规则。
     */
    public static void validateForSubmit(String markdown) {
        String normalized = normalizeDocument(markdown);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("需求文档不能为空");
        }

        List<Section> sections = extractSections(normalized);
        List<String> actualTitles = sections.stream().map(Section::title).toList();
        List<String> expectedTitles = List.of(USER_STORY_TITLE, REQUIREMENT_DESCRIPTION_TITLE, ACCEPTANCE_CRITERIA_TITLE);
        if (!expectedTitles.equals(actualTitles)) {
            throw new IllegalArgumentException("需求文档必须且仅能包含：## 用户故事、## 需求描述、## 验收标准");
        }

        for (Section section : sections) {
            if (section.content().isBlank()) {
                throw new IllegalArgumentException("章节「" + section.title() + "」内容不能为空");
            }
        }
    }

    /**
     * 判断文档是否已经匹配新模板的章节结构。
     */
    public static boolean matchesTemplateHeadings(String markdown) {
        String normalized = normalizeDocument(markdown);
        if (normalized.isBlank()) {
            return false;
        }
        List<String> actualTitles = extractSections(normalized).stream().map(Section::title).toList();
        return List.of(USER_STORY_TITLE, REQUIREMENT_DESCRIPTION_TITLE, ACCEPTANCE_CRITERIA_TITLE).equals(actualTitles);
    }

    /**
     * 提取需求文档中的二级章节。
     */
    private static List<Section> extractSections(String markdown) {
        Matcher matcher = LEVEL_TWO_HEADING_PATTERN.matcher(markdown);
        List<HeadingMatch> matches = new ArrayList<>();
        while (matcher.find()) {
            matches.add(new HeadingMatch(matcher.group(1).trim(), matcher.start(), matcher.end()));
        }

        List<Section> sections = new ArrayList<>();
        for (int index = 0; index < matches.size(); index++) {
            HeadingMatch current = matches.get(index);
            int contentEnd = index + 1 < matches.size() ? matches.get(index + 1).start() : markdown.length();
            String content = markdown.substring(current.end(), contentEnd).trim();
            sections.add(new Section(current.title(), content));
        }
        return sections;
    }

    private static String defaultString(String value) {
        return value == null ? "" : value;
    }

    /**
     * 标题匹配结果。
     */
    private record HeadingMatch(
            String title,
            int start,
            int end
    ) {
    }

    /**
     * 需求章节内容。
     */
    private record Section(
            String title,
            String content
    ) {
    }
}
