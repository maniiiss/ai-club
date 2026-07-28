package com.aiclub.platform.service;

import com.aiclub.platform.config.PlatformToolSelectionProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Collection;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * PlatformToolSelector 按需选择逻辑单测。
 * 覆盖 slash 命令映射、关键词匹配、向量兜底、候选集交集、上限裁剪与核心集兜底。
 */
class PlatformToolSelectorTests {

    private PlatformToolSemanticIndex semanticIndex;
    private PlatformToolSelector selector;

    @BeforeEach
    void setUp() {
        PlatformToolSelectionProperties properties = new PlatformToolSelectionProperties(true, 12, true,
                List.of("project.search", "project.get_detail", "work_item.search", "work_item.get_detail",
                        "agent.list_available", "wiki_space.search", "user.list_project_members", "document.convert_markdown"));
        semanticIndex = Mockito.mock(PlatformToolSemanticIndex.class);
        selector = new PlatformToolSelector(properties, semanticIndex);
    }

    @Test
    void disabledReturnsNullForFullDeliveryFallback() {
        PlatformToolSelectionProperties disabled = new PlatformToolSelectionProperties(false, 12, true, List.of("project.search"));
        PlatformToolSelector disabledSelector = new PlatformToolSelector(disabled, semanticIndex);
        assertThat(disabledSelector.select(ctx("需求", null, null))).isNull();
    }

    @Test
    void slashCommandMapsToToolSubset() {
        Set<String> result = selector.select(ctx("", "/需求", null));
        assertThat(result).contains("work_item.search", "work_item.get_detail", "work_item.create_draft");
        assertThat(result.size()).isLessThanOrEqualTo(12);
    }

    @Test
    void keywordMatchSelectsRelatedTools() {
        Set<String> result = selector.select(ctx("帮我查一下需求进展", null, null));
        assertThat(result).contains("work_item.search", "work_item.get_detail");
        assertThat(result).doesNotContain("test_plan.search");
    }

    @Test
    void vectorFallbackInvokedWhenRulesMiss() {
        when(semanticIndex.isEnabled()).thenReturn(true);
        when(semanticIndex.search("天气如何", 12)).thenReturn(List.of("project.search", "work_item.search"));
        Set<String> result = selector.select(ctx("天气如何", null, null));
        assertThat(result).contains("project.search", "work_item.search");
    }

    @Test
    void fallbackToCoreToolSetWhenNothingMatches() {
        when(semanticIndex.isEnabled()).thenReturn(false);
        Set<String> result = selector.select(ctx("zzz无意义天气xyz", null, null));
        assertThat(result).contains("project.search", "agent.list_available", "wiki_space.search");
        assertThat(result.size()).isLessThanOrEqualTo(12);
    }

    @Test
    void intersectionWithCandidateSetRespectsRoomPolicy() {
        // 需求关键词命中 work_item.*，但候选集只允许 wiki 工具，交集后回退到核心集与候选集交集。
        Set<String> result = selector.select(ctx("帮我查需求", null,
                Set.of("wiki_space.search", "wiki_page.get_detail")));
        assertThat(result).isSubsetOf("wiki_space.search", "wiki_page.get_detail");
        assertThat(result).isNotEmpty();
    }

    @Test
    void candidateSetEmptyFallbackStillReturnsCore() {
        when(semanticIndex.isEnabled()).thenReturn(false);
        // 候选集为空集合（房间未启用任何工具）时，核心集不受候选集限制仍返回。
        Set<String> result = selector.select(ctx("zzz无意义xyz", null, Set.of()));
        assertThat(result).contains("project.search");
    }

    @Test
    void truncatesToMaxToolsLimit() {
        PlatformToolSelectionProperties smallLimit = new PlatformToolSelectionProperties(true, 3, false, List.of("project.search"));
        PlatformToolSelector limitedSelector = new PlatformToolSelector(smallLimit, semanticIndex);
        // 多组关键词命中远超 3 个。
        Set<String> result = limitedSelector.select(ctx("项目 需求 测试 迭代 仓库 wiki 执行 成员 agent 文档", null, null));
        assertThat(result.size()).isLessThanOrEqualTo(3);
    }

    private ToolSelectionContext ctx(String question, String slashCommand, Collection<String> candidates) {
        return new ToolSelectionContext(question, slashCommand, null, null, candidates, null);
    }
}
