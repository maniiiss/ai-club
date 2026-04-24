package com.aiclub.platform.dto.request;

import java.util.List;

public record SelfUpgradeCenterConfigRequest(
        Long defaultEnvironmentProfileId,
        Long carrierProjectId,
        String defaultRepositoryBindingIdsJson,
        Long developmentPlanAgentId,
        Long developmentImplementAgentId,
        Long developmentTestAgentId,
        Long developmentReportAgentId,
        List<SelfUpgradeEnvironmentProfileRequest> environmentProfiles
) {
}
