package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.HermesToolCallRequest;
import com.aiclub.platform.dto.HermesToolExecutionOutcome;
import com.aiclub.platform.dto.PlatformToolCandidate;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 验证 Hermes 工具编排在唯一命中、歧义命中和写操作确认场景下的稳定行为。
 */
@ExtendWith(MockitoExtension.class)
class HermesToolOrchestratorTests {

    @Mock
    private PlatformToolExecutor platformToolExecutor;

    @Mock
    private PlatformToolRegistry platformToolRegistry;

    @Mock
    private HermesActionPlannerService hermesActionPlannerService;

    /**
     * 当搜索结果形成高分唯一命中时，应自动绑定 workItem grounding，并继续 loop。
     */
    @Test
    void shouldBindGroundingWhenSearchReturnsUniqueHighScoreCandidate() {
        HermesToolOrchestrator orchestrator = new HermesToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                hermesActionPlannerService,
                new ObjectMapper()
        );

        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesChatRequest request = new HermesChatRequest(
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

        HermesToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new HermesToolCallRequest(
                        "call-1",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "REQ-123", "projectId", 12L)
                ),
                "scope-1",
                context,
                request,
                HermesGroundingState.empty()
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
        HermesToolOrchestrator orchestrator = new HermesToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                hermesActionPlannerService,
                new ObjectMapper()
        );

        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesChatRequest request = new HermesChatRequest(
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

        HermesToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new HermesToolCallRequest(
                        "call-2",
                        PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                        "work_item__search",
                        Map.of("keyword", "登录改造", "projectId", 12L)
                ),
                "scope-2",
                context,
                request,
                HermesGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("awaiting_selection");
        assertThat(outcome.selectionCards()).hasSize(1);
        assertThat(outcome.selectionCards().get(0).options()).hasSize(2);
        assertThat(outcome.groundingState().boundSlot("workItem")).isNull();
    }

    /**
     * 当 Hermes 发起写工具调用时，平台应直接转成确认动作卡片。
     */
    @Test
    void shouldConvertWriteToolCallToActionConfirmation() {
        HermesToolOrchestrator orchestrator = new HermesToolOrchestrator(
                platformToolExecutor,
                platformToolRegistry,
                hermesActionPlannerService,
                new ObjectMapper()
        );

        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesChatRequest request = new HermesChatRequest(
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
        HermesActionSummary action = new HermesActionSummary(
                "CREATE_WORK_ITEM_DRAFT",
                "创建需求草稿",
                "确认后会在当前项目下创建一个“需求”草稿。",
                true,
                Map.of("projectId", 12L, "content", "新增用户登录页")
        );

        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT)).thenReturn(true);
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT)).thenReturn(workItemCreate);
        when(hermesActionPlannerService.createActionFromToolCall(
                eq(PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT),
                any(),
                any(),
                eq("帮我创建一个需求")
        )).thenReturn(action);

        HermesToolExecutionOutcome outcome = orchestrator.executeToolCall(
                new HermesToolCallRequest(
                        "call-3",
                        PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT,
                        "work_item__create_draft",
                        Map.of("projectId", 12L, "content", "新增用户登录页")
                ),
                "scope-3",
                context,
                request,
                HermesGroundingState.empty()
        );

        assertThat(outcome.stopLoop()).isTrue();
        assertThat(outcome.stopReason()).isEqualTo("awaiting_confirmation");
        assertThat(outcome.actions()).hasSize(1);
        assertThat(outcome.actions().get(0).type()).isEqualTo("CREATE_WORK_ITEM_DRAFT");
    }
}
