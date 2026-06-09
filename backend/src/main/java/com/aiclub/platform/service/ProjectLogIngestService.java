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
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 项目运行日志归集服务。
 * 统一处理 SSH 增量拉取与内部主动上报两条链路，保证最终日志模型一致。
 */
@Service
public class ProjectLogIngestService {

    private static final DateTimeFormatter DISPLAY_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int FILE_HEAD_SIGNATURE_BYTES = 512;

    private final ProjectRuntimeLogRepository projectRuntimeLogRepository;
    private final ProjectLogCursorRepository projectLogCursorRepository;
    private final ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository;
    private final ServerSshGateway serverSshGateway;
    private final ObservabilityProperties observabilityProperties;
    private final ObjectMapper objectMapper;

    public ProjectLogIngestService(ProjectRuntimeLogRepository projectRuntimeLogRepository,
                                   ProjectLogCursorRepository projectLogCursorRepository,
                                   ProjectRuntimeInstanceRepository projectRuntimeInstanceRepository,
                                   ServerSshGateway serverSshGateway,
                                   ObservabilityProperties observabilityProperties,
                                   ObjectMapper objectMapper) {
        this.projectRuntimeLogRepository = projectRuntimeLogRepository;
        this.projectLogCursorRepository = projectLogCursorRepository;
        this.projectRuntimeInstanceRepository = projectRuntimeInstanceRepository;
        this.serverSshGateway = serverSshGateway;
        this.observabilityProperties = observabilityProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 通过 SSH 对受管服务器实例执行一次增量日志采集。
     */
    @Transactional
    public void collectRuntimeInstanceLogs(ProjectRuntimeInstanceEntity runtimeInstance) {
        if (runtimeInstance == null || !Boolean.TRUE.equals(runtimeInstance.getEnabled()) || !Boolean.TRUE.equals(runtimeInstance.getLogEnabled())) {
            return;
        }
        ServerInfoEntity server = runtimeInstance.getServer();
        if (server == null) {
            updateCollectSummary(runtimeInstance, "FAILED", "受管服务器实例缺少服务器配置");
            return;
        }
        List<String> logPaths = parseLogPaths(runtimeInstance.getLogPathsJson());
        if (logPaths.isEmpty()) {
            updateCollectSummary(runtimeInstance, "SKIPPED", "未配置日志路径");
            return;
        }
        int collectedLines = 0;
        for (String logPath : logPaths) {
            collectedLines += collectSinglePath(runtimeInstance, server, logPath);
        }
        updateCollectSummary(runtimeInstance, "SUCCESS", "本次共采集 " + collectedLines + " 行日志");
    }

    /**
     * 接收应用主动上报日志。
     */
    @Transactional
    public void ingestPushLogs(Long runtimeInstanceId, List<InternalObservabilityLogLineRequest> entries) {
        ProjectRuntimeInstanceEntity runtimeInstance = projectRuntimeInstanceRepository.findById(runtimeInstanceId)
                .orElseThrow(() -> new NoSuchElementException("项目运行实例不存在"));
        ProjectEntity project = runtimeInstance.getProject();
        ServerInfoEntity server = runtimeInstance.getServer();
        LocalDateTime now = LocalDateTime.now();
        List<ProjectRuntimeLogEntity> logs = new ArrayList<>();
        for (InternalObservabilityLogLineRequest entry : entries) {
            ParsedLogLine parsed = normalizePushLine(entry, now);
            ProjectRuntimeLogEntity entity = new ProjectRuntimeLogEntity();
            entity.setProject(project);
            entity.setRuntimeInstance(runtimeInstance);
            entity.setServer(server);
            entity.setSourceType(ProjectRuntimeLogEntity.SOURCE_TYPE_PUSH);
            entity.setSourcePath(limit(trimToNull(entry.sourcePath()), 500));
            entity.setLogLevel(limit(parsed.level(), 20));
            entity.setLogger(limit(parsed.logger(), 255));
            entity.setTraceId(limit(parsed.traceId(), 120));
            entity.setMessage(defaultString(parsed.message()));
            entity.setRaw(parsed.raw());
            entity.setLoggedAt(parsed.loggedAt());
            entity.setCollectedAt(now);
            logs.add(entity);
        }
        projectRuntimeLogRepository.saveAll(logs);
        updateCollectSummary(runtimeInstance, "SUCCESS", "主动上报接收 " + logs.size() + " 行日志");
    }

    /**
     * 删除过期热日志。
     */
    @Transactional
    public void cleanupExpiredLogs() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(observabilityProperties.getLogRetentionDays());
        projectRuntimeLogRepository.deleteAllByLoggedAtBefore(cutoff);
    }

    private int collectSinglePath(ProjectRuntimeInstanceEntity runtimeInstance, ServerInfoEntity server, String logPath) {
        ServerSshGateway.RemoteFileMetadata metadata = serverSshGateway.readFileMetadata(server, logPath);
        if (metadata.directory()) {
            throw new IllegalStateException("日志路径指向目录：" + logPath);
        }
        ProjectLogCursorEntity cursor = projectLogCursorRepository
                .findByRuntimeInstance_IdAndSourcePath(runtimeInstance.getId(), logPath)
                .orElseGet(() -> buildCursor(runtimeInstance, logPath));
        String currentHeadHash = readHeadHash(server, logPath, metadata.size());

        long offset = cursor.getByteOffset() == null ? 0L : cursor.getByteOffset();
        if (metadata.size() < offset || hasRotated(cursor, metadata, currentHeadHash)) {
            offset = 0L;
            cursor.setPendingText("");
        }

        int collectedLines = 0;
        while (offset < metadata.size()) {
            int requestBytes = (int) Math.min(observabilityProperties.getLogChunkBytes(), metadata.size() - offset);
            byte[] chunk = serverSshGateway.readFileChunk(server, logPath, offset, requestBytes);
            if (chunk.length == 0) {
                break;
            }
            offset += chunk.length;
            collectedLines += persistChunk(runtimeInstance, logPath, cursor, chunk);
            cursor.setByteOffset(offset);
            cursor.setLastFileSize(metadata.size());
            cursor.setLastModifiedEpochSeconds(metadata.modifiedAtEpochSecond());
            cursor.setLastHeadHash(currentHeadHash);
            projectLogCursorRepository.save(cursor);
        }
        return collectedLines;
    }

    private int persistChunk(ProjectRuntimeInstanceEntity runtimeInstance,
                             String logPath,
                             ProjectLogCursorEntity cursor,
                             byte[] chunk) {
        String mergedText = defaultString(cursor.getPendingText()) + new String(chunk, StandardCharsets.UTF_8);
        String normalized = mergedText.replace("\r\n", "\n").replace('\r', '\n');
        boolean endsWithBreak = normalized.endsWith("\n");
        String[] segments = normalized.split("\n", -1);
        int completeLineCount = endsWithBreak ? segments.length : Math.max(segments.length - 1, 0);
        LocalDateTime collectedAt = LocalDateTime.now();
        List<ProjectRuntimeLogEntity> logs = new ArrayList<>();
        for (int i = 0; i < completeLineCount; i++) {
            String line = segments[i];
            if (line == null || line.isEmpty()) {
                continue;
            }
            ParsedLogLine parsed = parseLine(line, collectedAt);
            ProjectRuntimeLogEntity entity = new ProjectRuntimeLogEntity();
            entity.setProject(runtimeInstance.getProject());
            entity.setRuntimeInstance(runtimeInstance);
            entity.setServer(runtimeInstance.getServer());
            entity.setSourceType(ProjectRuntimeLogEntity.SOURCE_TYPE_SSH);
            entity.setSourcePath(logPath);
            entity.setLogLevel(limit(parsed.level(), 20));
            entity.setLogger(limit(parsed.logger(), 255));
            entity.setTraceId(limit(parsed.traceId(), 120));
            entity.setMessage(defaultString(parsed.message()));
            entity.setRaw(parsed.raw());
            entity.setLoggedAt(parsed.loggedAt());
            entity.setCollectedAt(collectedAt);
            logs.add(entity);
        }
        cursor.setPendingText(endsWithBreak ? "" : segments[segments.length - 1]);
        if (!logs.isEmpty()) {
            projectRuntimeLogRepository.saveAll(logs);
        }
        return logs.size();
    }

    private ProjectLogCursorEntity buildCursor(ProjectRuntimeInstanceEntity runtimeInstance, String logPath) {
        ProjectLogCursorEntity cursor = new ProjectLogCursorEntity();
        cursor.setRuntimeInstance(runtimeInstance);
        cursor.setSourcePath(logPath);
        cursor.setByteOffset(0L);
        cursor.setPendingText("");
        return cursor;
    }

    private ParsedLogLine normalizePushLine(InternalObservabilityLogLineRequest entry, LocalDateTime fallbackTime) {
        return new ParsedLogLine(
                trimToNull(entry.level()),
                trimToNull(entry.logger()),
                trimToNull(entry.traceId()),
                trimToNull(entry.message()) == null ? defaultString(entry.raw()) : entry.message().trim(),
                trimToNull(entry.raw()),
                parseTimestamp(trimToNull(entry.timestamp()), fallbackTime)
        );
    }

    private ParsedLogLine parseLine(String line, LocalDateTime fallbackTime) {
        String trimmed = line == null ? "" : line.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                JsonNode jsonNode = objectMapper.readTree(trimmed);
                if (jsonNode.isObject()) {
                    String message = firstText(
                            readText(jsonNode, "message"),
                            readText(jsonNode, "msg"),
                            trimmed
                    );
                    return new ParsedLogLine(
                            firstText(readText(jsonNode, "level"), readText(jsonNode, "logLevel")),
                            firstText(readText(jsonNode, "logger"), readText(jsonNode, "loggerName")),
                            firstText(readText(jsonNode, "traceId"), readText(jsonNode, "trace_id")),
                            message,
                            trimmed,
                            parseTimestamp(firstText(
                                    readText(jsonNode, "timestamp"),
                                    readText(jsonNode, "@timestamp"),
                                    readText(jsonNode, "time"),
                                    readText(jsonNode, "loggedAt")
                            ), fallbackTime)
                    );
                }
            } catch (Exception ignored) {
                // 结构化解析失败时回退为原始行。
            }
        }
        return new ParsedLogLine(null, null, null, trimmed, trimmed, fallbackTime);
    }

    private LocalDateTime parseTimestamp(String timestamp, LocalDateTime fallbackTime) {
        if (timestamp == null || timestamp.isBlank()) {
            return fallbackTime;
        }
        try {
            if (timestamp.matches("^\\d{13}$")) {
                return LocalDateTime.ofInstant(Instant.ofEpochMilli(Long.parseLong(timestamp)), ZoneId.systemDefault());
            }
            if (timestamp.matches("^\\d{10}$")) {
                return LocalDateTime.ofInstant(Instant.ofEpochSecond(Long.parseLong(timestamp)), ZoneId.systemDefault());
            }
            return OffsetDateTime.parse(timestamp).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            // 继续尝试本地时间格式。
        }
        for (DateTimeFormatter formatter : List.of(
                DateTimeFormatter.ISO_LOCAL_DATE_TIME,
                DISPLAY_TIME_FORMATTER,
                DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS")
        )) {
            try {
                return LocalDateTime.parse(timestamp, formatter);
            } catch (DateTimeParseException ignored) {
                // 尝试下一个格式。
            }
        }
        return fallbackTime;
    }

    private List<String> parseLogPaths(String logPathsJson) {
        String normalized = trimToNull(logPathsJson);
        if (normalized == null) {
            return List.of();
        }
        try {
            return objectMapper.readValue(normalized, new TypeReference<>() {
            });
        } catch (Exception exception) {
            return List.of();
        }
    }

    private String readText(JsonNode jsonNode, String fieldName) {
        JsonNode field = jsonNode.get(fieldName);
        return field == null || field.isNull() ? null : trimToNull(field.asText());
    }

    private void updateCollectSummary(ProjectRuntimeInstanceEntity runtimeInstance, String status, String message) {
        runtimeInstance.setLastLogCollectedAt(LocalDateTime.now());
        runtimeInstance.setLastLogCollectStatus(limit(trimToNull(status), 30));
        runtimeInstance.setLastLogCollectMessage(limit(defaultString(message), 500));
        projectRuntimeInstanceRepository.save(runtimeInstance);
    }

    private boolean hasRotated(ProjectLogCursorEntity cursor,
                               ServerSshGateway.RemoteFileMetadata metadata,
                               String currentHeadHash) {
        if (cursor.getByteOffset() == null || cursor.getByteOffset() <= 0L) {
            return false;
        }
        if (cursor.getLastHeadHash() == null || currentHeadHash == null) {
            return false;
        }
        if (cursor.getLastModifiedEpochSeconds() == null || metadata.modifiedAtEpochSecond() == cursor.getLastModifiedEpochSeconds()) {
            return false;
        }
        return !cursor.getLastHeadHash().equals(currentHeadHash);
    }

    private String readHeadHash(ServerInfoEntity server, String logPath, long fileSize) {
        if (fileSize <= 0L) {
            return null;
        }
        byte[] header = serverSshGateway.readFileChunk(server, logPath, 0L, (int) Math.min(FILE_HEAD_SIGNATURE_BYTES, fileSize));
        if (header.length == 0) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(header);
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("日志文件头哈希计算失败", exception);
        }
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    /**
     * 归一化后的日志行。
     */
    private record ParsedLogLine(
            String level,
            String logger,
            String traceId,
            String message,
            String raw,
            LocalDateTime loggedAt
    ) {
    }
}
