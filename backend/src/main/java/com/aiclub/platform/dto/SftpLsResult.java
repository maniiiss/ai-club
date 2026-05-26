package com.aiclub.platform.dto;

import java.util.List;

/**
 * SFTP 远程目录列表结果。
 */
public record SftpLsResult(
        String path,
        List<SftpFileItem> files
) {
}
