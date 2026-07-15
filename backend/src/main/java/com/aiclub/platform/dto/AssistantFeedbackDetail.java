package com.aiclub.platform.dto;

import java.util.List;

/** GitPilot 反馈详情，包含运营处理时间线。 */
public record AssistantFeedbackDetail(
        AssistantFeedbackSummary feedback,
        List<AssistantFeedbackActivitySummary> activities
) {
    public AssistantFeedbackDetail {
        activities = activities == null ? List.of() : List.copyOf(activities);
    }
}
