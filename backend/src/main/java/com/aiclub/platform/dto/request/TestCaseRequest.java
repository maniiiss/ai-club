package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record TestCaseRequest(
        @NotBlank(message = "测试用例标题不能为空")
        @Size(max = 200, message = "测试用例标题长度不能超过200")
        String title,
        @Size(max = 120, message = "功能模块长度不能超过120")
        String moduleName,
        @Size(max = 30, message = "用例类型长度不能超过30")
        String caseType,
        @Size(max = 20, message = "优先级长度不能超过20")
        String priority,
        @Size(max = 20000, message = "前置条件长度不能超过20000")
        String precondition,
        @Size(max = 20000, message = "备注长度不能超过20000")
        String remarks,
        Integer sortOrder,
        @Size(max = 30, message = "自动化类型长度不能超过30")
        String automationType,
        @Size(max = 2000, message = "自动化提示长度不能超过2000")
        String automationHint,
        List<@Valid TestCaseStepRequest> steps
) {
}
