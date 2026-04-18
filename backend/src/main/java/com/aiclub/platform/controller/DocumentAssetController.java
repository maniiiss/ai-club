package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DocumentAssetSummary;
import com.aiclub.platform.service.DocumentAssetService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 平台通用文档资产上传控制器。
 */
@RestController
@RequestMapping("/api/document-assets")
public class DocumentAssetController {

    private final DocumentAssetService documentAssetService;

    public DocumentAssetController(DocumentAssetService documentAssetService) {
        this.documentAssetService = documentAssetService;
    }

    /**
     * 上传文档生成临时资产，供 Wiki 导入或 Hermes 附件复用。
     */
    @PostMapping
    @RequirePermission("wiki:view")
    public ApiResponse<DocumentAssetSummary> upload(@RequestParam("file") MultipartFile file,
                                                    @RequestParam(value = "directory", required = false) String directory) {
        return ApiResponse.success(documentAssetService.uploadAsset(file, directory));
    }
}
