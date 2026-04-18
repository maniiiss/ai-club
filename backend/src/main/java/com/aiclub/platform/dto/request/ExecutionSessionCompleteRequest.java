package com.aiclub.platform.dto.request;

import java.util.List;

/**
 * runner 完成回调请求。
 * backend 通过该请求更新步骤终态，并补录完整日志产物。
 */
public record ExecutionSessionCompleteRequest(
        String status,
        String outputSnapshot,
        String outputSummary,
        String errorMessage,
        List<ExecutionSessionArtifactRequest> artifacts
) {
}
