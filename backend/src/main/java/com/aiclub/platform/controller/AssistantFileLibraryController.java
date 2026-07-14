package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AssistantFileLibraryItemSummary;
import com.aiclub.platform.dto.request.UpdateAssistantFileLibraryItemRequest;
import com.aiclub.platform.service.AssistantFileLibraryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Assistant 个人文件库接口。
 * 业务意图：让管理端和公众端共用同一套个人知识文件管理能力。
 */
@RestController
@RequestMapping("/api/assistant/file-library")
@OperationLog(skip = true)
public class AssistantFileLibraryController {

    private final AssistantFileLibraryService assistantFileLibraryService;

    public AssistantFileLibraryController(AssistantFileLibraryService assistantFileLibraryService) {
        this.assistantFileLibraryService = assistantFileLibraryService;
    }

    /**
     * 查询当前用户的个人文件库。
     */
    @GetMapping
    @RequirePermission("hermes:chat")
    public ApiResponse<List<AssistantFileLibraryItemSummary>> list(@RequestParam(required = false) String query) {
        return ApiResponse.success(assistantFileLibraryService.list(query));
    }

    /**
     * 上传文档并写入个人文件库索引。
     */
    @PostMapping("/upload")
    @RequirePermission("hermes:chat")
    public ApiResponse<AssistantFileLibraryItemSummary> upload(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(assistantFileLibraryService.upload(file));
    }

    /**
     * 更新当前用户文件库条目的标题、描述或启停状态。
     */
    @PatchMapping("/{id}")
    @RequirePermission("hermes:chat")
    public ApiResponse<AssistantFileLibraryItemSummary> update(@PathVariable Long id,
                                                            @Valid @RequestBody UpdateAssistantFileLibraryItemRequest request) {
        return ApiResponse.success(assistantFileLibraryService.update(id, request));
    }

    /**
     * 为兼容部分代理或环境不支持 PATCH 的情况，额外开放 PUT 更新入口。
     */
    @PutMapping("/{id}")
    @RequirePermission("hermes:chat")
    public ApiResponse<AssistantFileLibraryItemSummary> updateByPut(@PathVariable Long id,
                                                                 @Valid @RequestBody UpdateAssistantFileLibraryItemRequest request) {
        return ApiResponse.success(assistantFileLibraryService.update(id, request));
    }

    /**
     * 删除当前用户自己的文件库条目。
     */
    @DeleteMapping("/{id}")
    @RequirePermission("hermes:chat")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        assistantFileLibraryService.delete(id);
        return new ApiResponse<>(true, "ok", null);
    }

    /**
     * 重新转换并刷新当前用户文件库条目的 Qdrant 向量索引。
     */
    @PostMapping("/{id}/reindex")
    @RequirePermission("hermes:chat")
    public ApiResponse<AssistantFileLibraryItemSummary> reindex(@PathVariable Long id) {
        return ApiResponse.success(assistantFileLibraryService.reindex(id));
    }
}
