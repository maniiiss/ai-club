package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantConversationContextSnapshot;
import com.aiclub.platform.dto.AssistantConversationRequestSnapshot;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantGroundingTarget;
import com.aiclub.platform.dto.AssistantInternalToolExecuteResponse;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.dto.request.AssistantInternalToolExecuteRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Assistant 模型工具调用失败后的服务端兜底流程。
 */
@ExtendWith(MockitoExtension.class)
class AssistantActionFallbackServiceTests {

    @Mock
    private AssistantInternalToolExecutionService assistantInternalToolExecutionService;

    @Mock
    private AssistantConversationStateStore assistantConversationStateStore;

    @Mock
    private RepositoryScanRulesetService repositoryScanRulesetService;

    /**
     * 模型因 system_session_token 漏传而放弃工具调用时，服务端应复用 Redis 中保存的 MCP 会话令牌完成工作项查询。
     */
    @Test
    void shouldFallbackToWorkItemSearchWhenModelReportsMissingSystemToken() {
        AssistantActionFallbackService service = new AssistantActionFallbackService(
                assistantInternalToolExecutionService,
                assistantConversationStateStore,
                new ObjectMapper(),
                repositoryScanRulesetService
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我查找示例项目 #4 最近的需求工作项",
                "projects",
                null,
                null,
                null,
                null,
                "conversation-1",
                null,
                false
        );
        AssistantConversationState baseState = buildState(AssistantGroundingState.empty());
        AssistantConversationState afterWorkItemSearch = buildState(AssistantGroundingState.empty().withBoundSlot(
                "project",
                new AssistantGroundingTarget("project", "PROJECT", 4L, "示例项目", "/projects/4/iterations", 4L, "TEST", Map.of())
        ));

        when(assistantInternalToolExecutionService.execute(eq(new AssistantInternalToolExecuteRequest(
                "hcs_0123456789abcdef",
                "work_item.search",
                Map.of("keyword", "需求", "projectId", 4L)
        )))).thenReturn(new AssistantInternalToolExecuteResponse("最近需求工作项：REQ-4 客户线索跟进"));
        when(assistantConversationStateStore.load("scope-1", "conversation-1"))
                .thenReturn(Optional.of(afterWorkItemSearch));

        AssistantActionFallbackService.AssistantFallbackResult result = service.trySearchWorkItems(baseState, request);

        assertThat(result).isNotNull();
        assertThat(result.content()).isEqualTo("最近需求工作项：REQ-4 客户线索跟进");
        assertThat(result.state()).isEqualTo(afterWorkItemSearch);
        ArgumentCaptor<AssistantInternalToolExecuteRequest> requestCaptor = ArgumentCaptor.forClass(AssistantInternalToolExecuteRequest.class);
        verify(assistantInternalToolExecutionService, times(1)).execute(requestCaptor.capture());
        assertThat(requestCaptor.getAllValues()).extracting(AssistantInternalToolExecuteRequest::toolCode)
                .containsExactly("work_item.search");
    }

    /**
     * 模型因令牌格式问题无法查询项目迭代时，服务端应直接使用会话态令牌调用项目迭代工具。
     */
    @Test
    void shouldFallbackToProjectIterationsWhenModelReportsTokenFormatIssue() {
        AssistantActionFallbackService service = new AssistantActionFallbackService(
                assistantInternalToolExecutionService,
                assistantConversationStateStore,
                new ObjectMapper(),
                repositoryScanRulesetService
        );
        AssistantChatRequest request = new AssistantChatRequest(
                "帮我查询示例项目 #4 的迭代信息",
                "projects",
                null,
                null,
                null,
                null,
                "conversation-1",
                null,
                false
        );
        AssistantConversationState baseState = buildState(AssistantGroundingState.empty());
        AssistantConversationState afterProjectRead = buildState(AssistantGroundingState.empty().withBoundSlot(
                "project",
                new AssistantGroundingTarget("project", "PROJECT", 4L, "示例项目", "/projects/4/iterations", 4L, "TEST", Map.of())
        ));

        when(assistantInternalToolExecutionService.execute(eq(new AssistantInternalToolExecuteRequest(
                "hcs_0123456789abcdef",
                "project.list_iterations",
                Map.of("projectId", 4L)
        )))).thenReturn(new AssistantInternalToolExecuteResponse("示例项目最近迭代：V1.0、V1.1"));
        when(assistantConversationStateStore.load("scope-1", "conversation-1"))
                .thenReturn(Optional.of(afterProjectRead));

        AssistantActionFallbackService.AssistantFallbackResult result = service.tryReadProjectInfo(baseState, request);

        assertThat(result).isNotNull();
        assertThat(result.content()).isEqualTo("示例项目最近迭代：V1.0、V1.1");
        assertThat(result.state()).isEqualTo(afterProjectRead);
        ArgumentCaptor<AssistantInternalToolExecuteRequest> requestCaptor = ArgumentCaptor.forClass(AssistantInternalToolExecuteRequest.class);
        verify(assistantInternalToolExecutionService).execute(requestCaptor.capture());
        assertThat(requestCaptor.getValue().toolCode()).isEqualTo("project.list_iterations");
    }

    private AssistantConversationState buildState(AssistantGroundingState groundingState) {
        return new AssistantConversationState(
                "scope-1",
                "conversation-1",
                new CurrentUserInfo(
                        5L,
                        "pm-user",
                        "项目经理",
                        "",
                        "",
                        "",
                        "",
                        true,
                        List.of("PM"),
                        List.of("项目经理"),
                        List.of("hermes:chat", "project:view", "task:view"),
                        List.of()
                ),
                new AssistantConversationContextSnapshot(
                        "projects",
                        null,
                        null,
                        null,
                        null,
                        "项目经理",
                        List.of(),
                        List.of(),
                        "项目上下文"
                ),
                new AssistantConversationRequestSnapshot("帮我查找示例项目 #4 最近的需求工作项", "projects", null, null, null, null),
                "hcs_0123456789abcdef",
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                groundingState,
                List.of(),
                ""
        );
    }
}
