package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerAlertStateEntity;
import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.ServerAlertStateRepository;
import com.aiclub.platform.repository.ServerInfoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 负责服务器资源告警状态流转与站内通知发送。
 */
@Service
@Transactional
public class ServerAlertService {

    private static final String ALERT_CONNECTIVITY = "CONNECTIVITY";
    private static final String ALERT_CPU = "CPU";
    private static final String ALERT_MEMORY = "MEMORY";
    private static final String ALERT_DISK = "DISK";

    private final ServerAlertStateRepository serverAlertStateRepository;
    private final ServerInfoRepository serverInfoRepository;
    private final ServerAlertSettingsService serverAlertSettingsService;
    private final NotificationService notificationService;

    public ServerAlertService(ServerAlertStateRepository serverAlertStateRepository,
                              ServerInfoRepository serverInfoRepository,
                              ServerAlertSettingsService serverAlertSettingsService,
                              NotificationService notificationService) {
        this.serverAlertStateRepository = serverAlertStateRepository;
        this.serverInfoRepository = serverInfoRepository;
        this.serverAlertSettingsService = serverAlertSettingsService;
        this.notificationService = notificationService;
    }

    public void handleProbeSuccess(ServerInfoEntity server, ServerSshGateway.ServerProbeSnapshot snapshot) {
        ServerAlertSettingsService.ServerAlertSettings settings = serverAlertSettingsService.resolve(server);
        recoverConnectivityIfNeeded(server);
        evaluateMetric(server, ALERT_CPU, "CPU", snapshot.cpuUsagePercent(), settings.cpuThresholdPercent(), settings);
        evaluateMetric(server, ALERT_MEMORY, "内存", snapshot.memoryUsagePercent(), settings.memoryThresholdPercent(), settings);
        evaluateMetric(server, ALERT_DISK, "磁盘", snapshot.diskUsagePercent(), settings.diskThresholdPercent(), settings);
        refreshActiveAlertCount(server);
    }

    public void handleProbeFailure(ServerInfoEntity server, String message) {
        ServerAlertSettingsService.ServerAlertSettings settings = serverAlertSettingsService.resolve(server);
        recoverMetricIfNeeded(server, ALERT_CPU);
        recoverMetricIfNeeded(server, ALERT_MEMORY);
        recoverMetricIfNeeded(server, ALERT_DISK);
        if (settings.connectivityAlertEnabled()) {
            ServerAlertStateEntity state = resolveState(server, ALERT_CONNECTIVITY, "连通性");
            int nextCount = state.getConsecutiveBreachCount() == null ? 1 : state.getConsecutiveBreachCount() + 1;
            state.setConsecutiveBreachCount(nextCount);
            state.setLastObservedValue(null);
            state.setLastMessage(limitMessage(message));
            if (nextCount >= settings.consecutiveBreaches()) {
                triggerAlertIfAllowed(server, state, "服务器“" + server.getName() + "”连接失败：" + limitMessage(message), settings.cooldownMinutes());
            }
            serverAlertStateRepository.save(state);
        } else {
            recoverConnectivityIfNeeded(server);
        }
        refreshActiveAlertCount(server);
    }

    private void evaluateMetric(ServerInfoEntity server,
                                String alertCode,
                                String alertName,
                                Integer currentValue,
                                int threshold,
                                ServerAlertSettingsService.ServerAlertSettings settings) {
        if (currentValue == null) {
            recoverMetricIfNeeded(server, alertCode);
            return;
        }
        ServerAlertStateEntity state = resolveState(server, alertCode, alertName);
        state.setLastObservedValue(currentValue);
        if (currentValue >= threshold) {
            int nextCount = state.getConsecutiveBreachCount() == null ? 1 : state.getConsecutiveBreachCount() + 1;
            state.setConsecutiveBreachCount(nextCount);
            state.setLastMessage(alertName + "使用率 " + currentValue + "%");
            if (nextCount >= settings.consecutiveBreaches()) {
                triggerAlertIfAllowed(
                        server,
                        state,
                        "服务器“" + server.getName() + "”" + alertName + "使用率达到 " + currentValue + "%，已超过阈值 " + threshold + "%",
                        settings.cooldownMinutes()
                );
            }
        } else {
            recoverStateIfActive(server, state, "服务器“" + server.getName() + "”" + alertName + "使用率已恢复至 " + currentValue + "%");
            state.setConsecutiveBreachCount(0);
        }
        serverAlertStateRepository.save(state);
    }

    private void recoverMetricIfNeeded(ServerInfoEntity server, String alertCode) {
        serverAlertStateRepository.findByServer_IdAndAlertCode(server.getId(), alertCode)
                .ifPresent(state -> {
                    recoverStateIfActive(server, state, "服务器“" + server.getName() + "”" + state.getAlertName() + "已恢复");
                    state.setConsecutiveBreachCount(0);
                    serverAlertStateRepository.save(state);
                });
    }

    private void recoverConnectivityIfNeeded(ServerInfoEntity server) {
        serverAlertStateRepository.findByServer_IdAndAlertCode(server.getId(), ALERT_CONNECTIVITY)
                .ifPresent(state -> {
                    String recoveryMessage = "服务器“" + server.getName() + "”已恢复连通";
                    recoverStateIfActive(server, state, recoveryMessage);
                    state.setConsecutiveBreachCount(0);
                    state.setLastMessage(limitMessage(recoveryMessage));
                    state.setLastRecoveredAt(LocalDateTime.now());
                    serverAlertStateRepository.save(state);
                });
    }

    private void recoverStateIfActive(ServerInfoEntity server, ServerAlertStateEntity state, String recoveryMessage) {
        if (!state.isActive()) {
            return;
        }
        state.setActive(false);
        state.setLastRecoveredAt(LocalDateTime.now());
        state.setLastMessage(limitMessage(recoveryMessage));
        notifyRecipients(server, NotificationService.LEVEL_SUCCESS, "服务器告警恢复", recoveryMessage);
    }

    private void triggerAlertIfAllowed(ServerInfoEntity server, ServerAlertStateEntity state, String message, int cooldownMinutes) {
        LocalDateTime now = LocalDateTime.now();
        boolean cooldownPassed = state.getLastNotifiedAt() == null
                || state.getLastNotifiedAt().plusMinutes(cooldownMinutes).isBefore(now)
                || state.getLastNotifiedAt().plusMinutes(cooldownMinutes).isEqual(now);
        if (!state.isActive() || cooldownPassed) {
            state.setActive(true);
            state.setLastTriggeredAt(now);
            state.setLastNotifiedAt(now);
            state.setLastMessage(limitMessage(message));
            notifyRecipients(server, NotificationService.LEVEL_WARNING, "服务器资源告警", message);
        } else {
            state.setActive(true);
            state.setLastMessage(limitMessage(message));
        }
    }

    private void notifyRecipients(ServerInfoEntity server, String level, String title, String content) {
        Set<Long> recipientIds = new LinkedHashSet<>();
        for (UserEntity alertRecipient : server.getAlertRecipients()) {
            if (alertRecipient.isEnabled()) {
                recipientIds.add(alertRecipient.getId());
            }
        }
        if (recipientIds.isEmpty()) {
            return;
        }
        notificationService.sendToUsers(
                recipientIds,
                NotificationService.TYPE_SYSTEM,
                level,
                title,
                limitMessage(content),
                "/servers/" + server.getId(),
                "SERVER_ALERT",
                server.getId()
        );
    }

    private ServerAlertStateEntity resolveState(ServerInfoEntity server, String alertCode, String alertName) {
        return serverAlertStateRepository.findByServer_IdAndAlertCode(server.getId(), alertCode)
                .orElseGet(() -> {
                    ServerAlertStateEntity state = new ServerAlertStateEntity();
                    state.setServer(server);
                    state.setAlertCode(alertCode);
                    state.setAlertName(alertName);
                    state.setConsecutiveBreachCount(0);
                    return state;
                });
    }

    private void refreshActiveAlertCount(ServerInfoEntity server) {
        server.setActiveAlertCount((int) serverAlertStateRepository.countByServer_IdAndActiveTrue(server.getId()));
        serverInfoRepository.save(server);
    }

    public List<ServerAlertStateEntity> listStates(Long serverId) {
        return serverAlertStateRepository.findAllByServer_IdOrderByAlertCodeAsc(serverId);
    }

    private String limitMessage(String message) {
        if (message == null) {
            return "";
        }
        String normalized = message.trim();
        if (normalized.length() <= 500) {
            return normalized;
        }
        return normalized.substring(0, 500);
    }
}
