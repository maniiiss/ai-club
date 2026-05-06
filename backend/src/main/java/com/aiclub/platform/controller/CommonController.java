package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CommonFileUploadSummary;
import com.aiclub.platform.service.CommonFileService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 平台通用控制器。
 * 统一收口文件上传与下载接口，避免业务控制器重复维护 MinIO 访问细节。
 */
@RestController
@RequestMapping("/api/common")
@OperationLog(moduleCode = "COMMON", moduleName = "通用能力", bizType = "COMMON_FILE")
public class CommonController {

    private final CommonFileService commonFileService;

    public CommonController(CommonFileService commonFileService) {
        this.commonFileService = commonFileService;
    }

    /**
     * 平台通用文件上传入口。
     * 只要求登录态，不区分图片、PDF 或其它文件类型；统一上传到 MinIO，并返回文件资产信息与访问地址。
     */
    @PostMapping(value = "/files/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @OperationLog(actionCode = "COMMON_FILE_UPLOAD", actionName = "上传文件")
    public ApiResponse<CommonFileUploadSummary> upload(@RequestParam("file") MultipartFile file,
                                                       @RequestParam(value = "directory", required = false) String directory) {
        return ApiResponse.success(commonFileService.uploadFile(file, directory));
    }

    /**
     * 当前登录用户自己的文件下载入口。
     */
    @GetMapping("/files/{fileId}")
    public ResponseEntity<byte[]> downloadOwned(@PathVariable Long fileId,
                                                @RequestParam(value = "inline", defaultValue = "true") boolean inline) {
        return commonFileService.downloadOwnedFile(fileId, !inline);
    }

    /**
     * 公开文件访问入口。
     * 头像、Markdown 图片等直接展示场景统一走这里。
     */
    @GetMapping("/public-files/{fileId}")
    public ResponseEntity<byte[]> downloadPublic(@PathVariable Long fileId,
                                                 @RequestParam(value = "inline", defaultValue = "true") boolean inline) {
        return commonFileService.downloadPublicFile(fileId, !inline);
    }
}
