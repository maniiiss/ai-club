package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.dto.CommonFileUploadSummary;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.time.Duration;

/**
 * 平台通用文件服务。
 * 统一负责文件上传落 MinIO、文件资产落库，以及受控/公开下载响应封装。
 */
@Service
@Transactional(readOnly = true)
public class CommonFileService {

    private final DocumentAssetService documentAssetService;
    private final TaskCommentImageStorageService legacyPublicImageStorageService;

    public CommonFileService(DocumentAssetService documentAssetService,
                             TaskCommentImageStorageService legacyPublicImageStorageService) {
        this.documentAssetService = documentAssetService;
        this.legacyPublicImageStorageService = legacyPublicImageStorageService;
    }

    /**
     * 上传通用文件，并返回统一文件摘要。
     */
    @Transactional
    public CommonFileUploadSummary uploadFile(MultipartFile file, String directory) {
        DocumentAssetEntity asset = documentAssetService.uploadGenericAsset(file, directory);
        return toSummary(asset);
    }

    /**
     * 构建当前用户可访问文件的下载响应。
     */
    public ResponseEntity<byte[]> downloadOwnedFile(Long fileId, boolean attachment) {
        DocumentAssetEntity asset = documentAssetService.requireAccessibleAsset(fileId);
        var content = documentAssetService.loadContent(asset);
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            mediaType = MediaType.parseMediaType(content.contentType());
        } catch (Exception ignored) {
        }
        String dispositionType = attachment ? "attachment" : "inline";
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, dispositionType + "; filename=\"" + asset.getFileName() + "\"")
                .body(content.bytes());
    }

    /**
     * 构建公开文件访问响应。
     * 当前用于头像、图片和通用文件直链访问。
     */
    public ResponseEntity<byte[]> downloadPublicFile(Long fileId, boolean attachment) {
        DocumentAssetEntity asset = documentAssetService.requireAsset(fileId);
        var content = documentAssetService.loadContent(asset);
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            mediaType = MediaType.parseMediaType(content.contentType());
        } catch (Exception ignored) {
        }
        String dispositionType = attachment ? "attachment" : "inline";
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .header(HttpHeaders.CONTENT_DISPOSITION, dispositionType + "; filename=\"" + asset.getFileName() + "\"")
                .body(content.bytes());
    }

    /**
     * 兼容旧 Markdown 图片直链。
     * 历史 Wiki 导入内容中保存的是对象键 URL，无法反推文件资产ID，因此保留公开读取入口。
     */
    public ResponseEntity<byte[]> downloadLegacyPublicImage(String objectKey) {
        var content = legacyPublicImageStorageService.load(objectKey);
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            mediaType = MediaType.parseMediaType(content.contentType());
        } catch (Exception ignored) {
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .body(content.bytes());
    }

    /**
     * 将文档资产统一映射为对前端友好的通用上传结果。
     */
    public CommonFileUploadSummary toSummary(DocumentAssetEntity asset) {
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/common/public-files/")
                .path(String.valueOf(asset.getId()))
                .queryParam("inline", true)
                .toUriString();
        return new CommonFileUploadSummary(
                asset.getId(),
                asset.getFileName(),
                asset.getContentType(),
                asset.getFileSize(),
                asset.getSourceFormat(),
                asset.getBindingStatus(),
                url
        );
    }
}
