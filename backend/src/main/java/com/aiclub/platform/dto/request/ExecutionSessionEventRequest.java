package com.aiclub.platform.dto.request;

/**
 * runner 单条事件负载。
 * 文本、命令、摘要、进度等字段按事件类型择需填写。
 */
public record ExecutionSessionEventRequest(
        String eventType,
        String streamKind,
        String text,
        String currentCommand,
        Integer progressPercent,
        String summary,
        Long artifactId
) {
}
