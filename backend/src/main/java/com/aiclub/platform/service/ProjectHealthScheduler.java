package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 项目健康检查调度器。
 */
@Service
public class ProjectHealthScheduler {

    private final ObservabilityProperties observabilityProperties;
    private final ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository;
    private final ProjectHealthService projectHealthService;

    public ProjectHealthScheduler(ObservabilityProperties observabilityProperties,
                                  ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository,
                                  ProjectHealthService projectHealthService) {
        this.observabilityProperties = observabilityProperties;
        this.projectRuntimeInstanceRepository = projectRuntimeInstanceRepository;
        this.projectHealthService = projectHealthService;
    }

    @Scheduled(fixedDelayString = "${platform.observability.health.collect-interval-ms:30000}")
    public void collectHealth() {
        if (!observabilityProperties.isEnabled()) {
            return;
        }
        for (ProjectRuntimeInstanceEntity runtimeInstance : projectRuntimeInstanceRepository.findAllByEnabledTrueAndHealthEnabledTrueOrderByIdAsc()) {
            try {
                projectHealthService.probeRuntimeInstance(runtimeInstance);
            } catch (RuntimeException exception) {
                runtimeInstance.setLastHealthCheckedAt(java.time.LocalDateTime.now());
                runtimeInstance.setLastHealthScore(0);
                runtimeInstance.setLastHealthLevel(ProjectHealthScorer.LEVEL_ABNORMAL);
                runtimeInstance.setLastHealthMessage(limit(exception.getMessage()));
                projectRuntimeInstanceRepository.save(runtimeInstance);
            }
        }
        projectHealthService.cleanupExpiredSnapshots();
    }

    private String limit(String value) {
        if (value == null || value.length() <= 500) {
            return value;
        }
        return value.substring(0, 500);
    }
}
