package com.aiclub.platform.controller;

import com.aiclub.platform.service.CommonFileService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 兼容历史 Markdown 图片访问地址。
 * 早期 Wiki 文档导入会把抽取图片写成 /comment-images?key=...，旧页面仍依赖该公开直链展示。
 */
@RestController
public class LegacyImageController {

    private final CommonFileService commonFileService;

    public LegacyImageController(CommonFileService commonFileService) {
        this.commonFileService = commonFileService;
    }

    @GetMapping("/comment-images")
    public ResponseEntity<byte[]> downloadCommentImage(@RequestParam("key") String objectKey) {
        return commonFileService.downloadLegacyPublicImage(objectKey);
    }
}
