package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.UploadedFileSummary;
import com.aiclub.platform.dto.WikiPageDetail;
import com.aiclub.platform.dto.WikiPageSummary;
import com.aiclub.platform.dto.WikiPageTreeNode;
import com.aiclub.platform.dto.WikiPageVersionSummary;
import com.aiclub.platform.dto.WikiSemanticSearchResult;
import com.aiclub.platform.dto.request.CreateWikiPageRequest;
import com.aiclub.platform.dto.request.UpdateWikiPageRequest;
import com.aiclub.platform.service.TaskCommentImageStorageService;
import com.aiclub.platform.service.WikiPageService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.util.List;

/**
 * 项目级 Wiki 页面控制器，提供页面树、内容、版本、搜索和图片上传接口。
 */
@RestController
@RequestMapping("/api/projects/{projectId}/wiki")
public class WikiPageController {

    private final WikiPageService wikiPageService;
    private final TaskCommentImageStorageService taskCommentImageStorageService;

    public WikiPageController(WikiPageService wikiPageService,
                              TaskCommentImageStorageService taskCommentImageStorageService) {
        this.wikiPageService = wikiPageService;
        this.taskCommentImageStorageService = taskCommentImageStorageService;
    }

    /**
     * 读取当前项目 Wiki 页面树。
     */
    @GetMapping("/tree")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiPageTreeNode>> tree(@PathVariable Long projectId) {
        return ApiResponse.success(wikiPageService.getPageTree(projectId));
    }

    /**
     * 按 slug 读取 Wiki 页面详情。
     */
    @GetMapping("/slugs/{slug}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiPageDetail> detailBySlug(@PathVariable Long projectId, @PathVariable String slug) {
        return ApiResponse.success(wikiPageService.getPageBySlug(projectId, slug));
    }

    /**
     * 按页面 ID 读取 Wiki 页面详情。
     */
    @GetMapping("/pages/{pageId}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiPageDetail> detail(@PathVariable Long projectId, @PathVariable Long pageId) {
        return ApiResponse.success(wikiPageService.getPageDetail(projectId, pageId));
    }

    /**
     * 创建 Wiki 页面。
     */
    @PostMapping("/pages")
    @RequirePermission("wiki:manage")
    public ApiResponse<WikiPageDetail> create(@PathVariable Long projectId,
                                              @Valid @RequestBody CreateWikiPageRequest request) {
        return ApiResponse.success(wikiPageService.createPage(projectId, request));
    }

    /**
     * 更新 Wiki 页面。
     */
    @PutMapping("/pages/{pageId}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiPageDetail> update(@PathVariable Long projectId,
                                              @PathVariable Long pageId,
                                              @Valid @RequestBody UpdateWikiPageRequest request) {
        return ApiResponse.success(wikiPageService.updatePage(projectId, pageId, request));
    }

    /**
     * 删除 Wiki 页面。
     */
    @DeleteMapping("/pages/{pageId}")
    @RequirePermission("wiki:view")
    public ApiResponse<Void> delete(@PathVariable Long projectId, @PathVariable Long pageId) {
        wikiPageService.deletePage(projectId, pageId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    /**
     * 读取 Wiki 页面版本历史。
     */
    @GetMapping("/pages/{pageId}/versions")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiPageVersionSummary>> versions(@PathVariable Long projectId, @PathVariable Long pageId) {
        return ApiResponse.success(wikiPageService.listVersions(projectId, pageId));
    }

    /**
     * 读取 Wiki 页面指定版本。
     */
    @GetMapping("/pages/{pageId}/versions/{versionNumber}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiPageVersionSummary> version(@PathVariable Long projectId,
                                                       @PathVariable Long pageId,
                                                       @PathVariable Integer versionNumber) {
        return ApiResponse.success(wikiPageService.getVersion(projectId, pageId, versionNumber));
    }

    /**
     * 恢复 Wiki 页面指定版本。
     */
    @PostMapping("/pages/{pageId}/restore/{versionNumber}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiPageDetail> restore(@PathVariable Long projectId,
                                               @PathVariable Long pageId,
                                               @PathVariable Integer versionNumber) {
        return ApiResponse.success(wikiPageService.restoreVersion(projectId, pageId, versionNumber));
    }

    /**
     * Wiki 关键词搜索。
     */
    @GetMapping("/search")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiPageSummary>> search(@PathVariable Long projectId,
                                                     @RequestParam(required = false) String query) {
        return ApiResponse.success(wikiPageService.searchPages(projectId, query));
    }

    /**
     * Wiki 语义搜索。
     */
    @GetMapping("/semantic-search")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSemanticSearchResult>> semanticSearch(@PathVariable Long projectId,
                                                                      @RequestParam(required = false) String query) {
        return ApiResponse.success(wikiPageService.semanticSearchPages(projectId, query));
    }

    /**
     * 当前 Wiki 页面的相关页面推荐。
     */
    @GetMapping("/pages/{pageId}/related")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiPageSummary>> related(@PathVariable Long projectId, @PathVariable Long pageId) {
        return ApiResponse.success(wikiPageService.relatedPages(projectId, pageId, 8));
    }

    /**
     * Wiki Markdown 图片上传，复用平台已有 MinIO 图片链路。
     */
    @PostMapping("/images")
    @RequirePermission("wiki:view")
    public ApiResponse<UploadedFileSummary> uploadImage(@PathVariable Long projectId,
                                                        @RequestParam("file") MultipartFile file) {
        TaskCommentImageStorageService.StoredCommentImage stored = taskCommentImageStorageService.store(file, "wiki-pages/project-" + projectId);
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/comment-images")
                .queryParam("key", stored.objectKey())
                .toUriString();
        return ApiResponse.success(new UploadedFileSummary(url, stored.fileName(), stored.size()));
    }
}
