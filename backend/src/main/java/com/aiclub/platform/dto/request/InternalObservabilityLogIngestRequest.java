package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 内部日志主动上报请求。
 */
public record InternalObservabilityLogIngestRequest(
        @NotNull(message = "运行实例ID不能为空")
        Long runtimeInstanceId,
        @NotEmpty(message = "日志条目不能为空")
        List<@Valid InternalObservabilityLogLineRequest> entries
) {
}
