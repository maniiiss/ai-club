package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.dto.ServerAlertConfigView;
import com.aiclub.platform.dto.UserOptionSummary;
import com.aiclub.platform.domain.model.UserEntity;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

/**
 * 解析服务器告警默认值与覆盖值的统一入口。
 */
@Service
public class ServerAlertSettingsService {

    private static final int DEFAULT_MONITOR_INTERVAL_SECONDS = 60;
    private static final boolean DEFAULT_CONNECTIVITY_ALERT_ENABLED = true;
    private static final int DEFAULT_CPU_THRESHOLD_PERCENT = 85;
    private static final int DEFAULT_MEMORY_THRESHOLD_PERCENT = 90;
    private static final int DEFAULT_DISK_THRESHOLD_PERCENT = 90;
    private static final int DEFAULT_CONSECUTIVE_BREACHES = 2;
    private static final int DEFAULT_COOLDOWN_MINUTES = 30;

    private final PlatformEnvVarResolver platformEnvVarResolver;

    public ServerAlertSettingsService(PlatformEnvVarResolver platformEnvVarResolver) {
        this.platformEnvVarResolver = platformEnvVarResolver;
    }

    public ServerAlertSettings resolve(ServerInfoEntity entity) {
        return new ServerAlertSettings(
                entity != null && entity.getConnectivityAlertEnabledOverride() != null
                        ? entity.getConnectivityAlertEnabledOverride()
                        : resolveBoolean(PlatformEnvVarRegistry.KEY_SERVER_ALERT_CONNECTIVITY_ENABLED, DEFAULT_CONNECTIVITY_ALERT_ENABLED),
                entity != null && entity.getCpuThresholdPercentOverride() != null
                        ? entity.getCpuThresholdPercentOverride()
                        : resolveInt(PlatformEnvVarRegistry.KEY_SERVER_ALERT_CPU_THRESHOLD_PERCENT, DEFAULT_CPU_THRESHOLD_PERCENT),
                entity != null && entity.getMemoryThresholdPercentOverride() != null
                        ? entity.getMemoryThresholdPercentOverride()
                        : resolveInt(PlatformEnvVarRegistry.KEY_SERVER_ALERT_MEMORY_THRESHOLD_PERCENT, DEFAULT_MEMORY_THRESHOLD_PERCENT),
                entity != null && entity.getDiskThresholdPercentOverride() != null
                        ? entity.getDiskThresholdPercentOverride()
                        : resolveInt(PlatformEnvVarRegistry.KEY_SERVER_ALERT_DISK_THRESHOLD_PERCENT, DEFAULT_DISK_THRESHOLD_PERCENT),
                entity != null && entity.getConsecutiveBreachesOverride() != null
                        ? entity.getConsecutiveBreachesOverride()
                        : resolveInt(PlatformEnvVarRegistry.KEY_SERVER_ALERT_CONSECUTIVE_BREACHES, DEFAULT_CONSECUTIVE_BREACHES),
                entity != null && entity.getCooldownMinutesOverride() != null
                        ? entity.getCooldownMinutesOverride()
                        : resolveInt(PlatformEnvVarRegistry.KEY_SERVER_ALERT_COOLDOWN_MINUTES, DEFAULT_COOLDOWN_MINUTES)
        );
    }

    public int resolveMonitorIntervalSeconds() {
        return resolveInt(PlatformEnvVarRegistry.KEY_SERVER_MONITOR_INTERVAL_SECONDS, DEFAULT_MONITOR_INTERVAL_SECONDS);
    }

    public ServerAlertConfigView toView(ServerInfoEntity entity) {
        ServerAlertSettings settings = resolve(entity);
        List<UserOptionSummary> recipientUsers = entity.getAlertRecipients().stream()
                .filter(UserEntity::isEnabled)
                .sorted(Comparator.comparing(UserEntity::getId))
                .map(this::toUserOptionSummary)
                .toList();
        return new ServerAlertConfigView(
                settings.connectivityAlertEnabled(),
                entity.getConnectivityAlertEnabledOverride(),
                settings.cpuThresholdPercent(),
                entity.getCpuThresholdPercentOverride(),
                settings.memoryThresholdPercent(),
                entity.getMemoryThresholdPercentOverride(),
                settings.diskThresholdPercent(),
                entity.getDiskThresholdPercentOverride(),
                settings.consecutiveBreaches(),
                entity.getConsecutiveBreachesOverride(),
                settings.cooldownMinutes(),
                entity.getCooldownMinutesOverride(),
                recipientUsers
        );
    }

    private UserOptionSummary toUserOptionSummary(UserEntity user) {
        return new UserOptionSummary(user.getId(), user.getUsername(), user.getNickname(), user.getAvatarUrl(), user.isEnabled());
    }

    private boolean resolveBoolean(String envKey, boolean defaultValue) {
        return Boolean.parseBoolean(platformEnvVarResolver.resolveOrDefault(envKey, () -> String.valueOf(defaultValue), String.valueOf(defaultValue)));
    }

    private int resolveInt(String envKey, int defaultValue) {
        try {
            return Integer.parseInt(platformEnvVarResolver.resolveOrDefault(envKey, () -> String.valueOf(defaultValue), String.valueOf(defaultValue)));
        } catch (NumberFormatException exception) {
            return defaultValue;
        }
    }

    /**
     * 告警规则的生效值快照。
     */
    public record ServerAlertSettings(
            boolean connectivityAlertEnabled,
            int cpuThresholdPercent,
            int memoryThresholdPercent,
            int diskThresholdPercent,
            int consecutiveBreaches,
            int cooldownMinutes
    ) {
    }
}
