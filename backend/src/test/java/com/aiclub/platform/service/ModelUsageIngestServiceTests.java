package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationContext;
import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.agentusage.AgentType;
import com.aiclub.platform.agentusage.InvocationStatus;
import com.aiclub.platform.agentusage.UsageSink;
import com.aiclub.platform.dto.ModelUsageIngestDtos.ModelUsageIngestItem;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 锁定 code-processing 用量回传的落账逻辑：正确构造上下文、usage 回填、
 * 未知枚举回退、空入参保护。
 */
@ExtendWith(MockitoExtension.class)
class ModelUsageIngestServiceTests {

    @Mock
    private AgentInvocationRecorder agentInvocationRecorder;

    private ModelUsageIngestService service() {
        return new ModelUsageIngestService(agentInvocationRecorder);
    }

    private ModelUsageIngestItem item(String usageKey, String agentType, String status) {
        return new ModelUsageIngestItem(
                usageKey, agentType, "OPENAI", "gpt-4o", 7L, 101L, 5L, 2001L, "REVIEW",
                120, 45, 165, 30, 2300L, status, "2026-07-26T10:00:00Z");
    }

    @Test
    void shouldRecordEachItemWithUsageAndContext() {
        ModelUsageIngestService service = service();

        int accepted = service.ingest(List.of(
                item("review:1", "CODE_REVIEW", "SUCCESS"),
                item("review:2", "REPOSITORY_SCAN", "FAILURE")
        ));

        assertThat(accepted).isEqualTo(2);
        ArgumentCaptor<AgentInvocationContext> ctxCaptor = ArgumentCaptor.forClass(AgentInvocationContext.class);
        ArgumentCaptor<UsageSink> sinkCaptor = ArgumentCaptor.forClass(UsageSink.class);
        verify(agentInvocationRecorder, times(2))
                .record(ctxCaptor.capture(), sinkCaptor.capture(), any(InvocationStatus.class), eq(null), anyLong());

        AgentInvocationContext firstCtx = ctxCaptor.getAllValues().get(0);
        assertThat(firstCtx.getAgentType()).isEqualTo(AgentType.CODE_REVIEW);
        assertThat(firstCtx.getProvider()).isEqualTo("OPENAI");
        assertThat(firstCtx.getModelName()).isEqualTo("gpt-4o");
        assertThat(firstCtx.getModelConfigId()).isEqualTo(7L);
        assertThat(firstCtx.getProjectId()).isEqualTo(5L);
        assertThat(firstCtx.getBizId()).isEqualTo(2001L);
        assertThat(firstCtx.getCorrelationId()).isEqualTo("review:1");
        assertThat(firstCtx.getAuthContextSnapshot()).isNotNull();
        assertThat(firstCtx.getAuthContextSnapshot().userId()).isEqualTo(101L);

        UsageSink firstSink = sinkCaptor.getAllValues().get(0);
        assertThat(firstSink.getPromptTokens()).isEqualTo(120);
        assertThat(firstSink.getCompletionTokens()).isEqualTo(45);
        assertThat(firstSink.getTotalTokens()).isEqualTo(165);
    }

    @Test
    void shouldFallbackUnknownAgentTypeAndStatus() {
        ModelUsageIngestService service = service();

        service.ingest(List.of(item("review:3", "NOT_A_REAL_TYPE", "WEIRD_STATUS")));

        ArgumentCaptor<AgentInvocationContext> ctxCaptor = ArgumentCaptor.forClass(AgentInvocationContext.class);
        verify(agentInvocationRecorder)
                .record(ctxCaptor.capture(), any(UsageSink.class), any(InvocationStatus.class), eq(null), anyLong());
        // 未知 agentType 应回退为兜底分类，状态回退为 SUCCESS，避免回传端误用导致整批失败。
        assertThat(ctxCaptor.getValue().getAgentType()).isEqualTo(AgentType.UNKNOWN_MODEL_CALL);
    }

    @Test
    void shouldSkipNullItemsAndReturnZeroForEmptyInput() {
        ModelUsageIngestService service = service();

        assertThat(service.ingest(null)).isZero();
        assertThat(service.ingest(List.of())).isZero();
        assertThat(service.ingest(java.util.Arrays.asList(null, null))).isZero();

        verify(agentInvocationRecorder, never())
                .record(any(AgentInvocationContext.class), any(UsageSink.class), any(InvocationStatus.class), any(), anyLong());
    }
}
