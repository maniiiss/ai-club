package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.KnowledgeGraphSummary;
import com.aiclub.platform.service.KnowledgeGraphService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/projects/{projectId}/knowledge-graph")
public class KnowledgeGraphController {

    private final KnowledgeGraphService knowledgeGraphService;

    public KnowledgeGraphController(KnowledgeGraphService knowledgeGraphService) {
        this.knowledgeGraphService = knowledgeGraphService;
    }

    @GetMapping
    @RequirePermission("project:view")
    public ApiResponse<KnowledgeGraphSummary> getProjectGraph(@PathVariable Long projectId,
                                                              @RequestParam(defaultValue = "false") boolean refresh) {
        return ApiResponse.success(knowledgeGraphService.getProjectGraph(projectId, refresh));
    }

    @PostMapping("/rebuild")
    @RequirePermission("project:manage")
    public ApiResponse<KnowledgeGraphSummary> rebuildProjectGraph(@PathVariable Long projectId) {
        return ApiResponse.success(knowledgeGraphService.rebuildProjectGraph(projectId));
    }
}
