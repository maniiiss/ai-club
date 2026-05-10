package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PrReviewStatsConfigSummary;
import com.aiclub.platform.dto.PrReviewStatsGroupSummary;
import com.aiclub.platform.dto.PrReviewStatsSummary;
import com.aiclub.platform.dto.request.PrReviewStatsQueryRequest;
import com.aiclub.platform.service.PrReviewStatsService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * PR 评审统计控制器。
 * 为系统管理中的专项统计页面提供配置、开发组列表与报表结果。
 */
@RestController
@RequestMapping("/api/pr-review-stats")
@OperationLog(moduleCode = "PR_REVIEW_STATS", moduleName = "PR评审统计", bizType = "PR_REVIEW_STATS")
public class PrReviewStatsController {

    private final PrReviewStatsService prReviewStatsService;

    public PrReviewStatsController(PrReviewStatsService prReviewStatsService) {
        this.prReviewStatsService = prReviewStatsService;
    }

    @GetMapping("/config")
    @RequirePermission("system:pr-review:view")
    public ApiResponse<PrReviewStatsConfigSummary> config(@RequestParam String startTime,
                                                          @RequestParam String endTime) {
        return ApiResponse.success(prReviewStatsService.getDefaultConfig(startTime, endTime));
    }

    @GetMapping("/groups")
    @RequirePermission("system:pr-review:view")
    public ApiResponse<List<PrReviewStatsGroupSummary>> groups(@RequestParam String startTime,
                                                               @RequestParam String endTime) {
        return ApiResponse.success(prReviewStatsService.listGroups(startTime, endTime));
    }

    @PostMapping("/query")
    @RequirePermission("system:pr-review:view")
    @OperationLog(actionCode = "PR_REVIEW_STATS_QUERY", actionName = "查询PR评审统计")
    public ApiResponse<PrReviewStatsSummary> query(@Valid @RequestBody PrReviewStatsQueryRequest request) {
        return ApiResponse.success(prReviewStatsService.queryStats(request));
    }
}
