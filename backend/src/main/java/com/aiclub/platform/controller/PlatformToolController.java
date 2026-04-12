package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PlatformToolSummary;
import com.aiclub.platform.dto.request.PlatformToolConfigRequest;
import com.aiclub.platform.service.PlatformToolManagementService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台工具管理控制器。
 */
@RestController
@RequestMapping("/api/platform-tools")
@OperationLog(moduleCode = "TOOL", moduleName = "平台工具", bizType = "PLATFORM_TOOL")
public class PlatformToolController {

    private final PlatformToolManagementService platformToolManagementService;

    public PlatformToolController(PlatformToolManagementService platformToolManagementService) {
        this.platformToolManagementService = platformToolManagementService;
    }

    @GetMapping
    @RequirePermission("system:tool:view")
    public ApiResponse<PageResponse<PlatformToolSummary>> page(@RequestParam(defaultValue = "1") int page,
                                                               @RequestParam(defaultValue = "10") int size,
                                                               @RequestParam(required = false) String keyword,
                                                               @RequestParam(required = false) String moduleCode,
                                                               @RequestParam(required = false) Boolean enabled,
                                                               @RequestParam(required = false) Boolean readOnly) {
        return ApiResponse.success(platformToolManagementService.pageTools(page, size, keyword, moduleCode, enabled, readOnly));
    }

    @GetMapping("/{toolCode}")
    @RequirePermission("system:tool:view")
    public ApiResponse<PlatformToolSummary> detail(@PathVariable String toolCode) {
        return ApiResponse.success(platformToolManagementService.getTool(toolCode));
    }

    @PutMapping("/{toolCode}")
    @RequirePermission("system:tool:manage")
    @OperationLog(actionCode = "PLATFORM_TOOL_UPDATE", actionName = "更新工具配置", bizIdParam = "toolCode")
    public ApiResponse<PlatformToolSummary> update(@PathVariable String toolCode,
                                                   @Valid @RequestBody PlatformToolConfigRequest request) {
        return ApiResponse.success(platformToolManagementService.updateTool(toolCode, request));
    }
}
