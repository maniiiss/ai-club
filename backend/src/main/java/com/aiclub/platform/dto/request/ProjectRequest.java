package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ProjectRequest(
        @NotBlank(message = "项目名称不能为空")
        @Size(max = 100, message = "项目名称长度不能超过100")
        String name,
        @Size(max = 50, message = "负责人长度不能超过50")
        String owner,
        Long ownerUserId,
        List<Long> memberUserIds,
        @NotBlank(message = "项目状态不能为空")
        @Size(max = 30, message = "项目状态长度不能超过30")
        String status,
        @Size(max = 500, message = "项目描述长度不能超过500")
        String description
) {
}
