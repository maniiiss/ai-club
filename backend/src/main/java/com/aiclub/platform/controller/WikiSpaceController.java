package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.WikiDirectorySummary;
import com.aiclub.platform.dto.WikiDirectoryTreeNode;
import com.aiclub.platform.dto.WikiSpaceDetail;
import com.aiclub.platform.dto.WikiSpaceMemberSummary;
import com.aiclub.platform.dto.WikiSpacePageDetail;
import com.aiclub.platform.dto.WikiSpacePageSummary;
import com.aiclub.platform.dto.WikiSpacePageVersionSummary;
import com.aiclub.platform.dto.WikiSpaceSearchResult;
import com.aiclub.platform.dto.WikiSpaceSummary;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.request.CreateWikiImportPageRequest;
import com.aiclub.platform.dto.request.CreateWikiDirectoryRequest;
import com.aiclub.platform.dto.request.CreateWikiSpacePageRequest;
import com.aiclub.platform.dto.request.CreateWikiSpaceRequest;
import com.aiclub.platform.dto.request.ReplaceWikiSpaceMembersRequest;
import com.aiclub.platform.dto.request.UpdateWikiDirectoryRequest;
import com.aiclub.platform.dto.request.UpdateWikiSpacePageRequest;
import com.aiclub.platform.dto.request.UpdateWikiSpaceRequest;
import com.aiclub.platform.dto.request.WikiImportPreviewRequest;
import com.aiclub.platform.service.DocumentAssetService;
import com.aiclub.platform.service.WikiSpaceService;
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

import java.util.List;
import java.util.NoSuchElementException;

/**
 * 空间化 Wiki 控制器，提供空间、目录、页面、版本和搜索能力。
 */
@RestController
@RequestMapping("/api/wiki")
public class WikiSpaceController {

    private final WikiSpaceService wikiSpaceService;
    private final DocumentAssetService documentAssetService;

    public WikiSpaceController(WikiSpaceService wikiSpaceService,
                               DocumentAssetService documentAssetService) {
        this.wikiSpaceService = wikiSpaceService;
        this.documentAssetService = documentAssetService;
    }

    /**
     * 读取空间列表，可按项目关联和可见范围过滤。
     */
    @GetMapping("/spaces")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSpaceSummary>> listSpaces(@RequestParam(required = false) String keyword,
                                                          @RequestParam(required = false) Boolean mineOnly,
                                                          @RequestParam(required = false) Boolean publicOnly,
                                                          @RequestParam(required = false) Long projectId) {
        return ApiResponse.success(wikiSpaceService.listSpaces(keyword, mineOnly, publicOnly, projectId));
    }

    /**
     * 创建 Wiki 空间。
     */
    @PostMapping("/spaces")
    @RequirePermission("wiki:manage")
    public ApiResponse<WikiSpaceDetail> createSpace(@Valid @RequestBody CreateWikiSpaceRequest request) {
        return ApiResponse.success(wikiSpaceService.createSpace(request));
    }

    /**
     * 读取空间详情。
     */
    @GetMapping("/spaces/{spaceId}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpaceDetail> getSpace(@PathVariable Long spaceId) {
        return ApiResponse.success(wikiSpaceService.getSpaceDetail(spaceId));
    }

    /**
     * 更新空间基础信息。
     */
    @PutMapping("/spaces/{spaceId}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpaceDetail> updateSpace(@PathVariable Long spaceId,
                                                    @Valid @RequestBody UpdateWikiSpaceRequest request) {
        return ApiResponse.success(wikiSpaceService.updateSpace(spaceId, request));
    }

    /**
     * 删除空间。
     */
    @DeleteMapping("/spaces/{spaceId}")
    @RequirePermission("wiki:view")
    public ApiResponse<Void> deleteSpace(@PathVariable Long spaceId) {
        wikiSpaceService.deleteSpace(spaceId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    /**
     * 读取空间成员列表。
     */
    @GetMapping("/spaces/{spaceId}/members")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSpaceMemberSummary>> listMembers(@PathVariable Long spaceId) {
        return ApiResponse.success(wikiSpaceService.listMembers(spaceId));
    }

    /**
     * 替换空间成员列表。
     */
    @PutMapping("/spaces/{spaceId}/members")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSpaceMemberSummary>> replaceMembers(@PathVariable Long spaceId,
                                                                    @Valid @RequestBody ReplaceWikiSpaceMembersRequest request) {
        return ApiResponse.success(wikiSpaceService.replaceMembers(spaceId, request));
    }

    /**
     * 读取空间目录树。
     */
    @GetMapping("/spaces/{spaceId}/directories/tree")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiDirectoryTreeNode>> directoryTree(@PathVariable Long spaceId) {
        return ApiResponse.success(wikiSpaceService.getDirectoryTree(spaceId));
    }

    /**
     * 创建目录。
     */
    @PostMapping("/spaces/{spaceId}/directories")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiDirectorySummary> createDirectory(@PathVariable Long spaceId,
                                                             @Valid @RequestBody CreateWikiDirectoryRequest request) {
        return ApiResponse.success(wikiSpaceService.createDirectory(spaceId, request));
    }

    /**
     * 更新目录。
     */
    @PutMapping("/spaces/{spaceId}/directories/{directoryId}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiDirectorySummary> updateDirectory(@PathVariable Long spaceId,
                                                             @PathVariable Long directoryId,
                                                             @Valid @RequestBody UpdateWikiDirectoryRequest request) {
        return ApiResponse.success(wikiSpaceService.updateDirectory(spaceId, directoryId, request));
    }

    /**
     * 删除目录。
     */
    @DeleteMapping("/spaces/{spaceId}/directories/{directoryId}")
    @RequirePermission("wiki:view")
    public ApiResponse<Void> deleteDirectory(@PathVariable Long spaceId, @PathVariable Long directoryId) {
        wikiSpaceService.deleteDirectory(spaceId, directoryId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    /**
     * 按页面 ID 读取页面详情。
     */
    @GetMapping("/spaces/{spaceId}/pages/{pageId}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageDetail> getPage(@PathVariable Long spaceId, @PathVariable Long pageId) {
        return ApiResponse.success(wikiSpaceService.getPageDetail(spaceId, pageId));
    }

    /**
     * 按页面 slug 读取页面详情。
     */
    @GetMapping("/spaces/{spaceId}/pages/by-slug/{slug}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageDetail> getPageBySlug(@PathVariable Long spaceId, @PathVariable String slug) {
        return ApiResponse.success(wikiSpaceService.getPageBySlug(spaceId, slug));
    }

    /**
     * 创建页面。
     */
    @PostMapping("/spaces/{spaceId}/pages")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageDetail> createPage(@PathVariable Long spaceId,
                                                       @Valid @RequestBody CreateWikiSpacePageRequest request) {
        return ApiResponse.success(wikiSpaceService.createPage(spaceId, request));
    }

    /**
     * 预览导入文档转换后的 Markdown 内容。
     */
    @PostMapping("/spaces/{spaceId}/imports/preview")
    @RequirePermission("wiki:view")
    public ApiResponse<DocumentMarkdownResult> previewImport(@PathVariable Long spaceId,
                                                             @Valid @RequestBody WikiImportPreviewRequest request) {
        return ApiResponse.success(wikiSpaceService.previewImport(spaceId, request));
    }

    /**
     * 从文档资产创建 Wiki 页面。
     */
    @PostMapping("/spaces/{spaceId}/pages/import")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageDetail> importPage(@PathVariable Long spaceId,
                                                       @Valid @RequestBody CreateWikiImportPageRequest request) {
        return ApiResponse.success(wikiSpaceService.importPage(spaceId, request));
    }

    /**
     * 更新页面。
     */
    @PutMapping("/spaces/{spaceId}/pages/{pageId}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageDetail> updatePage(@PathVariable Long spaceId,
                                                       @PathVariable Long pageId,
                                                       @Valid @RequestBody UpdateWikiSpacePageRequest request) {
        return ApiResponse.success(wikiSpaceService.updatePage(spaceId, pageId, request));
    }

    /**
     * 手动重新排队页面 Hindsight 同步任务。
     */
    @PostMapping("/spaces/{spaceId}/pages/{pageId}/sync")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageDetail> retryPageSync(@PathVariable Long spaceId,
                                                          @PathVariable Long pageId) {
        return ApiResponse.success(wikiSpaceService.retryPageSync(spaceId, pageId));
    }

    /**
     * 删除页面。
     */
    @DeleteMapping("/spaces/{spaceId}/pages/{pageId}")
    @RequirePermission("wiki:view")
    public ApiResponse<Void> deletePage(@PathVariable Long spaceId, @PathVariable Long pageId) {
        wikiSpaceService.deletePage(spaceId, pageId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    /**
     * 读取页面版本历史。
     */
    @GetMapping("/spaces/{spaceId}/pages/{pageId}/versions")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSpacePageVersionSummary>> listPageVersions(@PathVariable Long spaceId,
                                                                           @PathVariable Long pageId) {
        return ApiResponse.success(wikiSpaceService.listPageVersions(spaceId, pageId));
    }

    /**
     * 读取页面指定版本。
     */
    @GetMapping("/spaces/{spaceId}/pages/{pageId}/versions/{versionNumber}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageVersionSummary> getPageVersion(@PathVariable Long spaceId,
                                                                   @PathVariable Long pageId,
                                                                   @PathVariable Integer versionNumber) {
        return ApiResponse.success(wikiSpaceService.getPageVersion(spaceId, pageId, versionNumber));
    }

    /**
     * 恢复页面指定版本。
     */
    @PostMapping("/spaces/{spaceId}/pages/{pageId}/restore/{versionNumber}")
    @RequirePermission("wiki:view")
    public ApiResponse<WikiSpacePageDetail> restorePageVersion(@PathVariable Long spaceId,
                                                               @PathVariable Long pageId,
                                                               @PathVariable Integer versionNumber) {
        return ApiResponse.success(wikiSpaceService.restorePageVersion(spaceId, pageId, versionNumber));
    }

    /**
     * 全局 Wiki 搜索。
     */
    @GetMapping("/search")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSpacePageSummary>> searchPages(@RequestParam(required = false) String keyword,
                                                               @RequestParam(required = false) Long spaceId,
                                                               @RequestParam(required = false) Long projectId) {
        return ApiResponse.success(wikiSpaceService.searchPages(keyword, spaceId, projectId));
    }

    /**
     * 全局 Wiki 语义搜索。
     */
    @GetMapping("/semantic-search")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSpaceSearchResult>> semanticSearch(@RequestParam(required = false) String query,
                                                                   @RequestParam(required = false) Long spaceId,
                                                                   @RequestParam(required = false) Long projectId) {
        return ApiResponse.success(wikiSpaceService.semanticSearchPages(query, spaceId, projectId));
    }

    /**
     * 读取页面相关内容推荐。
     */
    @GetMapping("/spaces/{spaceId}/pages/{pageId}/related")
    @RequirePermission("wiki:view")
    public ApiResponse<List<WikiSpacePageSummary>> relatedPages(@PathVariable Long spaceId, @PathVariable Long pageId) {
        return ApiResponse.success(wikiSpaceService.relatedPages(spaceId, pageId, 8));
    }

}
