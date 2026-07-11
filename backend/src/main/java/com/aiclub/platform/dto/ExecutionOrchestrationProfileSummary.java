package com.aiclub.platform.dto;
import java.util.List;
/** 编排配置及版本历史，供管理端在一个响应中完成列表和编辑。 */
public record ExecutionOrchestrationProfileSummary(Long id, String scopeType, Long projectId, String scenarioCode,
        Long draftVersionId, Long publishedVersionId, List<ExecutionOrchestrationVersionSummary> versions) {}
