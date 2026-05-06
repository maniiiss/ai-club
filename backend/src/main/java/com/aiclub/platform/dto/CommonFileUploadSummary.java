package com.aiclub.platform.dto;

/**
 * 通用文件上传结果。
 * 统一返回文件资产主键、可直接访问的 URL 以及基础文件元信息，供前端不同业务场景复用。
 */
public record CommonFileUploadSummary(
        /** 文件资产主键ID。 */
        Long id,
        /** 原始文件名。 */
        String fileName,
        /** 内容类型。 */
        String contentType,
        /** 文件大小。 */
        long fileSize,
        /** 来源格式或扩展名。 */
        String sourceFormat,
        /** 绑定状态。 */
        String bindingStatus,
        /** 对外下载或展示地址。 */
        String url
) {
}
