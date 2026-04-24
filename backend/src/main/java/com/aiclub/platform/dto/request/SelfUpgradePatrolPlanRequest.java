package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SelfUpgradePatrolPlanRequest(
        @NotBlank(message = "计划名称不能为空")
        @Size(max = 120, message = "计划名称不能超过120个字符")
        String name,
        @Size(max = 1000, message = "计划说明不能超过1000个字符")
        String description,
        @NotNull(message = "环境档案不能为空")
        Long environmentProfileId,
        @NotNull(message = "巡检模型不能为空")
        Long aiModelConfigId,
        @Size(max = 100, message = "Cron 不能超过100个字符")
        String schedulerCron,
        Boolean schedulerEnabled,
        Integer maxExplorationSteps,
        Integer targetTimeoutSeconds,
        Integer runTimeoutSeconds,
        Boolean enabled,
        @Valid
        List<SelfUpgradePatrolTargetRequest> targets
) {
}
