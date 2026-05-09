package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PlatformEnvVarDetail;
import com.aiclub.platform.dto.PlatformEnvVarSummary;
import com.aiclub.platform.dto.request.PlatformEnvVarUpdateRequest;
import com.aiclub.platform.service.PlatformEnvVarManagementService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系统管理-环境变量管理控制器。
 */
@RestController
@RequestMapping("/api/platform-env-vars")
@OperationLog(moduleCode = "ENV_VAR", moduleName = "环境变量管理", bizType = "PLATFORM_ENV_VAR")
public class PlatformEnvVarController {

    private final PlatformEnvVarManagementService platformEnvVarManagementService;

    public PlatformEnvVarController(PlatformEnvVarManagementService platformEnvVarManagementService) {
        this.platformEnvVarManagementService = platformEnvVarManagementService;
    }

    @GetMapping
    @RequirePermission("system:env:view")
    public ApiResponse<List<PlatformEnvVarSummary>> list() {
        return ApiResponse.success(platformEnvVarManagementService.listEnvVars());
    }

    @GetMapping("/{envKey}")
    @RequirePermission("system:env:view")
    public ApiResponse<PlatformEnvVarDetail> detail(@PathVariable String envKey) {
        return ApiResponse.success(platformEnvVarManagementService.getEnvVarDetail(envKey));
    }

    @PutMapping("/{envKey}")
    @RequirePermission("system:env:manage")
    @OperationLog(actionCode = "PLATFORM_ENV_VAR_UPDATE", actionName = "更新环境变量配置", bizIdParam = "envKey")
    public ApiResponse<PlatformEnvVarDetail> update(@PathVariable String envKey,
                                                    @Valid @RequestBody PlatformEnvVarUpdateRequest request) {
        return ApiResponse.success(platformEnvVarManagementService.updateEnvVar(envKey, request));
    }
}
