package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesConversationContextSnapshot;
import com.aiclub.platform.dto.HermesConversationRequestSnapshot;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesInternalToolExecuteResponse;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.HermesInternalToolExecuteRequest;
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
 * 验证 Hermes 模型工具调用失败后的服务端兜底流程。
 */
@ExtendWith(MockitoExtension.class)
class HermesActionFallbackServiceTests {

    @Mock
    private HermesInternalToolExecutionService hermesInternalToolExecutionService;

    @Mock
    private HermesConversationStateStore hermesConversationStateStore;

    @Mock
    private RepositoryScanRulesetService repositoryScanRulesetService;

    /**
     * 模型因 system_session_token 漏传而放弃工具调用时，服务端应复用 Redis 中保存的 MCP 会话令牌完成工作项查询。
     */
    @Test
    void shouldFallbackToWorkItemSearchWhenModelReportsMissingSystemToken() {
        HermesActionFallbackService service = new HermesActionFallbackService(
                hermesInternalToolExecutionService,
                hermesConversationStateStore,
                new ObjectMapper(),
                repositoryScanRulesetService
        );
        HermesChatRequest request = new HermesChatRequest(
                "帮我查找 CRM项目 #4 最近的需求工作项",
                "projects",
                null,
                null,
                null,
                null,
                "conversation-1",
                null,
                false
        );
        HermesConversationState baseState = buildState(HermesGroundingState.empty());
        HermesConversationState afterWorkItemSearch = buildState(HermesGroundingState.empty().withBoundSlot(
                "project",
                new HermesGroundingTarget("project", "PROJECT", 4L, "CRM项目", "/projects/4/iterations", 4L, "TEST", Map.of())
        ));

        when(hermesInternalToolExecutionService.execute(eq(new HermesInternalToolExecuteRequest(
                "hcs_0123456789abcdef",
                "work_item.search",
                Map.of("keyword", "需求", "projectId", 4L)
        )))).thenReturn(new HermesInternalToolExecuteResponse("最近需求工作项：REQ-4 客户线索跟进"));
        when(hermesConversationStateStore.load("scope-1", "conversation-1"))
                .thenReturn(Optional.of(afterWorkItemSearch));

        HermesActionFallbackService.HermesFallbackResult result = service.trySearchWorkItems(baseState, request);

        assertThat(result).isNotNull();
        assertThat(result.content()).isEqualTo("最近需求工作项：REQ-4 客户线索跟进");
        assertThat(result.state()).isEqualTo(afterWorkItemSearch);
        ArgumentCaptor<HermesInternalToolExecuteRequest> requestCaptor = ArgumentCaptor.forClass(HermesInternalToolExecuteRequest.class);
        verify(hermesInternalToolExecutionService, times(1)).execute(requestCaptor.capture());
        assertThat(requestCaptor.getAllValues()).extracting(HermesInternalToolExecuteRequest::toolCode)
                .containsExactly("work_item.search");
    }

    /**
     * 模型因令牌格式问题无法查询项目迭代时，服务端应直接使用会话态令牌调用项目迭代工具。
     */
    @Test
    void shouldFallbackToProjectIterationsWhenModelReportsTokenFormatIssue() {
        HermesActionFallbackService service = new HermesActionFallbackService(
                hermesInternalToolExecutionService,
                hermesConversationStateStore,
                new ObjectMapper(),
                repositoryScanRulesetService
        );
        HermesChatRequest request = new HermesChatRequest(
                "帮我查询 CRM项目 #4 的迭代信息",
                "projects",
                null,
                null,
                null,
                null,
                "conversation-1",
                null,
                false
        );
        HermesConversationState baseState = buildState(HermesGroundingState.empty());
        HermesConversationState afterProjectRead = buildState(HermesGroundingState.empty().withBoundSlot(
                "project",
                new HermesGroundingTarget("project", "PROJECT", 4L, "CRM项目", "/projects/4/iterations", 4L, "TEST", Map.of())
        ));

        when(hermesInternalToolExecutionService.execute(eq(new HermesInternalToolExecuteRequest(
                "hcs_0123456789abcdef",
                "project.list_iterations",
                Map.of("projectId", 4L)
        )))).thenReturn(new HermesInternalToolExecuteResponse("CRM项目最近迭代：V1.0、V1.1"));
        when(hermesConversationStateStore.load("scope-1", "conversation-1"))
                .thenReturn(Optional.of(afterProjectRead));

        HermesActionFallbackService.HermesFallbackResult result = service.tryReadProjectInfo(baseState, request);

        assertThat(result).isNotNull();
        assertThat(result.content()).isEqualTo("CRM项目最近迭代：V1.0、V1.1");
        assertThat(result.state()).isEqualTo(afterProjectRead);
        ArgumentCaptor<HermesInternalToolExecuteRequest> requestCaptor = ArgumentCaptor.forClass(HermesInternalToolExecuteRequest.class);
        verify(hermesInternalToolExecutionService).execute(requestCaptor.capture());
        assertThat(requestCaptor.getValue().toolCode()).isEqualTo("project.list_iterations");
    }

    private HermesConversationState buildState(HermesGroundingState groundingState) {
        return new HermesConversationState(
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
                new HermesConversationContextSnapshot(
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
                new HermesConversationRequestSnapshot("帮我查找 CRM项目 #4 最近的需求工作项", "projects", null, null, null, null),
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
