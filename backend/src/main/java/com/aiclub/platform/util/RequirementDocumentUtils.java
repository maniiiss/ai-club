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
     * Gitee 模板中的功能点章节标题。
     */
    public static final String GITEE_FUNCTION_POINT_TITLE = "功能点";

    /**
     * Gitee 模板中的流程图章节标题。
     */
    public static final String GITEE_FLOWCHART_TITLE = "流程图";

    /**
     * Gitee 模板中的原型章节标题。
     */
    public static final String GITEE_PROTOTYPE_TITLE = "原型";

    /**
     * Gitee 模板中的非功能需求章节标题。
     */
    public static final String GITEE_NON_FUNCTIONAL_REQUIREMENT_TITLE = "非功能需求";

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

    /**
     * 系统模板中的默认验收标准占位文案。
     */
    public static final String DEFAULT_ACCEPTANCE_CRITERIA_PLACEHOLDER = "待补充验收标准";

    /**
     * 系统模板中的默认用户故事占位文案。
     */
    public static final String DEFAULT_USER_STORY_PLACEHOLDER = "待补充用户故事";

    /**
     * 系统模板中的默认需求描述占位文案。
     */
    public static final String DEFAULT_REQUIREMENT_DESCRIPTION_PLACEHOLDER = "待补充需求描述";

    private static final Pattern SYSTEM_LEVEL_ONE_HEADING_PATTERN = Pattern.compile("(?m)^#\\s+(.+?)\\s*$");
    private static final Pattern GITEE_LEVEL_ONE_HEADING_PATTERN = Pattern.compile("(?m)^#\\s*(?:\\d+\\s+)?(.+?)\\s*$");
    private static final Pattern LEGACY_SYSTEM_HEADING_PATTERN = Pattern.compile("(?m)^##\\s*(用户故事|需求描述|验收标准)\\s*$");
    private static final Pattern LEGACY_GITEE_SUB_HEADING_PATTERN = Pattern.compile("(?m)^###\\s*(功能点|流程图|原型|非功能需求)\\s*$");
    private static final List<String> GITEE_TITLES = List.of(
            GITEE_FUNCTION_POINT_TITLE,
            GITEE_FLOWCHART_TITLE,
            GITEE_PROTOTYPE_TITLE,
            GITEE_NON_FUNCTIONAL_REQUIREMENT_TITLE
    );

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
                # 用户故事

                # 需求描述

                # 验收标准
                """.trim();
    }

    /**
     * 校验需求文档是否满足固定章节与正文必填规则。
     */
    public static void validateForSubmit(String markdown) {
        String normalized = normalizeSystemTemplateHeadings(markdown);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("需求文档不能为空");
        }

        List<Section> sections = extractSections(normalized);
        List<String> actualTitles = sections.stream().map(Section::title).toList();
        List<String> expectedTitles = List.of(USER_STORY_TITLE, REQUIREMENT_DESCRIPTION_TITLE, ACCEPTANCE_CRITERIA_TITLE);
        if (!expectedTitles.equals(actualTitles)) {
            throw new IllegalArgumentException("需求文档必须且仅能包含：# 用户故事、# 需求描述、# 验收标准");
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
        String normalized = normalizeSystemTemplateHeadings(markdown);
        if (normalized.isBlank()) {
            return false;
        }
        List<String> actualTitles = extractSections(normalized).stream().map(Section::title).toList();
        return List.of(USER_STORY_TITLE, REQUIREMENT_DESCRIPTION_TITLE, ACCEPTANCE_CRITERIA_TITLE).equals(actualTitles);
    }

    /**
     * 判断文档是否匹配 Gitee 的四段需求模板。
     * 这里允许远端缺少部分章节，只要命中了任意已知标题，就交给系统模板转换器处理。
     */
    public static boolean matchesGiteeTemplateHeadings(String markdown) {
        String normalized = normalizeDocument(markdown);
        if (normalized.isBlank()) {
            return false;
        }
        return extractLevelOneSections(normalized).stream()
                .map(Section::title)
                .anyMatch(GITEE_TITLES::contains);
    }

    /**
     * 把 Gitee 的四段需求模板转换成系统固定三段模板。
     * 系统模板永远是最终主格式，转换结果必须直接满足本地校验要求。
     */
    public static String convertFromGiteeTemplate(String markdown) {
        String normalized = normalizeDocument(markdown);
        if (normalized.isBlank()) {
            return defaultTemplate();
        }

        List<Section> sourceSections = extractLevelOneSections(normalized);
        if (sourceSections.isEmpty()) {
            return defaultTemplate();
        }

        String userStoryContent = DEFAULT_USER_STORY_PLACEHOLDER;
        String requirementDescriptionContent = buildRequirementDescriptionContent(sourceSections);

        return """
                # %s

                %s

                # %s

                %s

                # %s

                %s
                """.formatted(
                USER_STORY_TITLE,
                userStoryContent,
                REQUIREMENT_DESCRIPTION_TITLE,
                requirementDescriptionContent,
                ACCEPTANCE_CRITERIA_TITLE,
                DEFAULT_ACCEPTANCE_CRITERIA_PLACEHOLDER
        ).trim();
    }

    /**
     * 提取需求文档中的二级章节。
     */
    private static List<Section> extractSections(String markdown) {
        Matcher matcher = SYSTEM_LEVEL_ONE_HEADING_PATTERN.matcher(markdown);
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

    /**
     * 提取 Gitee 原模板中的一级章节。
     */
    private static List<Section> extractLevelOneSections(String markdown) {
        Matcher matcher = GITEE_LEVEL_ONE_HEADING_PATTERN.matcher(markdown);
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

    private static String buildRequirementDescriptionContent(List<Section> sections) {
        List<String> blocks = new ArrayList<>();
        appendSubSection(blocks, GITEE_FUNCTION_POINT_TITLE, findSectionContent(sections, GITEE_FUNCTION_POINT_TITLE));
        appendSubSection(blocks, GITEE_FLOWCHART_TITLE, findSectionContent(sections, GITEE_FLOWCHART_TITLE));
        appendSubSection(blocks, GITEE_PROTOTYPE_TITLE, findSectionContent(sections, GITEE_PROTOTYPE_TITLE));
        appendSubSection(blocks, GITEE_NON_FUNCTIONAL_REQUIREMENT_TITLE, findSectionContent(sections, GITEE_NON_FUNCTIONAL_REQUIREMENT_TITLE));
        if (blocks.isEmpty()) {
            return DEFAULT_REQUIREMENT_DESCRIPTION_PLACEHOLDER;
        }
        return String.join("\n\n", blocks);
    }

    private static void appendSubSection(List<String> blocks, String title, String content) {
        String normalizedContent = normalizeDocument(content);
        if (normalizedContent.isBlank()) {
            return;
        }
        blocks.add("## " + title + "\n\n" + normalizedContent);
    }

    private static String findSectionContent(List<Section> sections, String title) {
        return sections.stream()
                .filter(section -> title.equals(section.title()))
                .map(Section::content)
                .findFirst()
                .orElse("");
    }

    private static String defaultString(String value) {
        return value == null ? "" : value;
    }

    /**
     * 兼容历史系统模板：
     * 旧版主标题使用 `##`，Gitee 转换后的子标题使用 `###`。
     * 这里统一归一为当前规范：主标题 `#`，子标题 `##`。
     */
    public static String normalizeSystemTemplateHeadings(String markdown) {
        String normalized = normalizeDocument(markdown);
        if (normalized.isBlank()) {
            return normalized;
        }
        String upgraded = LEGACY_SYSTEM_HEADING_PATTERN.matcher(normalized).replaceAll("# $1");
        upgraded = LEGACY_GITEE_SUB_HEADING_PATTERN.matcher(upgraded).replaceAll("## $1");
        return upgraded;
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
