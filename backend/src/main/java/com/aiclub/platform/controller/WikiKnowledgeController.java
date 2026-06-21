package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.service.WikiKnowledgeSearchService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Wiki 知识索引管理控制器。
 */
@RestController
@RequestMapping("/api/wiki/knowledge")
public class WikiKnowledgeController {

    private final WikiKnowledgeSearchService wikiKnowledgeSearchService;

    public WikiKnowledgeController(WikiKnowledgeSearchService wikiKnowledgeSearchService) {
        this.wikiKnowledgeSearchService = wikiKnowledgeSearchService;
    }

    /**
     * 手动触发全量重建，把当前业务库中的 Wiki 页面重新建索到 Qdrant。
     */
    @PostMapping("/rebuild")
    @RequirePermission("wiki:manage")
    public ApiResponse<WikiKnowledgeSearchService.WikiKnowledgeRebuildResult> rebuild() {
        return ApiResponse.success(wikiKnowledgeSearchService.rebuildAllIndexesForAdmin());
    }
}
