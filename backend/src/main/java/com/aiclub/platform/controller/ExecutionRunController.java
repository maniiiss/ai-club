package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionRunDetail;
import com.aiclub.platform.service.ExecutionTaskService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 执行运行详情控制器。
 */
@RestController
@RequestMapping("/api/execution-runs")
public class ExecutionRunController {

    private final ExecutionTaskService executionTaskService;

    public ExecutionRunController(ExecutionTaskService executionTaskService) {
        this.executionTaskService = executionTaskService;
    }

    @GetMapping("/{id}")
    @RequirePermission("task:view")
    public ApiResponse<ExecutionRunDetail> detail(@PathVariable Long id) {
        return ApiResponse.success(executionTaskService.getExecutionRun(id));
    }
}
