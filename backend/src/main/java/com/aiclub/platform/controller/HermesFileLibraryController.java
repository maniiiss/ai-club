package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.HermesFileLibraryItemSummary;
import com.aiclub.platform.dto.request.UpdateHermesFileLibraryItemRequest;
import com.aiclub.platform.service.HermesFileLibraryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Hermes 个人文件库接口。
 * 业务意图：让管理端和公众端共用同一套个人知识文件管理能力。
 */
@RestController
@RequestMapping("/api/hermes/file-library")
@OperationLog(skip = true)
public class HermesFileLibraryController {

    private final HermesFileLibraryService hermesFileLibraryService;

    public HermesFileLibraryController(HermesFileLibraryService hermesFileLibraryService) {
        this.hermesFileLibraryService = hermesFileLibraryService;
    }

    /**
     * 查询当前用户的个人文件库。
     */
    @GetMapping
    @RequirePermission("hermes:chat")
    public ApiResponse<List<HermesFileLibraryItemSummary>> list(@RequestParam(required = false) String query) {
        return ApiResponse.success(hermesFileLibraryService.list(query));
    }

    /**
     * 上传文档并写入个人文件库索引。
     */
    @PostMapping("/upload")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesFileLibraryItemSummary> upload(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(hermesFileLibraryService.upload(file));
    }

    /**
     * 更新当前用户文件库条目的标题、描述或启停状态。
     */
    @PatchMapping("/{id}")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesFileLibraryItemSummary> update(@PathVariable Long id,
                                                            @Valid @RequestBody UpdateHermesFileLibraryItemRequest request) {
        return ApiResponse.success(hermesFileLibraryService.update(id, request));
    }

    /**
     * 删除当前用户自己的文件库条目。
     */
    @DeleteMapping("/{id}")
    @RequirePermission("hermes:chat")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        hermesFileLibraryService.delete(id);
        return new ApiResponse<>(true, "ok", null);
    }

    /**
     * 重新转换并刷新当前用户文件库条目的 Qdrant 向量索引。
     */
    @PostMapping("/{id}/reindex")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesFileLibraryItemSummary> reindex(@PathVariable Long id) {
        return ApiResponse.success(hermesFileLibraryService.reindex(id));
    }
}
