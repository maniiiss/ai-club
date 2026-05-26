package com.aiclub.platform.service;

/**
 * 表示 SFTP 下载在流式写出阶段被客户端（浏览器或反向代理）主动中断。
 *
 * <p>这是客户端行为而非服务端故障：HTTP 响应已经提交，
 * Controller 不能也不应再尝试向响应里写错误 JSON。
 * Controller 捕获此异常后只需记录日志即可。</p>
 */
public class SftpDownloadAbortedException extends RuntimeException {

    public SftpDownloadAbortedException(Throwable cause) {
        super(cause == null || cause.getMessage() == null
                ? "客户端在下载过程中中断了连接"
                : "客户端在下载过程中中断了连接：" + cause.getMessage(), cause);
    }
}
