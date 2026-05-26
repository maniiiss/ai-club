package com.aiclub.platform.dto;

/**
 * SFTP 下载票据，供浏览器用原生下载流拉取大文件。
 */
public record SftpDownloadTicket(
        String ticket,
        String expiresAt
) {
}
