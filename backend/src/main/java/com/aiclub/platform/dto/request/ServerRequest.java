package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 服务器接入信息维护请求。
 * 敏感字段只在写入时出现，读取详情时仅回传 configured 状态。
 */
public record ServerRequest(
        @NotBlank(message = "服务器名称不能为空")
        String name,
        String description,
        @NotBlank(message = "服务器地址不能为空")
        String host,
        @NotNull(message = "SSH 端口不能为空")
        @Min(value = 1, message = "SSH 端口必须在 1 到 65535 之间")
        @Max(value = 65535, message = "SSH 端口必须在 1 到 65535 之间")
        Integer port,
        @NotBlank(message = "SSH 用户名不能为空")
        String username,
        @NotBlank(message = "操作系统类型不能为空")
        String osType,
        @NotBlank(message = "认证方式不能为空")
        String authType,
        String password,
        String privateKey,
        String privateKeyPassphrase,
        Boolean enabled,
        Boolean jumpHostEnabled,
        String jumpHost,
        @Min(value = 1, message = "跳板机端口必须在 1 到 65535 之间")
        @Max(value = 65535, message = "跳板机端口必须在 1 到 65535 之间")
        Integer jumpPort,
        String jumpUsername,
        String jumpAuthType,
        String jumpPassword,
        String jumpPrivateKey,
        String jumpPrivateKeyPassphrase,
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
