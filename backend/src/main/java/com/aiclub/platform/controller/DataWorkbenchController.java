package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchAppItem;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityItem;
import com.aiclub.platform.service.DataChangeService;
import com.aiclub.platform.service.DataWorkbenchService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * DataWorkbench 项目内工作台控制器。
 */
@RestController
@RequestMapping("/api/data-workbench")
@OperationLog(moduleCode = "DATA_WORKBENCH", moduleName = "数据工作台", bizType = "DATA_WORKBENCH")
public class DataWorkbenchController {

    private final DataWorkbenchService dataWorkbenchService;
    private final DataChangeService dataChangeService;

    public DataWorkbenchController(DataWorkbenchService dataWorkbenchService, DataChangeService dataChangeService) {
        this.dataWorkbenchService = dataWorkbenchService;
        this.dataChangeService = dataChangeService;
    }

    @GetMapping("/projects/{projectId}/apps")
    @RequirePermission("data-workbench:view")
    public ApiResponse<List<DataWorkbenchAppItem>> listApps(@PathVariable Long projectId) {
        dataChangeService.validateProjectVisible(projectId);
        return ApiResponse.success(dataWorkbenchService.listApps());
    }

    @GetMapping("/projects/{projectId}/entities")
    @RequirePermission("data-workbench:view")
    public ApiResponse<List<DataWorkbenchEntityItem>> listEntities(@PathVariable Long projectId) {
        return ApiResponse.success(dataChangeService.listProjectEntities(projectId));
    }
}
