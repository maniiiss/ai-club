package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ObservabilityHealthTimelinePoint;
import com.aiclub.platform.dto.ObservabilityProjectDetail;
import com.aiclub.platform.dto.ObservabilityProjectHealthSummary;
import com.aiclub.platform.dto.ObservabilityProjectLogSummary;
import com.aiclub.platform.dto.ObservabilityProjectSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectRuntimeInstanceSummary;
import com.aiclub.platform.dto.request.ObservabilityRuntimeInstanceUpdateRequest;
import com.aiclub.platform.service.ObservabilityService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 可观测性中心控制器。
 */
@RestController
@RequestMapping("/api/observability")
@OperationLog(moduleCode = "OBSERVABILITY", moduleName = "可观测性中心", bizType = "PROJECT_OBSERVABILITY")
public class ObservabilityController {

    private final ObservabilityService observabilityService;

    public ObservabilityController(ObservabilityService observabilityService) {
        this.observabilityService = observabilityService;
    }

    @GetMapping("/projects")
    @RequirePermission("observability:view")
    public ApiResponse<PageResponse<ObservabilityProjectSummary>> pageProjects(@RequestParam(defaultValue = "1") int page,
                                                                               @RequestParam(defaultValue = "12") int size,
                                                                               @RequestParam(required = false) String keyword,
                                                                               @RequestParam(required = false) String healthLevel) {
        return ApiResponse.success(observabilityService.pageProjects(page, size, keyword, healthLevel));
    }

    @GetMapping("/projects/{projectId}")
    @RequirePermission("observability:view")
    public ApiResponse<ObservabilityProjectDetail> getProjectDetail(@PathVariable Long projectId) {
        return ApiResponse.success(observabilityService.getProjectDetail(projectId));
    }

    @GetMapping("/projects/{projectId}/logs")
    @RequirePermission("observability:view")
    public ApiResponse<PageResponse<ObservabilityProjectLogSummary>> pageProjectLogs(@PathVariable Long projectId,
                                                                                     @RequestParam(defaultValue = "1") int page,
                                                                                     @RequestParam(defaultValue = "50") int size,
                                                                                     @RequestParam(required = false) Long runtimeInstanceId,
                                                                                     @RequestParam(required = false) String level,
                                                                                     @RequestParam(required = false) String keyword,
                                                                                     @RequestParam(required = false) String traceId,
                                                                                     @RequestParam(required = false) String startTime,
                                                                                     @RequestParam(required = false) String endTime) {
        return ApiResponse.success(observabilityService.pageProjectLogs(projectId, page, size, runtimeInstanceId, level, keyword, traceId, startTime, endTime));
    }

    @GetMapping("/projects/{projectId}/health")
    @RequirePermission("observability:view")
    public ApiResponse<ObservabilityProjectHealthSummary> getProjectHealth(@PathVariable Long projectId) {
        return ApiResponse.success(observabilityService.getProjectHealth(projectId));
    }

    @GetMapping("/projects/{projectId}/health/timeline")
    @RequirePermission("observability:view")
    public ApiResponse<List<ObservabilityHealthTimelinePoint>> getProjectHealthTimeline(@PathVariable Long projectId,
                                                                                        @RequestParam(required = false) Long runtimeInstanceId,
                                                                                        @RequestParam(defaultValue = "50") int limit) {
        return ApiResponse.success(observabilityService.getProjectHealthTimeline(projectId, runtimeInstanceId, limit));
    }

    @PutMapping("/projects/{projectId}/runtime-instances/{runtimeInstanceId}")
    @RequirePermission("observability:manage")
    @OperationLog(actionCode = "OBSERVABILITY_RUNTIME_INSTANCE_UPDATE", actionName = "更新运行实例观测配置", bizIdParam = "runtimeInstanceId")
    public ApiResponse<ProjectRuntimeInstanceSummary> updateRuntimeInstance(@PathVariable Long projectId,
                                                                            @PathVariable Long runtimeInstanceId,
                                                                            @Valid @RequestBody ObservabilityRuntimeInstanceUpdateRequest request) {
        return ApiResponse.success(observabilityService.updateRuntimeInstance(projectId, runtimeInstanceId, request));
    }
}
