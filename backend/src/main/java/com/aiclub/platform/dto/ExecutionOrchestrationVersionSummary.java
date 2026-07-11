package com.aiclub.platform.dto;
import java.time.LocalDateTime; import java.util.List;
/** 草稿或历史发布版本详情。 */
public record ExecutionOrchestrationVersionSummary(Long id, Long profileId, Integer versionNo, String status,
        Long sourceVersionId, Long revision, LocalDateTime createdAt, LocalDateTime publishedAt, List<StepBinding> stepBindings) {
    public record StepBinding(String stepCode, Long agentId, Integer timeoutSeconds, String agentName,
                              String accessType, String runtimeType, boolean valid, String invalidReason) {}
}
