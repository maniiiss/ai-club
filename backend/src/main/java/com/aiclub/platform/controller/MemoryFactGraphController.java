package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.MemoryFactEntityDetail;
import com.aiclub.platform.dto.MemoryFactFactsResponse;
import com.aiclub.platform.dto.MemoryFactGraphSummary;
import com.aiclub.platform.service.MemoryFactGraphService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 项目级记忆事实图控制器。
 */
@RestController
@RequestMapping("/api/projects/{projectId}/memory-fact-graph")
public class MemoryFactGraphController {

    private final MemoryFactGraphService memoryFactGraphService;

    public MemoryFactGraphController(MemoryFactGraphService memoryFactGraphService) {
        this.memoryFactGraphService = memoryFactGraphService;
    }

    @GetMapping
    @RequirePermission("project:view")
    public ApiResponse<MemoryFactGraphSummary> getProjectGraph(@PathVariable Long projectId) {
        return ApiResponse.success(memoryFactGraphService.getProjectGraph(projectId));
    }

    @GetMapping("/facts")
    @RequirePermission("project:view")
    public ApiResponse<MemoryFactFactsResponse> getFacts(@PathVariable Long projectId,
                                                         @RequestParam(required = false) String entityId,
                                                         @RequestParam(required = false) String edgeId,
                                                         @RequestParam(required = false) String query,
                                                         @RequestParam(required = false) Integer limit) {
        return ApiResponse.success(memoryFactGraphService.getFacts(projectId, entityId, edgeId, query, limit));
    }

    @GetMapping("/entity/{entityId}")
    @RequirePermission("project:view")
    public ApiResponse<MemoryFactEntityDetail> getEntityDetail(@PathVariable Long projectId,
                                                               @PathVariable String entityId) {
        return ApiResponse.success(memoryFactGraphService.getEntityDetail(projectId, entityId));
    }
}
