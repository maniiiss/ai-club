package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 将技术设计产物人工确认后写回工作项。
 */
public record TechnicalDesignWritebackRequest(
        @NotNull(message = "产物不能为空") Long artifactId,
        @NotBlank(message = "写回方式不能为空") String mode
) {
}
