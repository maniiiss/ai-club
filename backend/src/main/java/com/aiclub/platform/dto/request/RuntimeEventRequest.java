package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Map;

/** Pi/其他 Runtime 回传的统一事件，sequence 用于幂等落库和断线恢复。 */
public record RuntimeEventRequest(
        @NotBlank String runId,
        @NotBlank String sessionId,
        @NotNull Long sequence,
        @NotBlank String eventType,
        Map<String, Object> payload
) {
}
