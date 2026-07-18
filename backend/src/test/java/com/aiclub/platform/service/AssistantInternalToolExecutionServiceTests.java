package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantConversationContextSnapshot;
import com.aiclub.platform.dto.AssistantConversationRequestSnapshot;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantInternalToolExecuteResponse;
import com.aiclub.platform.dto.AssistantSelectionCard;
import com.aiclub.platform.dto.AssistantSelectionOption;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.request.AssistantInternalToolExecuteRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 验证 MCP 工具桥在候选卡片等待确认期间不会继续执行工具并覆盖卡片状态。
 */
@ExtendWith(MockitoExtension.class)
class AssistantInternalToolExecutionServiceTests {

    @Mock
    private AssistantConversationStateStore assistantConversationStateStore;

    @Mock
    private AssistantMcpSessionTokenService assistantMcpSessionTokenService;

    @Mock
    private AssistantToolOrchestrator assistantToolOrchestrator;

    @Mock
    private AssistantFallbackAnswerService assistantFallbackAnswerService;

    @Mock
    private PlatformToolRegistry platformToolRegistry;

    @Mock
    private AssistantMcpServerService assistantMcpServerService;

    @Test
    void shouldKeepPendingSelectionCardsWhenModelCallsAnotherTool() {
        AssistantInternalToolExecutionService service = new AssistantInternalToolExecutionService(
                assistantConversationStateStore,
                assistantMcpSessionTokenService,
                assistantToolOrchestrator,
                assistantFallbackAnswerService,
                platformToolRegistry,
                assistantMcpServerService
        );
        AssistantSelectionCard card = new AssistantSelectionCard(
                "project",
                "请确认项目",
                "请选择一个项目后继续。",
                "帮我加个需求：用户登录设计",
                List.of(new AssistantSelectionOption("project", "PROJECT", 4L, "CRM项目", "进行中", "/projects/4", 25D, List.of()))
        );
        AssistantConversationState state = new AssistantConversationState(
                "scope-1",
                "conversation-1",
                new CurrentUserInfo(5L, "pm-user", "项目经理", "", "", "", "", true,
                        List.of("PM"), List.of("项目经理"), List.of("hermes:chat"), List.of()),
                new AssistantConversationContextSnapshot("projects", null, null, null, null, "项目经理", List.of(), List.of(), "项目上下文"),
                new AssistantConversationRequestSnapshot("帮我加个需求：用户登录设计", "projects", null, null, null, null),
                "hcs_0123456789abcdef",
                List.of(), List.of(), List.of(), List.of(), List.of(card),
                AssistantGroundingState.empty().withPendingSelectionCards(List.of(card), "帮我加个需求：用户登录设计"),
                List.of(), ""
        );
        when(assistantMcpSessionTokenService.parseToken("token"))
                .thenReturn(new AssistantMcpSessionTokenService.AssistantMcpSessionClaims(5L, "scope-1", "conversation-1", Instant.now().plusSeconds(60)));
        when(assistantConversationStateStore.load("scope-1", "conversation-1")).thenReturn(Optional.of(state));
        when(assistantFallbackAnswerService.composeSelectionSummary(List.of(card)))
                .thenReturn("请先选择候选项目。");

        AssistantInternalToolExecuteResponse response = service.execute(
                new AssistantInternalToolExecuteRequest("token", "project.search", Map.of())
        );

        assertThat(response.message()).isEqualTo("请先选择候选项目。");
        verifyNoInteractions(assistantToolOrchestrator, platformToolRegistry, assistantMcpServerService);
    }
}
