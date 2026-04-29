package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record TestPlanRequest(
        @NotBlank(message = "测试计划名称不能为空")
        @Size(max = 120, message = "测试计划名称长度不能超过120")
        String name,
        @NotNull(message = "所属项目不能为空")
        Long projectId,
        @NotNull(message = "所属迭代不能为空")
        Long iterationId,
        @Size(max = 30, message = "测试计划状态长度不能超过30")
        String status,
        @Size(max = 2000, message = "测试计划说明长度不能超过2000")
        String description,
        Long automationBindingId,
        @Size(max = 100, message = "自动化目标分支长度不能超过100")
        String automationTargetBranch,
        List<@Valid TestCaseRequest> cases
) {
}
