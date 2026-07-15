package com.aiclub.platform.dto;

import java.util.List;

/**
 * 用户反馈列表项。
 * 业务意图：同时满足公众端“我的反馈”和管理端队列的基础展示需求。
 */
public record AssistantFeedbackSummary(
        Long id,
        Long sessionId,
        Long assistantMessageId,
        Long userMessageId,
        Long submitterUserId,
        String submitterUsername,
        String submitterNickname,
        String vote,
        List<String> reasonCodes,
        String comment,
        String questionSnapshot,
        String answerSnapshot,
        String runtimeRegistryCode,
        String routeName,
        Long projectId,
        String status,
        Long assigneeUserId,
        String resolutionCode,
        String resolutionNote,
        List<String> improvementTags,
        String datasetStatus,
        String createdAt,
        String updatedAt,
        String resolvedAt
) {
    public AssistantFeedbackSummary {
        reasonCodes = reasonCodes == null ? List.of() : List.copyOf(reasonCodes);
        improvementTags = improvementTags == null ? List.of() : List.copyOf(improvementTags);
    }
}
