package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 项目日志采集调度器。
 */
@Service
public class ProjectLogCollectScheduler {

    private final ObservabilityProperties observabilityProperties;
    private final ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository;
    private final ProjectLogIngestService projectLogIngestService;

    public ProjectLogCollectScheduler(ObservabilityProperties observabilityProperties,
                                      ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository,
                                      ProjectLogIngestService projectLogIngestService) {
        this.observabilityProperties = observabilityProperties;
        this.projectRuntimeInstanceRepository = projectRuntimeInstanceRepository;
        this.projectLogIngestService = projectLogIngestService;
    }

    @Scheduled(fixedDelayString = "${platform.observability.log.collect-interval-ms:30000}")
    public void collectLogs() {
        if (!observabilityProperties.isEnabled()) {
            return;
        }
        for (ProjectRuntimeInstanceEntity runtimeInstance : projectRuntimeInstanceRepository
                .findAllByEnabledTrueAndLogEnabledTrueAndServerModeOrderByIdAsc(ProjectRuntimeInstanceEntity.SERVER_MODE_MANAGED_SERVER)) {
            try {
                projectLogIngestService.collectRuntimeInstanceLogs(runtimeInstance);
            } catch (RuntimeException exception) {
                runtimeInstance.setLastLogCollectedAt(java.time.LocalDateTime.now());
                runtimeInstance.setLastLogCollectStatus("FAILED");
                runtimeInstance.setLastLogCollectMessage(limit(exception.getMessage()));
                projectRuntimeInstanceRepository.save(runtimeInstance);
            }
        }
        projectLogIngestService.cleanupExpiredLogs();
    }

    private String limit(String value) {
        if (value == null || value.length() <= 500) {
            return value;
        }
        return value.substring(0, 500);
    }
}
