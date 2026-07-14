package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantActionSummary;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantReferenceSummary;
import com.aiclub.platform.dto.AssistantToolCallRequest;
import com.aiclub.platform.dto.AssistantToolExecutionOutcome;
import com.aiclub.platform.dto.AssistantToolExecutionPolicy;
import com.aiclub.platform.dto.PlatformToolCandidate;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.PlatformToolRequest;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 验证 Assistant 工具编排在唯一命中、歧义命中和写操作确认场景下的稳定行为。
 */
@ExtendWith(MockitoExtension.class)
class AssistantToolOrchestratorTests {

    @Mock
    private PlatformToolExecutor platformToolExecutor;

    @Mock
    private PlatformToolRegistry platformToolRegistry;

    @Mock
    private AssistantActionPlannerService assistantActionPlannerService;

    /**
     * 当前路由已经锚定 Wiki 页面时，如果模型仍用“当前页面”去搜索，平台应直接改走 Wiki 页面详情工具。
     */
    @Test
    void shouldAnchorCurrentWikiPageWhenSearchingCurrentPage() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "wiki-space-page",
                null,
                null,
                5L,
                7L,
                "知识管理员",
                List.of(
                        new AssistantReferenceSummary("WIKI_SPACE", 5L, "产品文档空间", "/wiki/spaces/5"),
                        new AssistantReferenceSummary("WIKI_PAGE", 7L, "P1mini安装说明书（完整版）", "/wiki/spaces/5/pages/7")
                ),
                List.of("帮我总结当前 Wiki 页面"),
                "Wiki 页面上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我总结当前页面",
                "wiki-space-page",
                null,
                null,
                null,
                null,
                5L,
                7L,
                "conversation-wiki-1",
                null,
                null
        );
        PlatformToolDefinition wikiSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH,
                "搜索 Wiki 页面",
                "WIKI",
                "按关键词、空间或项目搜索当前用户可见的 Wiki 页面",
                true,
                "LOW",
                "wiki:view",
                false,
                Map.of("query", "Wiki 查询语句", "spaceId", "Wiki 空间ID", "projectId", "绑定项目ID")
        );
        PlatformToolResult detailResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL,
                "Wiki 页面详情",
                "已读取 Wiki 页面 “P1mini安装说明书（完整版）”",
                List.of(
                        new PlatformToolCandidate(
                                "WIKI_PAGE",
                                7L,
                                "P1mini安装说明书（完整版）",
                                "版本：v1 / 空间：产品文档空间",
                                "/wiki/spaces/5/pages/7",
                                Map.of("spaceId", 5L, "pageId", 7L, "title", "P1mini安装说明书（完整版）", "content", "正文内容摘要"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH)).thenReturn(wikiSearch);
        when(platformToolExecutor.execute(argThat((PlatformToolRequest toolRequest) ->
                Objects.equals(toolRequest.toolCode(), PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL)
                        && Objects.equals(toolRequest.payload().get("spaceId"), 5L)
                        && Objects.equals(toolRequest.payload().get("pageId"), 7L)
        ))).thenReturn(detailResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-wiki-1",
                        PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH,
                        "wiki_space__search",
                        Map.of("query", "当前页面")
                ),
                "scope-wiki-1",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.groundingState().boundSlot("wikiPage")).isNotNull();
        assertThat(outcome.groundingState().boundSlot("wikiPage").entityId()).isEqualTo(7L);
        assertThat(outcome.toolResults()).hasSize(1);
        assertThat(outcome.toolResults().get(0).toolCode()).isEqualTo(PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL);
        assertThat(outcome.toolResults().get(0).candidates().get(0).payload())
                .containsEntry("pageId", 7L);
    }

    /**
     * 当搜索结果形成高分唯一命中时，应自动绑定 workItem grounding，并继续 loop。
     */
    @Test
    void shouldBindGroundingWhenSearchReturnsUniqueHighScoreCandidate() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我看看 REQ-123 这个需求",
                "project-iterations",
                12L,
                null,
                null,
                null,
                "conversation-1",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个相关工作项",
                List.of(
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                101L,
                                "REQ-123 登录改造",
                                "类型：需求 / 状态：处理中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=101",
                                Map.of("projectId", 12L, "workItemId", 101L, "workItemCode", "REQ-123", "status", "处理中", "projectName", "支付项目"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                102L,
                                "REQ-456 登录页视觉优化",
                                "类型：需求 / 状态：处理中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=102",
                                Map.of("projectId", 12L, "workItemId", 102L, "workItemCode", "REQ-456", "status", "处理中", "projectName", "支付项目"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-1",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "REQ-123", "projectId", 12L)
                ),
                "scope-1",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.groundingState().boundSlot("workItem")).isNotNull();
        assertThat(outcome.groundingState().boundSlot("workItem").entityId()).isEqualTo(101L);
        assertThat(outcome.toolResults()).hasSize(1);
        assertThat(outcome.toolResults().get(0).candidates().get(0).payload()).containsKey("matchScore");
        assertThat(outcome.toolMessageContent()).contains("REQ-123 登录改造");
    }

    /**
     * 当多个候选分数接近时，应返回选择卡片而不是直接绑定对象。
     */
    @Test
    void shouldCreateSelectionCardWhenCandidatesAreAmbiguous() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我看看登录改造这个需求",
                "project-iterations",
                12L,
                null,
                null,
                null,
                "conversation-2",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个相关工作项",
                List.of(
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                201L,
                                "登录改造",
                                "类型：需求 / 状态：处理中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=201",
                                Map.of("projectId", 12L, "workItemId", 201L, "status", "处理中", "projectName", "支付项目"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                202L,
                                "登录改造",
                                "类型：需求 / 状态：处理中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=202",
                                Map.of("projectId", 12L, "workItemId", 202L, "status", "处理中", "projectName", "支付项目"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-2",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "登录改造", "projectId", 12L)
                ),
                "scope-2",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("awaiting_selection");
        assertThat(outcome.selectionCards()).hasSize(1);
        assertThat(outcome.selectionCards().get(0).options()).hasSize(2);
        assertThat(outcome.groundingState().boundSlot("workItem")).isNull();
    }

    /**
     * 创建需求时如果用户没有指定迭代，即使模型误调用工作项搜索，也必须先让用户确认迭代。
     */
    @Test
    void shouldRedirectCreateRequirementWorkItemSearchToIterationSelection() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "chat-room",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "示例项目", "/projects/12/iterations")),
                List.of(),
                "聊天室项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮忙加一个需求",
                "chat-room",
                12L,
                null,
                null,
                null,
                "conversation-create-requirement",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按项目、迭代、标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID", "iterationId", "迭代ID", "workItemType", "工作项类型")
        );
        PlatformToolResult iterationResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS,
                "项目迭代列表",
                "项目 “示例项目” 有 2 个迭代",
                List.of(
                        new PlatformToolCandidate(
                                "ITERATION",
                                77L,
                                "示例项目二期迭代",
                                "状态：进行中 / 目标：需求补录",
                                "/projects/12/iterations?iterationId=77",
                                Map.of("projectId", 12L, "status", "进行中"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "ITERATION",
                                78L,
                                "示例项目三期迭代",
                                "状态：待开始 / 目标：后续规划",
                                "/projects/12/iterations?iterationId=78",
                                Map.of("projectId", 12L, "status", "待开始"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of("projectId", 12L)
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(argThat(toolRequest ->
                PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS.equals(toolRequest.toolCode())
                        && Objects.equals(toolRequest.payload().get("projectId"), 12L)
        ))).thenReturn(iterationResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-create-requirement-iteration",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "需求", "projectId", 12L)
                ),
                "scope-create-requirement",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("awaiting_selection");
        assertThat(outcome.selectionCards()).hasSize(1);
        assertThat(outcome.selectionCards().get(0).title()).contains("迭代");
        assertThat(outcome.selectionCards().get(0).options()).extracting(option -> option.entityType())
                .containsOnly("ITERATION");
    }

    /**
     * 当前迭代下的工作项集合查询用于汇总发版内容时，不应被误判成“必须先选一个工作项”。
     */
    @Test
    void shouldKeepIterationScopedWorkItemSearchAsCollection() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project-iterations",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "迭代上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我总结当前迭代发版内容",
                "project-iterations",
                12L,
                null,
                35L,
                null,
                "conversation-2b",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按项目、迭代、标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID", "iterationId", "迭代ID", "workItemType", "工作项类型")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个相关工作项",
                List.of(
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                301L,
                                "统一登录改造",
                                "类型：需求 / 状态：通过 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=301",
                                Map.of("projectId", 12L, "workItemId", 301L, "iterationId", 35L, "status", "通过", "projectName", "支付项目"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                302L,
                                "修复移动端按钮错位",
                                "类型：缺陷 / 状态：处理中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=302",
                                Map.of("projectId", 12L, "workItemId", 302L, "iterationId", 35L, "status", "处理中", "projectName", "支付项目"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of("iterationId", 35L)
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-2b",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of()
                ),
                "scope-2b",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.groundingState().boundSlot("workItem")).isNull();
        assertThat(outcome.toolMessageContent()).contains("统一登录改造");
        assertThat(outcome.toolMessageContent()).contains("修复移动端按钮错位");
    }

    /**
     * 即使关键词不是纯类型词，只要用户语义明显是在问“有哪些”，当前迭代里的工作项搜索也应按集合返回。
     */
    @Test
    void shouldKeepAmbiguousIterationWorkItemsAsCollectionWhenQuestionAsksForList() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project-iterations",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "迭代上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "当前迭代有哪些登录改造相关需求",
                "project-iterations",
                12L,
                null,
                35L,
                null,
                "conversation-2c",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按项目、迭代、标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID", "iterationId", "迭代ID", "workItemType", "工作项类型")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个相关工作项",
                List.of(
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                401L,
                                "登录改造一期",
                                "类型：需求 / 状态：通过 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=401",
                                Map.of("projectId", 12L, "workItemId", 401L, "iterationId", 35L, "status", "通过", "projectName", "支付项目"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                402L,
                                "登录改造二期",
                                "类型：需求 / 状态：处理中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=402",
                                Map.of("projectId", 12L, "workItemId", 402L, "iterationId", 35L, "status", "处理中", "projectName", "支付项目"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of("iterationId", 35L)
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-2c",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "登录改造", "workItemType", "需求")
                ),
                "scope-2c",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.groundingState().boundSlot("workItem")).isNull();
        assertThat(outcome.toolMessageContent()).contains("登录改造一期");
        assertThat(outcome.toolMessageContent()).contains("登录改造二期");
    }

    /**
     * 跨项目风险分析会多次检索工作项，这类问题的目标是聚合风险，不应把中间工作项搜索误转成单对象确认卡片。
     */
    @Test
    void shouldKeepGlobalRiskWorkItemSearchAsCollectionWhenQuestionAsksWhichProjects() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "dashboard",
                null,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "首页看板上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "哪些项目本周有延期风险",
                "dashboard",
                null,
                null,
                null,
                null,
                "conversation-risk-1",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按项目、迭代、标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID", "iterationId", "迭代ID", "workItemType", "工作项类型")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个存在延期风险的工作项",
                List.of(
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                501L,
                                "#3Z3LJH 完成项目首页框架",
                                "类型：任务 / 状态：处理中 / 项目：Agent Ops",
                                "/projects/21/iterations?openTaskId=501",
                                Map.of("projectId", 21L, "workItemId", 501L, "status", "处理中", "projectName", "Agent Ops"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                502L,
                                "#LFZ77R 项目权限修正",
                                "类型：需求 / 状态：草稿 / 项目：Agent Ops",
                                "/projects/21/iterations?openTaskId=502",
                                Map.of("projectId", 21L, "workItemId", 502L, "status", "草稿", "projectName", "Agent Ops"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-risk-1",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "延期风险")
                ),
                "scope-risk-1",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.groundingState().boundSlot("workItem")).isNull();
        assertThat(outcome.toolMessageContent()).contains("完成项目首页框架");
        assertThat(outcome.toolMessageContent()).contains("项目权限修正");
    }

    /**
     * 用户询问“还有几个进行中的任务”时关注的是计数集合，不能把进行中的多个工作项转成单个工作项确认卡。
     */
    @Test
    void shouldKeepActiveTaskCountQuestionAsWorkItemCollection() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project-iterations",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "迭代上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "现在还有几个任务在进行中",
                "project-iterations",
                12L,
                null,
                35L,
                null,
                "conversation-active-task-count",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按项目、迭代、标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID", "iterationId", "迭代ID", "workItemType", "工作项类型", "status", "状态")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个进行中的任务",
                List.of(
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                601L,
                                "#TASK1 支付网关联调",
                                "类型：任务 / 状态：进行中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=601",
                                Map.of("projectId", 12L, "workItemId", 601L, "iterationId", 35L, "status", "进行中", "projectName", "支付项目"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                602L,
                                "#TASK2 对账脚本完善",
                                "类型：任务 / 状态：进行中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=602",
                                Map.of("projectId", 12L, "workItemId", 602L, "iterationId", 35L, "status", "进行中", "projectName", "支付项目"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of("iterationId", 35L, "status", "进行中")
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-active-task-count",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("workItemType", "任务", "status", "进行中")
                ),
                "scope-active-task-count",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.groundingState().boundSlot("workItem")).isNull();
        assertThat(outcome.toolMessageContent()).contains("支付网关联调");
        assertThat(outcome.toolMessageContent()).contains("对账脚本完善");
    }

    /**
     * “还有某类任务在进行中吗”是状态集合判断，即使带了业务关键词也不应让用户再确认单个工作项。
     */
    @Test
    void shouldKeepIterationStatusQuestionWithKeywordAsWorkItemCollection() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project-iterations",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "迭代上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "这个迭代还有登录相关任务在进行中吗",
                "project-iterations",
                12L,
                null,
                35L,
                null,
                "conversation-active-task-status",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按项目、迭代、标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID", "iterationId", "迭代ID", "workItemType", "工作项类型", "status", "状态")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个进行中的任务",
                List.of(
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                611L,
                                "#LOGIN1 登录页适配",
                                "类型：任务 / 状态：进行中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=611",
                                Map.of("projectId", 12L, "workItemId", 611L, "iterationId", 35L, "status", "进行中", "projectName", "支付项目"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "WORK_ITEM",
                                612L,
                                "#LOGIN2 登录审计补充",
                                "类型：任务 / 状态：进行中 / 项目：支付项目",
                                "/projects/12/iterations?openTaskId=612",
                                Map.of("projectId", 12L, "workItemId", 612L, "iterationId", 35L, "status", "进行中", "projectName", "支付项目"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of("iterationId", 35L, "status", "进行中")
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-active-task-status",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "登录", "status", "进行中")
                ),
                "scope-active-task-status",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.groundingState().boundSlot("workItem")).isNull();
        assertThat(outcome.toolMessageContent()).contains("登录页适配");
        assertThat(outcome.toolMessageContent()).contains("登录审计补充");
    }

    /**
     * “这个项目有哪些...”这类问题虽然包含集合意图，但第一步 project.search 是在解析“这个项目”。
     * 如果没有页面 projectId 且命中多个项目，必须交给前端候选卡片确认，而不是把项目列表当作最终事实返回。
     */
    @Test
    void shouldAskUserToSelectProjectWhenProjectSearchResolvesDeicticProjectInCollectionQuestion() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "projects",
                null,
                null,
                "超级管理员",
                List.of(),
                List.of(),
                "项目列表上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "最近这个项目有哪些关键变化",
                "projects",
                null,
                null,
                null,
                null,
                "conversation-project-selection",
                null,
                null
        );
        PlatformToolDefinition projectSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                "搜索项目",
                "PROJECT",
                "按项目名称或关键词搜索当前用户可见项目",
                true,
                "LOW",
                "project:view",
                false,
                Map.of("keyword", "项目关键词")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                "搜索项目",
                "找到 2 个相关项目",
                List.of(
                        new PlatformToolCandidate(
                                "PROJECT",
                                1L,
                                "Agent Ops",
                                "状态：进行中 / 负责人：张三",
                                "/projects/1/iterations",
                                Map.of("projectId", 1L, "status", "进行中"),
                                List.of()
                        ),
                        new PlatformToolCandidate(
                                "PROJECT",
                                4L,
                                "示例项目",
                                "状态：进行中 / 负责人：管理员",
                                "/projects/4/iterations",
                                Map.of("projectId", 4L, "status", "进行中"),
                                List.of()
                        )
                ),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(projectSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-project-selection",
                        PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                        "project__search",
                        Map.of("keyword", "")
                ),
                "scope-project-selection",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("awaiting_selection");
        assertThat(outcome.selectionCards()).hasSize(1);
        assertThat(outcome.selectionCards().get(0).options())
                .extracting(option -> option.title())
                .containsExactly("Agent Ops", "示例项目");
    }

    /**
     * 当前页面已经绑定项目时，即使模型误调用 project.search，也应直接读取当前项目详情。
     */
    @Test
    void shouldResolveBoundCurrentProjectInsteadOfAskingProjectSelection() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                4L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 4L, "示例项目", "/projects/4/iterations")),
                List.of(),
                "示例项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "当前项目有什么缺陷",
                "project-iterations",
                4L,
                null,
                null,
                null,
                "conversation-current-project",
                null,
                null
        );
        PlatformToolDefinition projectSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                "搜索项目",
                "PROJECT",
                "按项目名称或关键词搜索当前用户可见项目",
                true,
                "LOW",
                "project:view",
                false,
                Map.of("keyword", "项目关键词")
        );
        PlatformToolResult detailResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL,
                "项目详情",
                "已读取项目 示例项目",
                List.of(new PlatformToolCandidate(
                        "PROJECT", 4L, "示例项目", "状态：进行中", "/projects/4/iterations",
                        Map.of("projectId", 4L), List.of()
                )),
                List.of(),
                Map.of("projectId", 4L)
        );
        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(projectSearch);
        when(platformToolExecutor.execute(argThat(requestValue ->
                Objects.equals(requestValue.toolCode(), PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL)
                        && Objects.equals(requestValue.payload().get("projectId"), 4L)
        ))).thenReturn(detailResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-current-project",
                        PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                        "project__search",
                        Map.of("keyword", "当前项目")
                ),
                "scope-current-project",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.toolResults()).singleElement().extracting(PlatformToolResult::toolCode)
                .isEqualTo(PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL);
    }

    /**
     * “我要找哪些缺陷”是工作项集合查询，即使当前没有迭代 ID，也不能弹出单个工作项确认卡。
     */
    @Test
    void shouldKeepDefectSearchAsCollectionWithoutIterationContext() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                4L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 4L, "示例项目", "/projects/4/iterations")),
                List.of(),
                "示例项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "我要找哪些缺陷",
                "project-iterations",
                4L,
                null,
                null,
                null,
                "conversation-defects",
                null,
                null
        );
        PlatformToolDefinition workItemSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "WORK_ITEM",
                "按项目、迭代、标题、编号或说明搜索需求/任务/缺陷",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("keyword", "工作项关键词", "projectId", "项目ID", "workItemType", "工作项类型")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "搜索工作项",
                "找到 2 个缺陷",
                List.of(
                        new PlatformToolCandidate("WORK_ITEM", 801L, "登录缺陷", "类型：缺陷", "/projects/4/iterations?openTaskId=801", Map.of("projectId", 4L, "workItemId", 801L), List.of()),
                        new PlatformToolCandidate("WORK_ITEM", 802L, "审批缺陷", "类型：缺陷", "/projects/4/iterations?openTaskId=802", Map.of("projectId", 4L, "workItemId", 802L), List.of())
                ),
                List.of(),
                Map.of("projectId", 4L)
        );
        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH)).thenReturn(workItemSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-defects",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "缺陷", "workItemType", "缺陷")
                ),
                "scope-defects",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.selectionCards()).isEmpty();
        assertThat(outcome.toolMessageContent()).contains("登录缺陷", "审批缺陷");
    }

    /**
     * 当 Assistant 发起写工具调用时，平台应直接转成确认动作卡片。
     */
    @Test
    void shouldConvertWriteToolCallToActionConfirmation() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我创建一个需求",
                "project-iterations",
                12L,
                null,
                null,
                null,
                "conversation-3",
                null,
                null
        );
        PlatformToolDefinition workItemCreate = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT,
                "创建工作项草稿",
                "WORK_ITEM",
                "创建需求/任务/缺陷草稿",
                false,
                "MEDIUM",
                "task:manage",
                true,
                Map.of("projectId", "项目ID", "name", "标题", "content", "内容")
        );
        AssistantActionSummary action = new AssistantActionSummary(
                "CREATE_WORK_ITEM_DRAFT",
                "创建需求草稿",
                "确认后会在当前项目下创建一个“需求”草稿。",
                true,
                Map.of("projectId", 12L, "content", "新增用户登录页")
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT)).thenReturn(workItemCreate);
        when(assistantActionPlannerService.createActionFromToolCall(
                eq(PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT),
                any(),
                any(),
                eq("帮我创建一个需求")
        )).thenReturn(action);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-3",
                        PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT,
                        "work_item__create_draft",
                        Map.of("projectId", 12L, "content", "新增用户登录页")
                ),
                "scope-3",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("awaiting_confirmation");
        assertThat(outcome.actions()).hasSize(1);
        assertThat(outcome.actions().get(0).type()).isEqualTo("CREATE_WORK_ITEM_DRAFT");
    }

    /**
     * 聊天室 Agent 授权自动执行的写工具应复用 Assistant 原生工具执行入口，而不是退回确认卡片。
     */
    @Test
    void shouldAutoExecuteWriteToolWhenChatRoomAgentPolicyAllowsIt() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "chat-room",
                12L,
                null,
                "聊天室成员",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "聊天室上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我创建一个需求草稿",
                "chat-room",
                12L,
                null,
                null,
                null,
                "chat-room-41-agent-task-601",
                null,
                null
        );
        PlatformToolDefinition repoScanStart = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_REPO_SCAN_START,
                "发起仓库扫描",
                "GITLAB",
                "基于指定绑定仓库创建仓库规范扫描任务",
                false,
                "MEDIUM",
                "gitlab:manage",
                true,
                Map.of("bindingId", "绑定ID", "branch", "分支", "rulesetCode", "规则集")
        );
        PlatformToolResult createdResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_REPO_SCAN_START,
                "发起仓库扫描",
                "已创建仓库规范扫描任务",
                List.of(),
                List.of(),
                Map.of("executionTaskId", 901L)
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_REPO_SCAN_START)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_REPO_SCAN_START)).thenReturn(repoScanStart);
        when(platformToolExecutor.execute(argThat((PlatformToolRequest toolRequest) ->
                Objects.equals(toolRequest.toolCode(), PlatformToolRegistry.TOOL_REPO_SCAN_START)
                        && Objects.equals(toolRequest.projectId(), 12L)
                        && Objects.equals(toolRequest.payload().get("bindingId"), 31L)
                        && Objects.equals(toolRequest.payload().get("rulesetCode"), "team-default")
        ))).thenReturn(createdResult);

        AssistantGroundingState groundingState = AssistantGroundingState.empty().withBoundSlot(
                "gitlabBinding",
                new com.aiclub.platform.dto.AssistantGroundingTarget(
                        "gitlabBinding",
                        "GITLAB_BINDING",
                        31L,
                        "group/payment-service",
                        "/gitlab",
                        12L,
                        "TOOL_RESULT",
                        Map.of("bindingId", 31L, "projectId", 12L)
                )
        );

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-chat-agent-1",
                        PlatformToolRegistry.TOOL_REPO_SCAN_START,
                        "repo_scan__start",
                        Map.of("rulesetCode", "team-default")
                ),
                "scope-chat-agent-1",
                context,
                request,
                groundingState,
                new AssistantToolExecutionPolicy(
                        603L,
                        41L,
                        601L,
                        5L,
                        List.of(PlatformToolRegistry.TOOL_REPO_SCAN_START),
                        List.of(PlatformToolRegistry.TOOL_REPO_SCAN_START)
                )
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.actions()).isEmpty();
        assertThat(outcome.toolResults()).hasSize(1);
        assertThat(outcome.toolMessageContent()).contains("已创建仓库规范扫描任务");
    }

    /**
     * 当搜索仓库绑定形成唯一命中时，应把绑定结果沉淀进 gitlabBinding grounding，供后续扫描动作复用。
     */
    @Test
    void shouldBindGitlabBindingGroundingWhenSearchReturnsUniqueRepositoryCandidate() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "dashboard",
                null,
                null,
                "协作成员",
                List.of(),
                List.of(),
                "首页上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我找到支付项目的 GitLab 仓库",
                "dashboard",
                null,
                null,
                null,
                null,
                "conversation-4",
                null,
                null
        );
        PlatformToolDefinition bindingSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                "搜索仓库绑定",
                "GITLAB",
                "按项目名或仓库路径搜索 GitLab 绑定仓库",
                true,
                "LOW",
                "gitlab:view",
                false,
                Map.of("keyword", "仓库关键词")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                "搜索仓库绑定",
                "找到 1 个相关仓库",
                List.of(new PlatformToolCandidate(
                        "GITLAB_BINDING",
                        31L,
                        "group/payment-service",
                        "项目：支付项目 / 默认分支：main",
                        "/gitlab",
                        Map.of(
                                "bindingId", 31L,
                                "projectId", 12L,
                                "projectName", "支付项目",
                                "gitlabProjectPath", "group/payment-service",
                                "gitlabProjectRef", "group/payment-service"
                        ),
                        List.of()
                )),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(bindingSearch);
        when(platformToolExecutor.execute(any())).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-4",
                        PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                        "gitlab_binding__search",
                        Map.of("keyword", "payment-service")
                ),
                "scope-4",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.groundingState().boundSlot("gitlabBinding")).isNotNull();
        assertThat(outcome.groundingState().boundSlot("gitlabBinding").entityId()).isEqualTo(31L);
    }

    /**
     * 仓库绑定搜索在未显式传 projectId 时，不应偷偷注入当前页面项目范围。
     * 否则用户在别的项目页面里搜索目标仓库，会被错误项目过滤拦住。
     */
    @Test
    void shouldNotInjectContextProjectIdForGitlabBindingSearch() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                31L,
                null,
                "项目成员",
                List.of(new AssistantReferenceSummary("PROJECT", 31L, "错误上下文项目", "/projects/31/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我找到 sample-org/sample-service 仓库",
                "project-iterations",
                31L,
                null,
                null,
                null,
                "conversation-4b",
                null,
                null
        );
        PlatformToolDefinition bindingSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                "搜索仓库绑定",
                "GITLAB",
                "按项目名或仓库路径搜索 GitLab 绑定仓库",
                true,
                "LOW",
                "gitlab:view",
                false,
                Map.of("keyword", "仓库关键词", "projectId", "项目ID")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                "搜索仓库绑定",
                "找到 1 个相关仓库",
                List.of(new PlatformToolCandidate(
                        "GITLAB_BINDING",
                        1L,
                        "sample-org/sample-service",
                        "项目：Agent Ops / 默认分支：deploy",
                        "/gitlab",
                        Map.of("bindingId", 1L, "projectId", 1L, "gitlabProjectPath", "sample-org/sample-service", "gitlabProjectRef", "sample-org/sample-service"),
                        List.of()
                )),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(bindingSearch);
        when(platformToolExecutor.execute(argThat(toolRequest ->
                !toolRequest.payload().containsKey("projectId")
                        && Objects.equals(toolRequest.payload().get("keyword"), "sample-org/sample-service")
        ))).thenReturn(searchResult);

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-4b",
                        PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                        "gitlab_binding__search",
                        Map.of("keyword", "sample-org/sample-service")
                ),
                "scope-4b",
                context,
                request,
                AssistantGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.groundingState().boundSlot("gitlabBinding")).isNotNull();
        assertThat(outcome.groundingState().boundSlot("gitlabBinding").entityId()).isEqualTo(1L);
    }

    /**
     * 当仓库扫描搜索只命中一个执行任务时，应自动绑定 executionTask grounding，并支持从 gitlabBinding 回填 bindingId。
     */
    @Test
    void shouldBindExecutionTaskGroundingWhenRepositoryScanSearchReturnsUniqueCandidate() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                assistantActionPlannerService,
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "dashboard",
                12L,
                null,
                "协作成员",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "看看这个仓库最近的扫描任务",
                "dashboard",
                12L,
                null,
                null,
                null,
                "conversation-5",
                null,
                null
        );
        PlatformToolDefinition scanSearch = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH,
                "搜索仓库扫描",
                "GITLAB",
                "查询最近的仓库规范扫描任务",
                true,
                "LOW",
                "task:view",
                false,
                Map.of("bindingId", "绑定ID", "status", "任务状态")
        );
        PlatformToolResult searchResult = new PlatformToolResult(
                PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH,
                "搜索仓库扫描",
                "找到 1 条扫描任务",
                List.of(new PlatformToolCandidate(
                        "EXECUTION_TASK",
                        88L,
                        "支付仓库规范扫描",
                        "场景：仓库规范扫描 / 状态：RUNNING",
                        "/tasks/88",
                        Map.of("executionTaskId", 88L, "projectId", 12L, "status", "RUNNING"),
                        List.of()
                )),
                List.of(),
                Map.of()
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH)).thenReturn(scanSearch);
        when(platformToolExecutor.execute(argThat(requestPayload ->
                Objects.equals(requestPayload.payload().get("bindingId"), 31L)
        ))).thenReturn(searchResult);

        AssistantGroundingState groundingState = AssistantGroundingState.empty().withBoundSlot(
                "gitlabBinding",
                new com.aiclub.platform.dto.AssistantGroundingTarget(
                        "gitlabBinding",
                        "GITLAB_BINDING",
                        31L,
                        "group/payment-service",
                        "/gitlab",
                        12L,
                        "TOOL_RESULT",
                        Map.of("bindingId", 31L, "projectId", 12L)
                )
        );

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-5",
                        PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH,
                        "repo_scan__search",
                        Map.of("status", "RUNNING")
                ),
                "scope-5",
                context,
                request,
                groundingState
        );

        assertThat(outcome.stopLoop()).isFalse();
        assertThat(outcome.groundingState().boundSlot("executionTask")).isNotNull();
        assertThat(outcome.groundingState().boundSlot("executionTask").entityId()).isEqualTo(88L);
    }

    /**
     * 发起仓库扫描时若缺少规则集，应返回明确失败摘要而不是默认套用规则集。
     */
    @Test
    void shouldFailClearlyWhenRepositoryScanRulesetIsMissing() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                new AssistantActionPlannerService(),
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "dashboard",
                12L,
                null,
                "协作成员",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我扫一下这个仓库",
                "dashboard",
                12L,
                null,
                null,
                null,
                "conversation-6",
                null,
                null
        );
        PlatformToolDefinition scanStart = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_REPO_SCAN_START,
                "发起仓库扫描",
                "GITLAB",
                "基于指定绑定仓库创建仓库规范扫描任务",
                false,
                "MEDIUM",
                "gitlab:manage",
                true,
                Map.of("bindingId", "绑定ID", "branch", "分支", "rulesetCode", "规则集")
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_REPO_SCAN_START)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_REPO_SCAN_START)).thenReturn(scanStart);

        AssistantGroundingState groundingState = AssistantGroundingState.empty().withBoundSlot(
                "gitlabBinding",
                new com.aiclub.platform.dto.AssistantGroundingTarget(
                        "gitlabBinding",
                        "GITLAB_BINDING",
                        31L,
                        "group/payment-service",
                        "/gitlab",
                        12L,
                        "TOOL_RESULT",
                        Map.of("bindingId", 31L, "projectId", 12L)
                )
        );

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-6",
                        PlatformToolRegistry.TOOL_REPO_SCAN_START,
                        "repo_scan__start",
                        Map.of("branch", "main")
                ),
                "scope-6",
                context,
                request,
                groundingState
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("failed");
        assertThat(outcome.actions()).isEmpty();
        assertThat(outcome.localSummary()).contains("规则集");
    }

    /**
     * 当仓库绑定已确定且规则集已明确时，Assistant 应生成仓库扫描确认动作卡片。
     */
    @Test
    void shouldCreateRepositoryScanActionWhenBindingAndRulesetAreReady() {
        AssistantToolOrchestrator orchestrator = new AssistantToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                new AssistantActionPlannerService(),
                new ObjectMapper()
        );

        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "dashboard",
                12L,
                null,
                "协作成员",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "按团队规则扫一下这个仓库",
                "dashboard",
                12L,
                null,
                null,
                null,
                "conversation-7",
                null,
                null
        );
        PlatformToolDefinition scanStart = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_REPO_SCAN_START,
                "发起仓库扫描",
                "GITLAB",
                "基于指定绑定仓库创建仓库规范扫描任务",
                false,
                "MEDIUM",
                "gitlab:manage",
                true,
                Map.of("bindingId", "绑定ID", "branch", "分支", "rulesetCode", "规则集")
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_REPO_SCAN_START)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_REPO_SCAN_START)).thenReturn(scanStart);

        AssistantGroundingState groundingState = AssistantGroundingState.empty().withBoundSlot(
                "gitlabBinding",
                new com.aiclub.platform.dto.AssistantGroundingTarget(
                        "gitlabBinding",
                        "GITLAB_BINDING",
                        31L,
                        "group/payment-service",
                        "/gitlab",
                        12L,
                        "TOOL_RESULT",
                        Map.of("bindingId", 31L, "projectId", 12L)
                )
        );

        AssistantToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new AssistantToolCallRequest(
                        "call-7",
                        PlatformToolRegistry.TOOL_REPO_SCAN_START,
                        "repo_scan__start",
                        Map.of("rulesetCode", "team-default", "branch", "release/2026.04")
                ),
                "scope-7",
                context,
                request,
                groundingState
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("awaiting_confirmation");
        assertThat(outcome.actions()).hasSize(1);
        assertThat(outcome.actions().get(0).type()).isEqualTo(AssistantActionPlannerService.ACTION_CREATE_REPOSITORY_SCAN_TASK);
        assertThat(outcome.actions().get(0).params()).containsEntry("bindingId", 31L);
        assertThat(outcome.actions().get(0).params()).containsEntry("rulesetCode", "team-default");
    }
}
