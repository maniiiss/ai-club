package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.repository.ServerInfoRepository;
import com.aiclub.platform.repository.ServerMetricSampleRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 周期性采样服务器资源并驱动告警评估。
 */
@Service
public class ServerMonitorScheduler {

    private static final int HISTORY_RETENTION_HOURS = 72;

    private final ServerModuleGateService serverModuleGateService;
    private final ServerInfoRepository serverInfoRepository;
    private final ServerManagementService serverManagementService;
    private final ServerSshGateway serverSshGateway;
    private final ServerAlertSettingsService serverAlertSettingsService;
    private final ServerMetricSampleRepository serverMetricSampleRepository;

    public ServerMonitorScheduler(ServerModuleGateService serverModuleGateService,
                                  ServerInfoRepository serverInfoRepository,
                                  ServerManagementService serverManagementService,
                                  ServerSshGateway serverSshGateway,
                                  ServerAlertSettingsService serverAlertSettingsService,
                                  ServerMetricSampleRepository serverMetricSampleRepository) {
        this.serverModuleGateService = serverModuleGateService;
        this.serverInfoRepository = serverInfoRepository;
        this.serverManagementService = serverManagementService;
        this.serverSshGateway = serverSshGateway;
        this.serverAlertSettingsService = serverAlertSettingsService;
        this.serverMetricSampleRepository = serverMetricSampleRepository;
    }

    @Scheduled(fixedDelayString = "${platform.server.monitor.scheduler-fixed-delay-ms:15000}")
    public void collectMetrics() {
        if (!serverModuleGateService.isEnabled()) {
            return;
        }
        int intervalSeconds = serverAlertSettingsService.resolveMonitorIntervalSeconds();
        LocalDateTime now = LocalDateTime.now();
        for (ServerInfoEntity server : serverInfoRepository.findAllByEnabledTrueOrderByIdAsc()) {
            if (!shouldProbe(server, now, intervalSeconds)) {
                continue;
            }
            try {
                ServerSshGateway.ServerProbeSnapshot snapshot = serverSshGateway.probe(server);
                serverManagementService.recordScheduledProbeSuccess(server, snapshot);
            } catch (RuntimeException exception) {
                serverManagementService.recordScheduledProbeFailure(server, exception.getMessage());
            }
        }
        serverMetricSampleRepository.deleteAllBySampledAtBefore(now.minusHours(HISTORY_RETENTION_HOURS));
    }

    private boolean shouldProbe(ServerInfoEntity server, LocalDateTime now, int intervalSeconds) {
        if (server.getLastProbedAt() == null) {
            return true;
        }
        return server.getLastProbedAt().plusSeconds(intervalSeconds).isBefore(now)
                || server.getLastProbedAt().plusSeconds(intervalSeconds).isEqual(now);
    }
}
