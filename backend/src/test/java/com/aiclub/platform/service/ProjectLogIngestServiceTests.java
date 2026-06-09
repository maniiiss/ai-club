package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectLogCursorEntity;
import com.aiclub.platform.domain.model.ProjectRuntimeInstanceEntity;
import com.aiclub.platform.domain.model.ProjectRuntimeLogEntity;
import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.dto.request.InternalObservabilityLogLineRequest;
import com.aiclub.platform.repository.ProjectLogCursorRepository;
import com.aiclub.platform.repository.ProjectRuntimeInstanceRepository;
import com.aiclub.platform.repository.ProjectRuntimeLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectLogIngestServiceTests {

    @Mock
    private ProjectRuntimeLogRepository projectRuntimeLogRepository;

    @Mock
    private ProjectLogCursorRepository projectLogCursorRepository;

    @Mock
    private ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository;

    @Mock
    private ServerSshGateway serverSshGateway;

    private ProjectLogIngestService service;

    @BeforeEach
    void setUp() {
        service = new ProjectLogIngestService(
                projectRuntimeLogRepository,
                projectLogCursorRepository,
                projectRuntimeInstanceRepository,
                serverSshGateway,
                new ObservabilityProperties(true, 262144, 14, 30, 3000, 5000, "token"),
                new ObjectMapper()
        );
    }

    /**
     * SSH 采集需要同时兼容 JSON 行与普通文本行，并在一次增量读取后正确推进游标。
     */
    @Test
    void shouldCollectStructuredAndPlainLogLinesFromSshChunk() {
        ProjectRuntimeInstanceEntity runtimeInstance = runtimeInstance();
        String payload = "{\"timestamp\":\"2026-06-09T00:00:00\",\"level\":\"INFO\",\"logger\":\"app.main\",\"traceId\":\"trace-1\",\"message\":\"启动完成\"}\n普通日志行\n";
        byte[] chunk = payload.getBytes(StandardCharsets.UTF_8);
        when(serverSshGateway.readFileMetadata(runtimeInstance.getServer(), "/srv/app.log"))
                .thenReturn(new ServerSshGateway.RemoteFileMetadata("/srv/app.log", chunk.length, 1_717_864_000L, false, false));
        when(serverSshGateway.readFileChunk(runtimeInstance.getServer(), "/srv/app.log", 0L, chunk.length))
                .thenReturn(chunk);
        when(projectLogCursorRepository.findByRuntimeInstance_IdAndSourcePath(runtimeInstance.getId(), "/srv/app.log"))
                .thenReturn(Optional.empty());
        when(projectLogCursorRepository.save(any(ProjectLogCursorEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(projectRuntimeInstanceRepository.save(any(ProjectRuntimeInstanceEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.collectRuntimeInstanceLogs(runtimeInstance);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ProjectRuntimeLogEntity>> logsCaptor = ArgumentCaptor.forClass(List.class);
        verify(projectRuntimeLogRepository).saveAll(logsCaptor.capture());
        List<ProjectRuntimeLogEntity> logs = logsCaptor.getValue();
        assertThat(logs).hasSize(2);
        assertThat(logs.get(0).getLogLevel()).isEqualTo("INFO");
        assertThat(logs.get(0).getLogger()).isEqualTo("app.main");
        assertThat(logs.get(0).getTraceId()).isEqualTo("trace-1");
        assertThat(logs.get(0).getMessage()).isEqualTo("启动完成");
        assertThat(logs.get(1).getMessage()).isEqualTo("普通日志行");

        ArgumentCaptor<ProjectLogCursorEntity> cursorCaptor = ArgumentCaptor.forClass(ProjectLogCursorEntity.class);
        verify(projectLogCursorRepository).save(cursorCaptor.capture());
        assertThat(cursorCaptor.getValue().getByteOffset()).isEqualTo((long) chunk.length);
        assertThat(cursorCaptor.getValue().getPendingText()).isEmpty();
        assertThat(runtimeInstance.getLastLogCollectStatus()).isEqualTo("SUCCESS");
    }

    /**
     * 主动上报日志需要直接落成统一日志模型，并回写最近一次采集摘要。
     */
    @Test
    void shouldIngestPushLogsAndUpdateRuntimeInstanceSummary() {
        ProjectRuntimeInstanceEntity runtimeInstance = runtimeInstance();
        when(projectRuntimeInstanceRepository.findById(31L)).thenReturn(Optional.of(runtimeInstance));
        when(projectRuntimeInstanceRepository.save(any(ProjectRuntimeInstanceEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.ingestPushLogs(31L, List.of(new InternalObservabilityLogLineRequest(
                "ERROR",
                "app.worker",
                "trace-push",
                "/srv/app.log",
                "2026-06-09T00:00:01",
                "任务失败",
                "{\"message\":\"任务失败\"}"
        )));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ProjectRuntimeLogEntity>> logsCaptor = ArgumentCaptor.forClass(List.class);
        verify(projectRuntimeLogRepository).saveAll(logsCaptor.capture());
        List<ProjectRuntimeLogEntity> logs = logsCaptor.getValue();
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getSourceType()).isEqualTo(ProjectRuntimeLogEntity.SOURCE_TYPE_PUSH);
        assertThat(logs.get(0).getLogLevel()).isEqualTo("ERROR");
        assertThat(logs.get(0).getMessage()).isEqualTo("任务失败");
        assertThat(runtimeInstance.getLastLogCollectStatus()).isEqualTo("SUCCESS");
        assertThat(runtimeInstance.getLastLogCollectMessage()).contains("1 行日志");
    }

    /**
     * 当同一路径日志文件已经轮转为新文件时，应基于文件头哈希重置游标，避免错过新文件开头日志。
     */
    @Test
    void shouldResetCursorWhenLogFileIsRotatedWithDifferentHeadHash() {
        ProjectRuntimeInstanceEntity runtimeInstance = runtimeInstance();
        ProjectLogCursorEntity cursor = new ProjectLogCursorEntity();
        cursor.setRuntimeInstance(runtimeInstance);
        cursor.setSourcePath("/srv/app.log");
        cursor.setByteOffset(20L);
        cursor.setLastFileSize(20L);
        cursor.setLastModifiedEpochSeconds(100L);
        cursor.setLastHeadHash("old-hash");
        cursor.setPendingText("");

        byte[] header = "new-log-line\n".getBytes(StandardCharsets.UTF_8);
        when(projectLogCursorRepository.findByRuntimeInstance_IdAndSourcePath(runtimeInstance.getId(), "/srv/app.log"))
                .thenReturn(Optional.of(cursor));
        when(serverSshGateway.readFileMetadata(runtimeInstance.getServer(), "/srv/app.log"))
                .thenReturn(new ServerSshGateway.RemoteFileMetadata("/srv/app.log", header.length, 200L, false, false));
        when(serverSshGateway.readFileChunk(runtimeInstance.getServer(), "/srv/app.log", 0L, header.length))
                .thenReturn(header)
                .thenReturn(header);
        when(projectLogCursorRepository.save(any(ProjectLogCursorEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(projectRuntimeInstanceRepository.save(any(ProjectRuntimeInstanceEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.collectRuntimeInstanceLogs(runtimeInstance);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ProjectRuntimeLogEntity>> logsCaptor = ArgumentCaptor.forClass(List.class);
        verify(projectRuntimeLogRepository).saveAll(logsCaptor.capture());
        assertThat(logsCaptor.getValue()).hasSize(1);
        assertThat(logsCaptor.getValue().get(0).getMessage()).isEqualTo("new-log-line");

        ArgumentCaptor<ProjectLogCursorEntity> cursorCaptor = ArgumentCaptor.forClass(ProjectLogCursorEntity.class);
        verify(projectLogCursorRepository).save(cursorCaptor.capture());
        assertThat(cursorCaptor.getValue().getByteOffset()).isEqualTo((long) header.length);
    }

    private ProjectRuntimeInstanceEntity runtimeInstance() {
        ProjectEntity project = new ProjectEntity("观测项目", "负责人", "进行中", "日志采集测试");
        project.setId(11L);
        ServerInfoEntity server = new ServerInfoEntity();
        server.setId(21L);
        server.setName("生产服务器");
        server.setHost("10.10.10.10");
        server.setUsername("deploy");
        ProjectRuntimeInstanceEntity runtimeInstance = new ProjectRuntimeInstanceEntity();
        runtimeInstance.setId(31L);
        runtimeInstance.setProject(project);
        runtimeInstance.setServer(server);
        runtimeInstance.setEnabled(true);
        runtimeInstance.setLogEnabled(true);
        runtimeInstance.setLogPathsJson("[\"/srv/app.log\"]");
        runtimeInstance.setHealthEnabled(true);
        return runtimeInstance;
    }
}
