package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.dto.SftpLsResult;

import java.io.Closeable;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * 抽象服务器 SSH 访问能力，便于业务服务测试时替换为假实现。
 */
public interface ServerSshGateway {

    ServerProbeSnapshot probe(ServerInfoEntity server);

    ServerShellClient openShell(ServerInfoEntity server, int cols, int rows);

    /** 列出远程目录内容 */
    SftpLsResult listDirectory(ServerInfoEntity server, String path);

    /** 将输入流中的数据上传到远程路径 */
    void uploadFile(ServerInfoEntity server, String remotePath, InputStream inputStream, long size);

    /** 将远程文件内容下载到输出流 */
    void downloadFile(ServerInfoEntity server, String remotePath, OutputStream outputStream);

    /** 删除远程文件或目录 */
    void delete(ServerInfoEntity server, String path, boolean recursive);

    /** 创建远程目录 */
    void mkdir(ServerInfoEntity server, String path);

    record ServerProbeSnapshot(
            Integer cpuUsagePercent,
            Integer memoryUsagePercent,
            Integer diskUsagePercent,
            String summary
    ) {
    }

    interface ServerShellClient extends Closeable {

        InputStream stdout();

        InputStream stderr();

        OutputStream stdin();

        void resize(int cols, int rows);

        @Override
        void close();
    }
}
