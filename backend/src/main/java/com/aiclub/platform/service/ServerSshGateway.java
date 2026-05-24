package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;

import java.io.Closeable;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * 抽象服务器 SSH 访问能力，便于业务服务测试时替换为假实现。
 */
public interface ServerSshGateway {

    ServerProbeSnapshot probe(ServerInfoEntity server);

    ServerShellClient openShell(ServerInfoEntity server, int cols, int rows);

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
