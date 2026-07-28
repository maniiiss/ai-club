package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationContext;
import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.agentusage.AgentType;
import com.aiclub.platform.agentusage.InvocationStatus;
import com.aiclub.platform.agentusage.TriggerSource;
import com.aiclub.platform.agentusage.UsageSink;
import com.aiclub.platform.dto.ModelUsageIngestDtos.ModelUsageIngestItem;
import com.aiclub.platform.security.AuthContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

/**
 * 接收 code-processing 跨服务回传的模型用量事件并落账到 {@code agent_invocation_log}。
 *
 * <p>业务意图：代码审核、仓库扫描等模型调用在 Python 侧发起，不经过后端
 * {@code ModelConfigService}，因此走兜底也捕获不到。本服务通过内部回传端点
 * 把这些调用的 usage 统一记入统计体系。
 *
 * <p>落账委托 {@link AgentInvocationRecorder#record}，复用其 REQUIRES_NEW 独立事务
 * 与异常吞咽机制，单条失败不影响整体回传。
 */
@Service
public class ModelUsageIngestService {

    private static final Logger log = LoggerFactory.getLogger(ModelUsageIngestService.class);

    private final AgentInvocationRecorder agentInvocationRecorder;

    public ModelUsageIngestService(AgentInvocationRecorder agentInvocationRecorder) {
        this.agentInvocationRecorder = agentInvocationRecorder;
    }

    /**
     * 批量落账用量事件，返回成功记入条数。
     */
    public int ingest(List<ModelUsageIngestItem> items) {
        if (items == null || items.isEmpty()) {
            return 0;
        }
        int accepted = 0;
        for (ModelUsageIngestItem item : items) {
            if (item == null) {
                continue;
            }
            try {
                persistOne(item);
                accepted++;
            } catch (Exception ex) {
                // recorder.record 内部已吞异常，此处防御性兜底，避免单条异常中断批量。
                log.warn("模型用量事件落账异常：usageKey={}, agentType={}",
                        item.usageKey(), item.agentType(), ex);
            }
        }
        return accepted;
    }

    private void persistOne(ModelUsageIngestItem item) {
        AgentType agentType = resolveAgentType(item.agentType());
        InvocationStatus status = resolveStatus(item.status());
        // code-processing 调用由后端转发触发，统一记为系统自动调用。
        AuthContext authSnapshot = item.userId() == null ? null
                : new AuthContext(item.userId(), null, null, Set.of(), Set.of());
        AgentInvocationContext ctx = AgentInvocationContext.builder(agentType)
                .action(item.action())
                .triggerSource(TriggerSource.AUTO)
                .provider(item.provider())
                .modelName(item.modelName())
                .modelConfigId(item.modelConfigId())
                .projectId(item.projectId())
                .bizId(item.bizId())
                .correlationId(item.usageKey())
                .captureAuthContext(authSnapshot)
                .build();
        UsageSink sink = new UsageSink();
        sink.setUsage(item.promptTokens(), item.completionTokens(), item.totalTokens());
        agentInvocationRecorder.record(ctx, sink, status, null, item.durationMs());
    }

    private AgentType resolveAgentType(String agentType) {
        if (agentType == null || agentType.isBlank()) {
            return AgentType.UNKNOWN_MODEL_CALL;
        }
        try {
            return AgentType.valueOf(agentType.trim());
        } catch (IllegalArgumentException ex) {
            log.warn("未知的 agentType 回传值，回退为 UNKNOWN_MODEL_CALL：{}", agentType);
            return AgentType.UNKNOWN_MODEL_CALL;
        }
    }

    private InvocationStatus resolveStatus(String status) {
        if (status == null || status.isBlank()) {
            return InvocationStatus.SUCCESS;
        }
        try {
            return InvocationStatus.valueOf(status.trim());
        } catch (IllegalArgumentException ex) {
            log.warn("未知的 status 回传值，回退为 SUCCESS：{}", status);
            return InvocationStatus.SUCCESS;
        }
    }
}
