package com.aiclub.platform.dto;

/**
 * 业主仓库推送前置上下文。
 * 返回是否可推送及禁用原因，同时回显最近一次推送状态。
 */
public record OwnerRepoPushContextSummary(
        Long bindingId,
        Boolean canPush,
        String disabledReason,
        String lastPushStatus,
        String lastPushMessage,
        String lastPushedAt
) {
}
