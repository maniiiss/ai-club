package com.aiclub.platform.service;

import com.aiclub.platform.config.PlatformToolSelectionProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 平台工具按需选择器。
 *
 * <p>业务意图：根据用户本轮输入（问题文本、slash 命令、路由、候选工具集）选出相关平台工具子集，
 * 通过 {@code restrictedToolCodes} 通道下发给 Runtime，避免一次性下发全部工具超过模型阈值
 * （实测 Ark deepseek-v4-flash 在 24 个工具时思考流截断、不产出正文）。
 *
 * <p>选择流程：
 * <ol>
 *   <li>slash 命令精确映射（用户显式意图，命中率最高）</li>
 *   <li>关键词匹配（复用 AssistantToolOrchestrator 沉淀的意图词表）</li>
 *   <li>规则未命中时向量检索兜底（{@link PlatformToolSemanticIndex}）</li>
 *   <li>与候选集取交集（聊天室为房间启用工具集，保证"按需 ⊂ 房间策略"）</li>
 *   <li>上限裁剪到 {@code maxTools}（默认 12）</li>
 *   <li>完全未命中时下发核心工具集，保证基础能力可用</li>
 * </ol>
 *
 * <p>返回 {@code null} 表示按需下发未启用，调用方应回退全量下发。
 * 返回空集合不应发生（核心集兜底），若极端情况下核心集与候选集无交集则返回候选集截断。
 */
@Service
public class PlatformToolSelector {

    private static final Logger log = LoggerFactory.getLogger(PlatformToolSelector.class);

    private final PlatformToolSelectionProperties properties;
    private final PlatformToolSemanticIndex semanticIndex;

    /** slash 命令 -> 工具子集映射（key 为去掉前导 / 的小写片段，命中即取其工具）。 */
    private static final Map<String, List<String>> SLASH_MAPPING = Map.ofEntries(
            Map.entry("需求", List.of(
                    PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                    PlatformToolRegistry.TOOL_WORK_ITEM_GET_DETAIL,
                    PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT,
                    PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL,
                    PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS)),
            Map.entry("wiki", List.of(
                    PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH,
                    PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL,
                    PlatformToolRegistry.TOOL_DOCUMENT_CONVERT_MARKDOWN)),
            Map.entry("知识库", List.of(
                    PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH,
                    PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL,
                    PlatformToolRegistry.TOOL_DOCUMENT_CONVERT_MARKDOWN)),
            Map.entry("执行任务", List.of(
                    PlatformToolRegistry.TOOL_EXECUTION_TASK_SEARCH,
                    PlatformToolRegistry.TOOL_EXECUTION_TASK_GET_DETAIL,
                    PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE,
                    PlatformToolRegistry.TOOL_WORK_ITEM_GET_DETAIL)),
            Map.entry("仓库扫描", List.of(
                    PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH,
                    PlatformToolRegistry.TOOL_REPO_SCAN_LIST_RULESETS,
                    PlatformToolRegistry.TOOL_REPO_SCAN_START,
                    PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)),
            Map.entry("测试", List.of(
                    PlatformToolRegistry.TOOL_TEST_PLAN_SEARCH,
                    PlatformToolRegistry.TOOL_TEST_PLAN_GET_DETAIL,
                    PlatformToolRegistry.TOOL_TEST_PLAN_CREATE_DRAFT)),
            Map.entry("迭代", List.of(
                    PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS,
                    PlatformToolRegistry.TOOL_PROJECT_GET_ITERATION_DETAIL,
                    PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)),
            Map.entry("文件库", List.of(
                    PlatformToolRegistry.TOOL_DOCUMENT_CONVERT_MARKDOWN,
                    PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH))
    );

    /** 关键词规则：问题命中任一关键词即选对应工具组。 */
    private static final List<KeywordRule> KEYWORD_RULES = List.of(
            new KeywordRule(List.of("项目", "哪些项目", "多少项目", "项目列表", "项目概览", "projects"), List.of(
                    PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                    PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL,
                    PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS)),
            new KeywordRule(List.of("需求", "任务", "缺陷", "工作项", "bug", "requirement"), List.of(
                    PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                    PlatformToolRegistry.TOOL_WORK_ITEM_GET_DETAIL,
                    PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT)),
            new KeywordRule(List.of("迭代", "发版", "sprint", "版本发布"), List.of(
                    PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS,
                    PlatformToolRegistry.TOOL_PROJECT_GET_ITERATION_DETAIL,
                    PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)),
            new KeywordRule(List.of("成员", "负责人", "谁负责", "协作人"), List.of(
                    PlatformToolRegistry.TOOL_USER_RESOLVE_PROJECT_MEMBER,
                    PlatformToolRegistry.TOOL_USER_LIST_PROJECT_MEMBERS,
                    PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL)),
            new KeywordRule(List.of("wiki", "知识库", "知识", "文档", "页面"), List.of(
                    PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH,
                    PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL,
                    PlatformToolRegistry.TOOL_DOCUMENT_CONVERT_MARKDOWN)),
            new KeywordRule(List.of("测试", "用例", "测试计划", "test"), List.of(
                    PlatformToolRegistry.TOOL_TEST_PLAN_SEARCH,
                    PlatformToolRegistry.TOOL_TEST_PLAN_GET_DETAIL,
                    PlatformToolRegistry.TOOL_TEST_PLAN_CREATE_DRAFT)),
            new KeywordRule(List.of("执行", "运行", "执行任务", "流水线", "pipeline"), List.of(
                    PlatformToolRegistry.TOOL_EXECUTION_TASK_SEARCH,
                    PlatformToolRegistry.TOOL_EXECUTION_TASK_GET_DETAIL,
                    PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE)),
            new KeywordRule(List.of("仓库", "gitlab", "代码仓库", "扫描", "规范"), List.of(
                    PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                    PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH,
                    PlatformToolRegistry.TOOL_REPO_SCAN_LIST_RULESETS,
                    PlatformToolRegistry.TOOL_REPO_SCAN_START)),
            new KeywordRule(List.of("agent", "智能体", "助手", "机器人"), List.of(
                    PlatformToolRegistry.TOOL_AGENT_LIST_AVAILABLE,
                    PlatformToolRegistry.TOOL_AGENT_GET_DETAIL))
    );

    public PlatformToolSelector(PlatformToolSelectionProperties properties,
                                PlatformToolSemanticIndex semanticIndex) {
        this.properties = properties;
        this.semanticIndex = semanticIndex;
    }

    /**
     * 按本轮上下文选出要下发的平台工具 code 集合。
     *
     * @return {@code null} 表示按需未启用，调用方应全量下发；非 null 表示按需选出的子集。
     */
    public Set<String> select(ToolSelectionContext ctx) {
        if (!properties.isEnabled()) {
            return null;
        }
        Set<String> selected = new LinkedHashSet<>();
        applySlash(ctx.slashCommand(), selected);
        applyKeywords(ctx.question(), selected);
        if (selected.isEmpty() && properties.isVectorFallbackEnabled() && semanticIndex.isEnabled()) {
            List<String> vectorHits = semanticIndex.search(ctx.question(), properties.maxTools());
            selected.addAll(vectorHits);
        }
        Set<String> candidates = normalize(ctx.candidateToolCodes());
        if (!candidates.isEmpty()) {
            selected.retainAll(candidates);
        }
        selected = truncate(selected, properties.maxTools());
        if (selected.isEmpty()) {
            selected = resolveFallback(candidates);
        }
        return selected;
    }

    private void applySlash(String slashCommand, Set<String> target) {
        String normalized = normalizeSlash(slashCommand);
        if (normalized.isBlank()) {
            return;
        }
        for (Map.Entry<String, List<String>> entry : SLASH_MAPPING.entrySet()) {
            if (normalized.contains(entry.getKey())) {
                target.addAll(entry.getValue());
            }
        }
    }

    private void applyKeywords(String question, Set<String> target) {
        String normalized = defaultString(question).toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return;
        }
        for (KeywordRule rule : KEYWORD_RULES) {
            for (String keyword : rule.keywords()) {
                if (normalized.contains(keyword.toLowerCase(Locale.ROOT))) {
                    target.addAll(rule.toolCodes());
                    break;
                }
            }
        }
    }

    /** 核心工具集兜底：优先与候选集取交集，无交集时退回候选集截断，保证不空且尊重房间策略。 */
    private Set<String> resolveFallback(Set<String> candidates) {
        Set<String> core = new LinkedHashSet<>(properties.coreFallbackToolCodes());
        if (!candidates.isEmpty()) {
            core.retainAll(candidates);
            if (core.isEmpty()) {
                // 房间未启用任何核心工具，退回候选集并截断，避免下发空集。
                return truncate(candidates, properties.maxTools());
            }
        }
        return truncate(core, properties.maxTools());
    }

    private Set<String> truncate(Set<String> codes, int limit) {
        if (codes.size() <= limit) {
            return new LinkedHashSet<>(codes);
        }
        Set<String> truncated = new LinkedHashSet<>();
        for (String code : codes) {
            if (truncated.size() >= limit) {
                break;
            }
            truncated.add(code);
        }
        return truncated;
    }

    private Set<String> normalize(Collection<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return Set.of();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String code : codes) {
            if (code != null && !code.isBlank()) {
                normalized.add(code.trim());
            }
        }
        return normalized;
    }

    private String normalizeSlash(String slashCommand) {
        String value = defaultString(slashCommand).trim().toLowerCase(Locale.ROOT);
        while (value.startsWith("/")) {
            value = value.substring(1);
        }
        return value;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    /** 关键词规则定义。 */
    private record KeywordRule(List<String> keywords, List<String> toolCodes) {
        KeywordRule {
            keywords = keywords == null ? List.of() : List.copyOf(keywords);
            toolCodes = toolCodes == null ? List.of() : List.copyOf(toolCodes);
        }
    }
}
