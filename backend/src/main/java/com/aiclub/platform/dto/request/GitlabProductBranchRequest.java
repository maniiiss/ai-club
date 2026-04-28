package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GitlabProductBranchRequest(
        @NotBlank(message = "产品线编码不能为空")
        @Size(max = 80, message = "产品线编码长度不能超过80")
        String lineCode,
        @NotBlank(message = "产品线名称不能为空")
        @Size(max = 120, message = "产品线名称长度不能超过120")
        String lineName,
        @NotBlank(message = "分线分支不能为空")
        @Size(max = 120, message = "分线分支长度不能超过120")
        String branchName,
        Boolean enabled
) {
}
