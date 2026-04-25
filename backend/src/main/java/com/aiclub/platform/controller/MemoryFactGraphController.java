package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.MemoryFactEntityDetail;
import com.aiclub.platform.dto.MemoryFactFactsResponse;
import com.aiclub.platform.dto.MemoryFactGraphSummary;
import com.aiclub.platform.service.MemoryFactGraphService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 记忆事实图控制器，支持项目聚合图与 Wiki 空间独立图。
 */
@RestController
public class MemoryFactGraphController {

    private final MemoryFactGraphService memoryFactGraphService;

    public MemoryFactGraphController(MemoryFactGraphService memoryFactGraphService) {
        this.memoryFactGraphService = memoryFactGraphService;
    }

    @GetMapping("/api/projects/{projectId}/memory-fact-graph")
    @RequirePermission("project:view")
    public ApiResponse<MemoryFactGraphSummary> getProjectGraph(@PathVariable Long projectId) {
        return ApiResponse.success(memoryFactGraphService.getProjectGraph(projectId));
    }

    @GetMapping("/api/projects/{projectId}/memory-fact-graph/facts")
    @RequirePermission("project:view")
    public ApiResponse<MemoryFactFactsResponse> getFacts(@PathVariable Long projectId,
                                                         @RequestParam(required = false) String entityId,
                                                         @RequestParam(required = false) String edgeId,
                                                         @RequestParam(required = false) String query,
                                                         @RequestParam(required = false) Integer limit) {
        return ApiResponse.success(memoryFactGraphService.getFacts(projectId, entityId, edgeId, query, limit));
    }

    @GetMapping("/api/projects/{projectId}/memory-fact-graph/entity/{entityId}")
    @RequirePermission("project:view")
    public ApiResponse<MemoryFactEntityDetail> getEntityDetail(@PathVariable Long projectId,
                                                               @PathVariable String entityId) {
        return ApiResponse.success(memoryFactGraphService.getEntityDetail(projectId, entityId));
    }

    @GetMapping("/api/wiki/spaces/{spaceId}/memory-fact-graph")
    @RequirePermission("wiki:view")
    public ApiResponse<MemoryFactGraphSummary> getWikiSpaceGraph(@PathVariable Long spaceId) {
        return ApiResponse.success(memoryFactGraphService.getWikiSpaceGraph(spaceId));
    }

    @GetMapping("/api/wiki/spaces/{spaceId}/memory-fact-graph/facts")
    @RequirePermission("wiki:view")
    public ApiResponse<MemoryFactFactsResponse> getWikiSpaceFacts(@PathVariable Long spaceId,
                                                                  @RequestParam(required = false) String entityId,
                                                                  @RequestParam(required = false) String edgeId,
                                                                  @RequestParam(required = false) String query,
                                                                  @RequestParam(required = false) Integer limit) {
        return ApiResponse.success(memoryFactGraphService.getWikiSpaceFacts(spaceId, entityId, edgeId, query, limit));
    }

    @GetMapping("/api/wiki/spaces/{spaceId}/memory-fact-graph/entity/{entityId}")
    @RequirePermission("wiki:view")
    public ApiResponse<MemoryFactEntityDetail> getWikiSpaceEntityDetail(@PathVariable Long spaceId,
                                                                        @PathVariable String entityId) {
        return ApiResponse.success(memoryFactGraphService.getWikiSpaceEntityDetail(spaceId, entityId));
    }
}
