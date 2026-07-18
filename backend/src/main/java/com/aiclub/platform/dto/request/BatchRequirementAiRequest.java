package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 公众端批量需求 AI 请求，仅接受当前页手动选择的需求工作项。 */
public record BatchRequirementAiRequest(
        @NotEmpty(message = "需求工作项不能为空")
        @Size(max = 20, message = "一次最多分析20条需求")
        List<@NotNull(message = "需求工作项ID不能为空") Long> taskIds,
        @NotBlank(message = "AI 动作不能为空")
        String action
) {
}
