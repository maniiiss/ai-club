package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 单条主动上报日志。
 */
public record InternalObservabilityLogLineRequest(
        @Size(max = 20, message = "日志级别长度不能超过20")
        String level,
        @Size(max = 255, message = "日志名称长度不能超过255")
        String logger,
        @Size(max = 120, message = "TraceId 长度不能超过120")
        String traceId,
        @Size(max = 500, message = "来源路径长度不能超过500")
        String sourcePath,
        @Size(max = 50, message = "时间戳长度不能超过50")
        String timestamp,
        @NotBlank(message = "日志消息不能为空")
        String message,
        String raw
) {
}
