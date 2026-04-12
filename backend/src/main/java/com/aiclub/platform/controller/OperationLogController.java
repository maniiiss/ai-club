package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.UserOperationLogSummary;
import com.aiclub.platform.service.UserOperationLogService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

/**
 * 管理员查询通用操作日志的分页接口。
 */
@RestController
@RequestMapping("/api/operation-logs")
public class OperationLogController {

    private final UserOperationLogService userOperationLogService;

    public OperationLogController(UserOperationLogService userOperationLogService) {
        this.userOperationLogService = userOperationLogService;
    }

    @GetMapping
    @RequirePermission("system:operation-log:view")
    public ApiResponse<PageResponse<UserOperationLogSummary>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String moduleCode,
            @RequestParam(required = false) String operationStatus,
            @RequestParam(required = false) String bizType,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime
    ) {
        return ApiResponse.success(userOperationLogService.pageOperationLogs(
                page,
                size,
                keyword,
                userId,
                moduleCode,
                operationStatus,
                bizType,
                startTime,
                endTime
        ));
    }
}
