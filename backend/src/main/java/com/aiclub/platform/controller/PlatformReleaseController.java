package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PlatformReleaseAcknowledgeResult;
import com.aiclub.platform.dto.PlatformReleaseDetail;
import com.aiclub.platform.dto.PlatformReleaseSummary;
import com.aiclub.platform.dto.request.PlatformReleaseRequest;
import com.aiclub.platform.service.PlatformReleaseService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

/**
 * 平台版本发布接口。
 * 业务意图：管理端负责正式发布，公众端只读取当前账号尚未展示的版本说明。
 */
@RestController
@RequestMapping("/api/platform-releases")
public class PlatformReleaseController {

    private final PlatformReleaseService platformReleaseService;

    public PlatformReleaseController(PlatformReleaseService platformReleaseService) {
        this.platformReleaseService = platformReleaseService;
    }

    /** 管理端分页查看已发布版本。 */
    @GetMapping("/admin")
    @RequirePermission("system:release:view")
    public ApiResponse<PageResponse<PlatformReleaseSummary>> pageAdmin(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(platformReleaseService.pageAdmin(page, size));
    }

    /** 管理端查看单条版本完整内容。 */
    @GetMapping("/admin/{id}")
    @RequirePermission("system:release:view")
    public ApiResponse<PlatformReleaseDetail> getAdmin(@PathVariable Long id) {
        return ApiResponse.success(platformReleaseService.getAdmin(id));
    }

    /** 管理员正式发布版本内容。 */
    @PostMapping
    @RequirePermission("system:release:manage")
    @OperationLog(moduleCode = "PLATFORM_RELEASE", moduleName = "版本发布", actionCode = "PUBLISH", actionName = "发布版本", bizType = "PLATFORM_RELEASE")
    public ApiResponse<PlatformReleaseDetail> publish(@Valid @RequestBody PlatformReleaseRequest request) {
        return ApiResponse.success(platformReleaseService.publish(request));
    }

    /** 公众端读取最新待展示版本，没有待展示内容时 data 为 null。 */
    @GetMapping("/pending")
    public ApiResponse<PlatformReleaseDetail> pending() {
        Optional<PlatformReleaseDetail> pending = platformReleaseService.pendingForCurrentUser();
        return ApiResponse.success(pending.orElse(null));
    }

    /** 关闭或确认版本弹窗时记录展示状态。 */
    @PostMapping("/{id}/acknowledge")
    public ApiResponse<PlatformReleaseAcknowledgeResult> acknowledge(@PathVariable Long id) {
        return ApiResponse.success(platformReleaseService.acknowledge(id));
    }
}
