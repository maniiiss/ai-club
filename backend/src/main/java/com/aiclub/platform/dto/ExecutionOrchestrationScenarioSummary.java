package com.aiclub.platform.dto;
import java.util.List;
/** 面向双端的代码注册场景及当前项目有效编排状态。 */
public record ExecutionOrchestrationScenarioSummary(String scenarioCode, String scenarioName,
        List<Step> steps, boolean effectiveReady, String effectiveScope, Long publishedVersionId,
        String effectiveInvalidReason) {
    public record Step(String stepCode, String stepName, boolean agentRequired) {}
}
