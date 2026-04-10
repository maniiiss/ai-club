package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TestCaseStepRequest(
        Integer stepNo,
        @NotBlank(message = "测试步骤不能为空")
        @Size(max = 5000, message = "测试步骤长度不能超过5000")
        String action,
        @NotBlank(message = "预期结果不能为空")
        @Size(max = 5000, message = "预期结果长度不能超过5000")
        String expectedResult
) {
}
