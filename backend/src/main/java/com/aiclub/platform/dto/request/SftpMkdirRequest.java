package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * SFTP 创建远程目录请求。
 */
public record SftpMkdirRequest(

        @NotBlank(message = "目录路径不能为空")
        String path
) {
}
