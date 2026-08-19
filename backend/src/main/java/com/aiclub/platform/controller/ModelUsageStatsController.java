package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelBreakdown;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelOverview;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelTrendPoint;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelUsageOptions;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelUsageQueryRequest;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ProviderBreakdown;
import com.aiclub.platform.dto.ModelUsageStatsDtos.SourceBreakdown;
import com.aiclub.platform.dto.ModelUsageStatsDtos.UserBreakdown;
import com.aiclub.platform.service.ModelUsageStatsService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 平台模型调用量统计控制器。
 *
 * <p>为系统管理中的「模型调用量统计」看板提供以模型为中心的聚合接口。
 * 全部端点需要 {@code system:model-usage:view} 权限，与 {@link AgentUsageStatsController}
 * 的「按智能体/用户」维度互补。
 */
@RestController
@RequestMapping("/api/model-usage-stats")
@OperationLog(moduleCode = "MODEL_USAGE_STATS", moduleName = "模型调用量统计", bizType = "MODEL_USAGE_STATS")
public class ModelUsageStatsController {

    private final ModelUsageStatsService modelUsageStatsService;

    public ModelUsageStatsController(ModelUsageStatsService modelUsageStatsService) {
        this.modelUsageStatsService = modelUsageStatsService;
    }

    @GetMapping("/options")
    @RequirePermission("system:model-usage:view")
    public ApiResponse<ModelUsageOptions> getOptions() {
        return ApiResponse.success(modelUsageStatsService.getOptions());
    }

    @PostMapping("/overview")
    @RequirePermission("system:model-usage:view")
    @OperationLog(actionCode = "MODEL_USAGE_OVERVIEW", actionName = "查询模型调用总览")
    public ApiResponse<ModelOverview> overview(@Valid @RequestBody ModelUsageQueryRequest request) {
        return ApiResponse.success(modelUsageStatsService.getOverview(request));
    }

    @PostMapping("/by-model")
    @RequirePermission("system:model-usage:view")
    @OperationLog(actionCode = "MODEL_USAGE_BY_MODEL", actionName = "按模型统计")
    public ApiResponse<List<ModelBreakdown>> byModel(@Valid @RequestBody ModelUsageQueryRequest request) {
        return ApiResponse.success(modelUsageStatsService.getByModel(request));
    }

    @PostMapping("/by-user")
    @RequirePermission("system:model-usage:view")
    @OperationLog(actionCode = "MODEL_USAGE_BY_USER", actionName = "按用户统计 Token 用量")
    public ApiResponse<List<UserBreakdown>> byUser(@Valid @RequestBody ModelUsageQueryRequest request) {
        return ApiResponse.success(modelUsageStatsService.getByUser(request));
    }

    @PostMapping("/trend")
    @RequirePermission("system:model-usage:view")
    @OperationLog(actionCode = "MODEL_USAGE_TREND", actionName = "查询模型调用趋势")
    public ApiResponse<List<ModelTrendPoint>> trend(@Valid @RequestBody ModelUsageQueryRequest request) {
        return ApiResponse.success(modelUsageStatsService.getTrend(request));
    }

    @PostMapping("/by-provider")
    @RequirePermission("system:model-usage:view")
    @OperationLog(actionCode = "MODEL_USAGE_BY_PROVIDER", actionName = "按供应商统计")
    public ApiResponse<List<ProviderBreakdown>> byProvider(@Valid @RequestBody ModelUsageQueryRequest request) {
        return ApiResponse.success(modelUsageStatsService.getByProvider(request));
    }

    @PostMapping("/by-source")
    @RequirePermission("system:model-usage:view")
    @OperationLog(actionCode = "MODEL_USAGE_BY_SOURCE", actionName = "按调用来源统计")
    public ApiResponse<List<SourceBreakdown>> bySource(@Valid @RequestBody ModelUsageQueryRequest request) {
        return ApiResponse.success(modelUsageStatsService.getBySource(request));
    }
}
