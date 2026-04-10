package com.aiclub.platform.controller;

import com.aiclub.platform.service.TaskCommentImageStorageService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
public class PublicAssetController {

    private final TaskCommentImageStorageService taskCommentImageStorageService;

    public PublicAssetController(TaskCommentImageStorageService taskCommentImageStorageService) {
        this.taskCommentImageStorageService = taskCommentImageStorageService;
    }

    @GetMapping("/comment-images")
    public ResponseEntity<byte[]> getCommentImage(@RequestParam("key") String key) {
        return buildImageResponse(taskCommentImageStorageService.load(key));
    }

    /**
     * 公开读取用户头像，供个人中心与右上角资料区直接展示。
     */
    @GetMapping("/profile-avatars")
    public ResponseEntity<byte[]> getProfileAvatar(@RequestParam("key") String key) {
        return buildImageResponse(taskCommentImageStorageService.load(key));
    }

    /**
     * 统一封装公开图片响应，避免不同图片场景重复处理缓存和内容类型。
     */
    private ResponseEntity<byte[]> buildImageResponse(TaskCommentImageStorageService.StoredCommentImageContent image) {
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            mediaType = MediaType.parseMediaType(image.contentType());
        } catch (Exception ignored) {
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(image.bytes());
    }
}
