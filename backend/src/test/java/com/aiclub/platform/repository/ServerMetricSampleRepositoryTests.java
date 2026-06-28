package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.domain.model.ServerMetricSampleEntity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 覆盖服务器监控采样历史清理的仓储事务边界。
 */
@SpringBootTest
class ServerMetricSampleRepositoryTests {

    @Autowired
    private ServerInfoRepository serverInfoRepository;

    @Autowired
    private ServerMetricSampleRepository serverMetricSampleRepository;

    @Test
    void shouldDeleteExpiredSamplesWithoutCallerTransaction() {
        ServerInfoEntity server = serverInfoRepository.save(buildServer());
        ServerMetricSampleEntity expired = buildSample(server, LocalDateTime.now().minusHours(80));
        serverMetricSampleRepository.save(expired);

        assertThatCode(() -> serverMetricSampleRepository.deleteAllBySampledAtBefore(LocalDateTime.now().minusHours(72)))
                .doesNotThrowAnyException();

        assertThat(serverMetricSampleRepository.findAll()).isEmpty();
    }

    private ServerInfoEntity buildServer() {
        ServerInfoEntity server = new ServerInfoEntity();
        server.setName("监控测试服务器");
        server.setDescription("用于采样历史清理测试");
        server.setHost("127.0.0.1");
        server.setPort(22);
        server.setUsername("tester");
        server.setOsType(ServerInfoEntity.OS_TYPE_LINUX);
        server.setAuthType(ServerInfoEntity.AUTH_TYPE_PASSWORD);
        server.setEnabled(true);
        return server;
    }

    private ServerMetricSampleEntity buildSample(ServerInfoEntity server, LocalDateTime sampledAt) {
        ServerMetricSampleEntity sample = new ServerMetricSampleEntity();
        sample.setServer(server);
        sample.setProbeStatus("SUCCESS");
        sample.setProbeMessage("");
        sample.setCpuUsagePercent(1);
        sample.setMemoryUsagePercent(2);
        sample.setDiskUsagePercent(3);
        sample.setSampledAt(sampledAt);
        return sample;
    }
}
