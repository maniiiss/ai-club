package com.aiclub.platform.service;

import com.aiclub.platform.dto.RuntimeCapabilities;
import org.springframework.stereotype.Service;

/**
 * 汇总前端在当前运行期需要感知的模块能力开关。
 */
@Service
public class RuntimeCapabilityService {

    private final ServerModuleGateService serverModuleGateService;

    public RuntimeCapabilityService(ServerModuleGateService serverModuleGateService) {
        this.serverModuleGateService = serverModuleGateService;
    }

    public RuntimeCapabilities getCapabilities() {
        return new RuntimeCapabilities(serverModuleGateService.isEnabled());
    }
}
