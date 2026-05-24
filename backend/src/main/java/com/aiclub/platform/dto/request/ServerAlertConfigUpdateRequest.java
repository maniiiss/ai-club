package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.util.List;

/**
 * 服务器告警配置更新请求。
 */
public record ServerAlertConfigUpdateRequest(
        Boolean connectivityAlertEnabledOverride,
        @Min(value = 1, message = "CPU 阈值必须在 1 到 100 之间")
        @Max(value = 100, message = "CPU 阈值必须在 1 到 100 之间")
        Integer cpuThresholdPercentOverride,
        @Min(value = 1, message = "内存阈值必须在 1 到 100 之间")
        @Max(value = 100, message = "内存阈值必须在 1 到 100 之间")
        Integer memoryThresholdPercentOverride,
        @Min(value = 1, message = "磁盘阈值必须在 1 到 100 之间")
        @Max(value = 100, message = "磁盘阈值必须在 1 到 100 之间")
        Integer diskThresholdPercentOverride,
        @Min(value = 1, message = "连续越线次数必须在 1 到 20 之间")
        @Max(value = 20, message = "连续越线次数必须在 1 到 20 之间")
        Integer consecutiveBreachesOverride,
        @Min(value = 1, message = "告警冷却分钟数必须在 1 到 1440 之间")
        @Max(value = 1440, message = "告警冷却分钟数必须在 1 到 1440 之间")
        Integer cooldownMinutesOverride,
        List<Long> recipientUserIds
) {
}
