package com.aiclub.platform.dto;

import java.util.List;

/**
 * 服务器告警有效配置视图。
 * 详情页展示的是“环境变量默认值 + 服务器覆盖值”合并后的实际生效配置。
 */
public record ServerAlertConfigView(
        boolean connectivityAlertEnabled,
        Boolean connectivityAlertEnabledOverride,
        int cpuThresholdPercent,
        Integer cpuThresholdPercentOverride,
        int memoryThresholdPercent,
        Integer memoryThresholdPercentOverride,
        int diskThresholdPercent,
        Integer diskThresholdPercentOverride,
        int consecutiveBreaches,
        Integer consecutiveBreachesOverride,
        int cooldownMinutes,
        Integer cooldownMinutesOverride,
        List<UserOptionSummary> recipientUsers
) {
}
