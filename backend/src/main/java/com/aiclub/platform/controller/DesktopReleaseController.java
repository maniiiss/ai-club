package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DesktopReleaseArtifactSummary;
import com.aiclub.platform.dto.DesktopReleaseDetail;
import com.aiclub.platform.dto.DesktopReleaseLatest;
import com.aiclub.platform.dto.DesktopReleaseSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.DesktopReleaseRequest;
import com.aiclub.platform.service.DesktopReleaseService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.time.Duration;

/**
 * GitPilot Desktop 发布中心接口。
 * 业务意图：管理员写入发布状态，公开读接口只返回已发布且可下载的版本信息。
 */
@RestController
@RequestMapping("/api/desktop-releases")
public class DesktopReleaseController {

    private final DesktopReleaseService releaseService;

    public DesktopReleaseController(DesktopReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @GetMapping({"", "/admin"})
    @RequirePermission("system:desktop-release:view")
    public ApiResponse<PageResponse<DesktopReleaseSummary>> pageAdmin(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(releaseService.pageAdmin(page, size));
    }

    @GetMapping("/admin/{id}")
    @RequirePermission("system:desktop-release:view")
    public ApiResponse<DesktopReleaseDetail> getAdmin(@PathVariable Long id) {
        return ApiResponse.success(releaseService.getAdmin(id));
    }

    @PostMapping
    @RequirePermission("system:desktop-release:manage")
    @OperationLog(moduleCode = "DESKTOP_RELEASE", moduleName = "桌面版本发布", actionCode = "CREATE", actionName = "创建草稿", bizType = "DESKTOP_RELEASE")
    public ApiResponse<DesktopReleaseDetail> create(@Valid @RequestBody DesktopReleaseRequest request) {
        return ApiResponse.success(releaseService.createDraft(request));
    }

    @PostMapping(value = "/{id}/artifacts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission("system:desktop-release:manage")
    @OperationLog(moduleCode = "DESKTOP_RELEASE", moduleName = "桌面版本发布", actionCode = "UPLOAD", actionName = "上传产物", bizType = "DESKTOP_RELEASE", bizIdParam = "id")
    public ApiResponse<DesktopReleaseArtifactSummary> uploadArtifact(
            @PathVariable Long id,
            @RequestParam String artifactKind,
            @RequestParam(defaultValue = "windows") String platform,
            @RequestParam(defaultValue = "x86_64") String arch,
            @RequestParam String bundleType,
            @RequestParam("file") MultipartFile file) {
        return ApiResponse.success(releaseService.uploadArtifact(id, artifactKind, platform, arch, bundleType, file));
    }

    @PostMapping("/{id}/publish")
    @RequirePermission("system:desktop-release:manage")
    @OperationLog(moduleCode = "DESKTOP_RELEASE", moduleName = "桌面版本发布", actionCode = "PUBLISH", actionName = "发布桌面版本", bizType = "DESKTOP_RELEASE", bizIdParam = "id")
    public ApiResponse<DesktopReleaseDetail> publish(@PathVariable Long id) {
        return ApiResponse.success(releaseService.publish(id));
    }

    @PostMapping("/{id}/revoke")
    @RequirePermission("system:desktop-release:manage")
    @OperationLog(moduleCode = "DESKTOP_RELEASE", moduleName = "桌面版本发布", actionCode = "REVOKE", actionName = "撤回桌面版本", bizType = "DESKTOP_RELEASE", bizIdParam = "id")
    public ApiResponse<DesktopReleaseDetail> revoke(@PathVariable Long id) {
        return ApiResponse.success(releaseService.revoke(id));
    }

    /** 公众端下载页使用的最新 stable 版本元数据。 */
    @GetMapping("/latest")
    public ResponseEntity<ApiResponse<DesktopReleaseLatest>> latest(
            @RequestParam(defaultValue = "stable") String channel,
            @RequestParam(defaultValue = "windows") String platform,
            @RequestParam(defaultValue = "x86_64") String arch) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(ApiResponse.success(releaseService.latest(channel, platform, arch).orElse(null)));
    }

    /** 通过短期 presigned URL 下载已发布的安装器或 updater 压缩包。 */
    @GetMapping("/artifacts/{artifactId}/download")
    public ResponseEntity<Void> download(@PathVariable Long artifactId) {
        String url = releaseService.publicDownloadUrl(artifactId);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, URI.create(url).toString())
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic())
                .build();
    }
}
