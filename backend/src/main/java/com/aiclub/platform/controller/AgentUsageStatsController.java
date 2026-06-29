package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageAgentBreakdown;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageModelBreakdown;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageOptions;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageOverview;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageQueryRequest;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageTrendPoint;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageUserBreakdown;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentInvocationLogSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.service.AgentUsageStatsService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 智能体调用量统计控制器。
 *
 * <p>为系统管理中的「智能体调用统计」看板提供多维度聚合接口。
 * 全部端点需要 {@code system:agent-usage:view} 权限。
 */
@RestController
@RequestMapping("/api/agent-usage-stats")
@OperationLog(moduleCode = "AGENT_USAGE_STATS", moduleName = "智能体调用统计", bizType = "AGENT_USAGE_STATS")
public class AgentUsageStatsController {

    private final AgentUsageStatsService agentUsageStatsService;

    public AgentUsageStatsController(AgentUsageStatsService agentUsageStatsService) {
        this.agentUsageStatsService = agentUsageStatsService;
    }

    @GetMapping("/options")
    @RequirePermission("system:agent-usage:view")
    public ApiResponse<AgentUsageOptions> getOptions() {
        return ApiResponse.success(agentUsageStatsService.getOptions());
    }

    @PostMapping("/overview")
    @RequirePermission("system:agent-usage:view")
    @OperationLog(actionCode = "AGENT_USAGE_OVERVIEW", actionName = "查询调用总览")
    public ApiResponse<AgentUsageOverview> overview(@Valid @RequestBody AgentUsageQueryRequest request) {
        return ApiResponse.success(agentUsageStatsService.getOverview(request));
    }

    @PostMapping("/trend")
    @RequirePermission("system:agent-usage:view")
    @OperationLog(actionCode = "AGENT_USAGE_TREND", actionName = "查询调用趋势")
    public ApiResponse<List<AgentUsageTrendPoint>> trend(@Valid @RequestBody AgentUsageQueryRequest request) {
        return ApiResponse.success(agentUsageStatsService.getTrend(request));
    }

    @PostMapping("/by-agent")
    @RequirePermission("system:agent-usage:view")
    @OperationLog(actionCode = "AGENT_USAGE_BY_AGENT", actionName = "按智能体统计")
    public ApiResponse<List<AgentUsageAgentBreakdown>> byAgent(@Valid @RequestBody AgentUsageQueryRequest request) {
        return ApiResponse.success(agentUsageStatsService.getByAgent(request));
    }

    @PostMapping("/by-user")
    @RequirePermission("system:agent-usage:view")
    @OperationLog(actionCode = "AGENT_USAGE_BY_USER", actionName = "按用户统计")
    public ApiResponse<List<AgentUsageUserBreakdown>> byUser(@Valid @RequestBody AgentUsageQueryRequest request) {
        return ApiResponse.success(agentUsageStatsService.getByUser(request));
    }

    @PostMapping("/by-model")
    @RequirePermission("system:agent-usage:view")
    @OperationLog(actionCode = "AGENT_USAGE_BY_MODEL", actionName = "按模型统计")
    public ApiResponse<List<AgentUsageModelBreakdown>> byModel(@Valid @RequestBody AgentUsageQueryRequest request) {
        return ApiResponse.success(agentUsageStatsService.getByModel(request));
    }

    @PostMapping("/logs")
    @RequirePermission("system:agent-usage:view")
    @OperationLog(actionCode = "AGENT_USAGE_LOGS", actionName = "查询调用明细")
    public ApiResponse<PageResponse<AgentInvocationLogSummary>> logs(@Valid @RequestBody AgentUsageQueryRequest request) {
        return ApiResponse.success(agentUsageStatsService.getLogs(request));
    }
}