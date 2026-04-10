package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record IterationRequest(
        @NotBlank(message = "迭代名称不能为空")
        @Size(max = 120, message = "迭代名称长度不能超过120")
        String name,
        @Size(max = 500, message = "迭代目标长度不能超过500")
        String goal,
        @NotBlank(message = "迭代状态不能为空")
        @Size(max = 30, message = "迭代状态长度不能超过30")
        String status,
        String startDate,
        String endDate,
        @Size(max = 1000, message = "迭代描述长度不能超过1000")
        String description,
        Integer sortOrder
) {
}
