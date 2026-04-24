package com.aiclub.platform.dto;

import java.util.List;

public record SelfUpgradeCenterConfigSummary(
        Long id,
        Long defaultEnvironmentProfileId,
        Long carrierProjectId,
        String defaultRepositoryBindingIdsJson,
        Long developmentPlanAgentId,
        Long developmentImplementAgentId,
        Long developmentTestAgentId,
        Long developmentReportAgentId,
        List<SelfUpgradeEnvironmentProfileSummary> environmentProfiles
) {
}
