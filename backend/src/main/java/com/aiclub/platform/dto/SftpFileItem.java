package com.aiclub.platform.dto;

/**
 * SFTP 远程文件或目录项。
 */
public record SftpFileItem(
        String name,
        String path,
        boolean isDirectory,
        boolean symbolicLink,
        String linkTarget,
        long size,
        String lastModified,
        String permissions
) {
}
