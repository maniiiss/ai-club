package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.service.ExecutionArtifactStorageService;
import com.aiclub.platform.service.ProjectDataPermissionService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.NoSuchElementException;

/**
 * 执行产物下载控制器。
 * 所有扫描报告都通过该接口按当前用户权限下载，避免直接暴露对象存储对象键。
 */
@RestController
@RequestMapping("/api/execution-artifacts")
public class ExecutionArtifactController {

    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ExecutionArtifactStorageService executionArtifactStorageService;

    public ExecutionArtifactController(ExecutionArtifactRepository executionArtifactRepository,
                                       ProjectDataPermissionService projectDataPermissionService,
                                       ExecutionArtifactStorageService executionArtifactStorageService) {
        this.executionArtifactRepository = executionArtifactRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.executionArtifactStorageService = executionArtifactStorageService;
    }

    /**
     * 下载指定执行产物文件。
     */
    @GetMapping("/{id}/download")
    @RequirePermission("task:view")
    public ResponseEntity<byte[]> download(@PathVariable Long id) {
        ExecutionArtifactEntity artifact = executionArtifactRepository.findDetailById(id)
                .orElseThrow(() -> new NoSuchElementException("执行产物不存在: " + id));
        projectDataPermissionService.requireProjectVisible(artifact.getRun().getExecutionTask().getProject());
        if (artifact.getContentRef() == null || artifact.getContentRef().isBlank()) {
            throw new IllegalArgumentException("当前执行产物没有可下载文件");
        }
        ExecutionArtifactStorageService.StoredArtifactContent content = executionArtifactStorageService.load(artifact.getContentRef());
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            mediaType = MediaType.parseMediaType(content.contentType());
        } catch (Exception ignored) {
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resolveFileName(artifact) + "\"")
                .body(content.bytes());
    }

    /**
     * 统一根据对象键或标题推断下载文件名。
     */
    private String resolveFileName(ExecutionArtifactEntity artifact) {
        String objectKey = artifact.getContentRef();
        if (objectKey != null && objectKey.contains("/")) {
            String fileName = objectKey.substring(objectKey.lastIndexOf('/') + 1);
            if (!fileName.isBlank()) {
                return fileName;
            }
        }
        String normalizedTitle = artifact.getTitle() == null || artifact.getTitle().isBlank()
                ? "execution-artifact"
                : artifact.getTitle().replaceAll("[\\\\/:*?\"<>|\\s]+", "-");
        return normalizedTitle + ".dat";
    }
}
