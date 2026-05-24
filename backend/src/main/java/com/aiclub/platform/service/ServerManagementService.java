package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerAlertStateEntity;
import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.domain.model.ServerMetricSampleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ServerAlertConfigView;
import com.aiclub.platform.dto.ServerAlertStateItem;
import com.aiclub.platform.dto.ServerDetail;
import com.aiclub.platform.dto.ServerMetricSampleItem;
import com.aiclub.platform.dto.ServerSummary;
import com.aiclub.platform.dto.ServerTerminalSessionCreated;
import com.aiclub.platform.dto.UserOptionSummary;
import com.aiclub.platform.dto.request.ServerAlertConfigUpdateRequest;
import com.aiclub.platform.dto.request.ServerRequest;
import com.aiclub.platform.dto.request.ServerTerminalSessionCreateRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.ServerInfoRepository;
import com.aiclub.platform.repository.ServerMetricSampleRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

/**
 * 服务器管理核心业务服务。
 */
@Service
@Transactional(readOnly = true)
public class ServerManagementService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int METRIC_HISTORY_HOURS = 24;

    private final ServerInfoRepository serverInfoRepository;
    private final ServerMetricSampleRepository serverMetricSampleRepository;
    private final UserRepository userRepository;
    private final TokenCipherService tokenCipherService;
    private final ServerModuleGateService serverModuleGateService;
    private final ServerAlertSettingsService serverAlertSettingsService;
    private final ServerAlertService serverAlertService;
    private final ServerSshGateway serverSshGateway;
    private final ServerTerminalSessionManager serverTerminalSessionManager;

    public ServerManagementService(ServerInfoRepository serverInfoRepository,
                                   ServerMetricSampleRepository serverMetricSampleRepository,
                                   UserRepository userRepository,
                                   TokenCipherService tokenCipherService,
                                   ServerModuleGateService serverModuleGateService,
                                   ServerAlertSettingsService serverAlertSettingsService,
                                   ServerAlertService serverAlertService,
                                   ServerSshGateway serverSshGateway,
                                   ServerTerminalSessionManager serverTerminalSessionManager) {
        this.serverInfoRepository = serverInfoRepository;
        this.serverMetricSampleRepository = serverMetricSampleRepository;
        this.userRepository = userRepository;
        this.tokenCipherService = tokenCipherService;
        this.serverModuleGateService = serverModuleGateService;
        this.serverAlertSettingsService = serverAlertSettingsService;
        this.serverAlertService = serverAlertService;
        this.serverSshGateway = serverSshGateway;
        this.serverTerminalSessionManager = serverTerminalSessionManager;
    }

    public PageResponse<ServerSummary> pageServers(int page, int size, String keyword, Boolean enabled) {
        serverModuleGateService.requireEnabled();
        Pageable pageable = PageRequest.of(Math.max(page, 1) - 1, Math.max(1, Math.min(size, 50)), Sort.by(Sort.Direction.ASC, "id"));
        Page<ServerSummary> pageData = serverInfoRepository.findAll(serverSpecification(keyword, enabled), pageable)
                .map(this::toServerSummary);
        return PageResponse.from(pageData);
    }

    public ServerDetail getServer(Long id) {
        serverModuleGateService.requireEnabled();
        ServerInfoEntity entity = requireServer(id);
        ServerAlertConfigView effectiveAlertConfig = serverAlertSettingsService.toView(entity);
        List<ServerAlertStateItem> alertStates = serverAlertService.listStates(id).stream()
                .map(this::toAlertStateItem)
                .toList();
        return new ServerDetail(
                entity.getId(),
                entity.getName(),
                entity.getDescription(),
                entity.getHost(),
                entity.getPort(),
                entity.getUsername(),
                entity.getOsType(),
                entity.getAuthType(),
                Boolean.TRUE.equals(entity.getEnabled()),
                entity.isJumpHostEnabled(),
                entity.getJumpHost(),
                entity.getJumpPort(),
                entity.getJumpUsername(),
                entity.getJumpAuthType(),
                hasText(entity.getPasswordCiphertext()),
                hasText(entity.getPrivateKeyCiphertext()),
                hasText(entity.getJumpPasswordCiphertext()),
                hasText(entity.getJumpPrivateKeyCiphertext()),
                entity.getLastProbeStatus(),
                entity.getLastProbeMessage(),
                formatTime(entity.getLastProbedAt()),
                entity.getLastCpuUsagePercent(),
                entity.getLastMemoryUsagePercent(),
                entity.getLastDiskUsagePercent(),
                entity.getActiveAlertCount(),
                effectiveAlertConfig,
                alertStates
        );
    }

    @Transactional
    public ServerDetail createServer(ServerRequest request) {
        serverModuleGateService.requireEnabled();
        ServerInfoEntity entity = new ServerInfoEntity();
        fillServerEntity(entity, request, true);
        return getServer(serverInfoRepository.save(entity).getId());
    }

    @Transactional
    public ServerDetail updateServer(Long id, ServerRequest request) {
        serverModuleGateService.requireEnabled();
        ServerInfoEntity entity = requireServer(id);
        fillServerEntity(entity, request, false);
        return getServer(serverInfoRepository.save(entity).getId());
    }

    @Transactional
    public void deleteServer(Long id) {
        serverModuleGateService.requireEnabled();
        ServerInfoEntity entity = requireServer(id);
        serverTerminalSessionManager.closeSessionsForServer(id, ServerTerminalSessionManager.REASON_SERVER_DELETED);
        serverInfoRepository.delete(entity);
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public ServerSummary testConnection(Long id) {
        serverModuleGateService.requireEnabled();
        ServerInfoEntity entity = requireServer(id);
        try {
            ServerSshGateway.ServerProbeSnapshot snapshot = serverSshGateway.probe(entity);
            applyProbeSuccess(entity, snapshot, "手动测试成功");
        } catch (RuntimeException exception) {
            applyProbeFailure(entity, exception.getMessage());
            throw exception;
        }
        return toServerSummary(serverInfoRepository.save(entity));
    }

    public List<ServerMetricSampleItem> listMetricsHistory(Long id) {
        serverModuleGateService.requireEnabled();
        requireServer(id);
        LocalDateTime cutoff = LocalDateTime.now().minusHours(METRIC_HISTORY_HOURS);
        List<ServerMetricSampleEntity> rawSamples = serverMetricSampleRepository.findAllByServer_IdAndSampledAtAfterOrderBySampledAtAsc(id, cutoff);
        boolean hasMeaningfulSample = rawSamples.stream().anyMatch(this::hasMeaningfulMetricValue);
        return rawSamples.stream()
                .filter(sample -> !hasMeaningfulSample || !isLegacyZeroOnlySuccessSample(sample))
                .map(this::toMetricSampleItem)
                .toList();
    }

    @Transactional
    public ServerDetail updateAlertConfig(Long id, ServerAlertConfigUpdateRequest request) {
        serverModuleGateService.requireEnabled();
        ServerInfoEntity entity = requireServer(id);
        entity.setConnectivityAlertEnabledOverride(request.connectivityAlertEnabledOverride());
        entity.setCpuThresholdPercentOverride(request.cpuThresholdPercentOverride());
        entity.setMemoryThresholdPercentOverride(request.memoryThresholdPercentOverride());
        entity.setDiskThresholdPercentOverride(request.diskThresholdPercentOverride());
        entity.setConsecutiveBreachesOverride(request.consecutiveBreachesOverride());
        entity.setCooldownMinutesOverride(request.cooldownMinutesOverride());
        entity.setAlertRecipients(resolveRecipients(request.recipientUserIds()));
        serverInfoRepository.save(entity);
        return getServer(id);
    }

    @Transactional
    public ServerTerminalSessionCreated createTerminalSession(Long serverId,
                                                             ServerTerminalSessionCreateRequest request,
                                                             String sourceIp) {
        serverModuleGateService.requireEnabled();
        if (!currentUserHasPermission("server:terminal")) {
            throw new UnauthorizedException("无权连接服务器终端");
        }
        ServerInfoEntity server = requireServer(serverId);
        int cols = request == null || request.cols() == null ? 120 : request.cols();
        int rows = request == null || request.rows() == null ? 36 : request.rows();
        String sessionId = UUID.randomUUID().toString().replace("-", "");
        serverTerminalSessionManager.createPendingSession(sessionId, server, requireCurrentUser(), sourceIp, cols, rows);
        return new ServerTerminalSessionCreated(sessionId, cols, rows);
    }

    @Transactional
    public void closeTerminalSession(String sessionId) {
        serverModuleGateService.requireEnabled();
        serverTerminalSessionManager.closeOwnedSession(sessionId, requireCurrentUserId(), ServerTerminalSessionManager.REASON_CLIENT_CLOSED);
    }

    @Transactional
    public void recordScheduledProbeSuccess(ServerInfoEntity entity, ServerSshGateway.ServerProbeSnapshot snapshot) {
        applyProbeSuccess(entity, snapshot, snapshot.summary());
        serverInfoRepository.save(entity);
    }

    @Transactional
    public void recordScheduledProbeFailure(ServerInfoEntity entity, String message) {
        applyProbeFailure(entity, message);
        serverInfoRepository.save(entity);
    }

    private void applyProbeSuccess(ServerInfoEntity entity, ServerSshGateway.ServerProbeSnapshot snapshot, String message) {
        entity.setLastProbeStatus("SUCCESS");
        entity.setLastProbeMessage(limitMessage(message));
        entity.setLastProbedAt(LocalDateTime.now());
        entity.setLastCpuUsagePercent(snapshot.cpuUsagePercent());
        entity.setLastMemoryUsagePercent(snapshot.memoryUsagePercent());
        entity.setLastDiskUsagePercent(snapshot.diskUsagePercent());
        saveMetricSample(entity, "SUCCESS", message, snapshot.cpuUsagePercent(), snapshot.memoryUsagePercent(), snapshot.diskUsagePercent());
        serverAlertService.handleProbeSuccess(entity, snapshot);
    }

    private void applyProbeFailure(ServerInfoEntity entity, String message) {
        entity.setLastProbeStatus("FAILED");
        entity.setLastProbeMessage(limitMessage(message));
        entity.setLastProbedAt(LocalDateTime.now());
        saveMetricSample(entity, "FAILED", message, null, null, null);
        serverAlertService.handleProbeFailure(entity, message);
    }

    private void saveMetricSample(ServerInfoEntity entity,
                                  String probeStatus,
                                  String probeMessage,
                                  Integer cpuUsagePercent,
                                  Integer memoryUsagePercent,
                                  Integer diskUsagePercent) {
        ServerMetricSampleEntity sample = new ServerMetricSampleEntity();
        sample.setServer(entity);
        sample.setProbeStatus(probeStatus);
        sample.setProbeMessage(limitMessage(probeMessage));
        sample.setCpuUsagePercent(cpuUsagePercent);
        sample.setMemoryUsagePercent(memoryUsagePercent);
        sample.setDiskUsagePercent(diskUsagePercent);
        sample.setSampledAt(LocalDateTime.now());
        serverMetricSampleRepository.save(sample);
    }

    private Specification<ServerInfoEntity> serverSpecification(String keyword, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("host")), pattern),
                        cb.like(cb.lower(root.get("username")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private ServerInfoEntity requireServer(Long id) {
        return serverInfoRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("服务器不存在: " + id));
    }

    private void fillServerEntity(ServerInfoEntity entity, ServerRequest request, boolean creating) {
        entity.setName(requireText(request.name(), "服务器名称不能为空"));
        entity.setDescription(defaultString(request.description()));
        entity.setHost(requireText(request.host(), "服务器地址不能为空"));
        entity.setPort(requirePort(request.port(), "SSH 端口不能为空"));
        entity.setUsername(requireText(request.username(), "SSH 用户名不能为空"));
        entity.setOsType(normalizeOsType(request.osType()));
        String previousAuthType = entity.getAuthType();
        entity.setAuthType(normalizeAuthType(request.authType()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        fillPrimaryAuth(entity, request, creating, previousAuthType);
        fillJumpAuth(entity, request, creating, entity.getJumpAuthType());
        entity.setConnectivityAlertEnabledOverride(request.connectivityAlertEnabledOverride());
        entity.setCpuThresholdPercentOverride(request.cpuThresholdPercentOverride());
        entity.setMemoryThresholdPercentOverride(request.memoryThresholdPercentOverride());
        entity.setDiskThresholdPercentOverride(request.diskThresholdPercentOverride());
        entity.setConsecutiveBreachesOverride(request.consecutiveBreachesOverride());
        entity.setCooldownMinutesOverride(request.cooldownMinutesOverride());
        entity.setAlertRecipients(resolveRecipients(request.recipientUserIds()));
    }

    private void fillPrimaryAuth(ServerInfoEntity entity, ServerRequest request, boolean creating, String previousAuthType) {
        if (ServerInfoEntity.AUTH_TYPE_PASSWORD.equals(entity.getAuthType())) {
            entity.setPasswordCiphertext(resolveCiphertextForSave(
                    entity.getPasswordCiphertext(),
                    request.password(),
                    creating,
                    "服务器密码不能为空"
            ));
            entity.setPrivateKeyCiphertext(null);
            entity.setPrivateKeyPassphraseCiphertext(null);
            return;
        }
        entity.setPrivateKeyCiphertext(resolveCiphertextForSave(
                ServerInfoEntity.AUTH_TYPE_PRIVATE_KEY.equals(previousAuthType) ? entity.getPrivateKeyCiphertext() : null,
                request.privateKey(),
                creating,
                "服务器私钥不能为空"
        ));
        String passphrase = trimToNull(request.privateKeyPassphrase());
        if (passphrase != null) {
            entity.setPrivateKeyPassphraseCiphertext(tokenCipherService.encrypt(passphrase));
        } else if (!creating && ServerInfoEntity.AUTH_TYPE_PRIVATE_KEY.equals(previousAuthType)) {
            // 保持原私钥口令密文，不重复加密或回显。
        } else {
            entity.setPrivateKeyPassphraseCiphertext(null);
        }
        entity.setPasswordCiphertext(null);
    }

    private void fillJumpAuth(ServerInfoEntity entity, ServerRequest request, boolean creating, String previousJumpAuthType) {
        boolean jumpEnabled = Boolean.TRUE.equals(request.jumpHostEnabled());
        entity.setJumpHostEnabled(jumpEnabled);
        if (!jumpEnabled) {
            entity.setJumpHost(null);
            entity.setJumpPort(null);
            entity.setJumpUsername(null);
            entity.setJumpAuthType(null);
            entity.setJumpPasswordCiphertext(null);
            entity.setJumpPrivateKeyCiphertext(null);
            entity.setJumpPrivateKeyPassphraseCiphertext(null);
            return;
        }
        entity.setJumpHost(requireText(request.jumpHost(), "跳板机地址不能为空"));
        entity.setJumpPort(requirePort(request.jumpPort() == null ? 22 : request.jumpPort(), "跳板机端口不能为空"));
        entity.setJumpUsername(requireText(request.jumpUsername(), "跳板机用户名不能为空"));
        String jumpAuthType = normalizeAuthType(request.jumpAuthType());
        entity.setJumpAuthType(jumpAuthType);
        if (ServerInfoEntity.AUTH_TYPE_PASSWORD.equals(jumpAuthType)) {
            entity.setJumpPasswordCiphertext(resolveCiphertextForSave(
                    ServerInfoEntity.AUTH_TYPE_PASSWORD.equals(previousJumpAuthType) ? entity.getJumpPasswordCiphertext() : null,
                    request.jumpPassword(),
                    creating,
                    "跳板机密码不能为空"
            ));
            entity.setJumpPrivateKeyCiphertext(null);
            entity.setJumpPrivateKeyPassphraseCiphertext(null);
            return;
        }
        entity.setJumpPrivateKeyCiphertext(resolveCiphertextForSave(
                ServerInfoEntity.AUTH_TYPE_PRIVATE_KEY.equals(previousJumpAuthType) ? entity.getJumpPrivateKeyCiphertext() : null,
                request.jumpPrivateKey(),
                creating,
                "跳板机私钥不能为空"
        ));
        String passphrase = trimToNull(request.jumpPrivateKeyPassphrase());
        if (passphrase != null) {
            entity.setJumpPrivateKeyPassphraseCiphertext(tokenCipherService.encrypt(passphrase));
        } else if (!creating && ServerInfoEntity.AUTH_TYPE_PRIVATE_KEY.equals(previousJumpAuthType)) {
            // 保持原跳板机私钥口令密文。
        } else {
            entity.setJumpPrivateKeyPassphraseCiphertext(null);
        }
        entity.setJumpPasswordCiphertext(null);
    }

    private Set<UserEntity> resolveRecipients(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return new LinkedHashSet<>();
        }
        LinkedHashMap<Long, Long> distinct = new LinkedHashMap<>();
        for (Long userId : userIds) {
            if (userId != null) {
                distinct.put(userId, userId);
            }
        }
        Map<Long, UserEntity> userMap = new LinkedHashMap<>();
        for (UserEntity user : userRepository.findAllById(distinct.keySet())) {
            if (user.isEnabled()) {
                userMap.put(user.getId(), user);
            }
        }
        LinkedHashSet<UserEntity> recipients = new LinkedHashSet<>();
        for (Long userId : distinct.keySet()) {
            UserEntity user = userMap.get(userId);
            if (user == null) {
                throw new IllegalArgumentException("通知人不存在或已停用: " + userId);
            }
            recipients.add(user);
        }
        return recipients;
    }

    private ServerSummary toServerSummary(ServerInfoEntity entity) {
        return new ServerSummary(
                entity.getId(),
                entity.getName(),
                entity.getDescription(),
                entity.getHost(),
                entity.getPort(),
                entity.getUsername(),
                entity.getOsType(),
                entity.getAuthType(),
                Boolean.TRUE.equals(entity.getEnabled()),
                entity.isJumpHostEnabled(),
                hasText(entity.getPasswordCiphertext()),
                hasText(entity.getPrivateKeyCiphertext()),
                hasText(entity.getJumpPasswordCiphertext()),
                hasText(entity.getJumpPrivateKeyCiphertext()),
                entity.getLastProbeStatus(),
                entity.getLastProbeMessage(),
                formatTime(entity.getLastProbedAt()),
                entity.getLastCpuUsagePercent(),
                entity.getLastMemoryUsagePercent(),
                entity.getLastDiskUsagePercent(),
                entity.getActiveAlertCount()
        );
    }

    private ServerAlertStateItem toAlertStateItem(ServerAlertStateEntity entity) {
        return new ServerAlertStateItem(
                entity.getAlertCode(),
                entity.getAlertName(),
                entity.isActive(),
                entity.getLastObservedValue(),
                entity.getConsecutiveBreachCount(),
                formatTime(entity.getLastNotifiedAt()),
                formatTime(entity.getLastTriggeredAt()),
                formatTime(entity.getLastRecoveredAt()),
                entity.getLastMessage()
        );
    }

    private ServerMetricSampleItem toMetricSampleItem(ServerMetricSampleEntity entity) {
        return new ServerMetricSampleItem(
                entity.getProbeStatus(),
                entity.getProbeMessage(),
                entity.getCpuUsagePercent(),
                entity.getMemoryUsagePercent(),
                entity.getDiskUsagePercent(),
                formatTime(entity.getSampledAt())
        );
    }

    private boolean hasMeaningfulMetricValue(ServerMetricSampleEntity sample) {
        return positive(sample.getCpuUsagePercent()) || positive(sample.getMemoryUsagePercent()) || positive(sample.getDiskUsagePercent());
    }

    private boolean isLegacyZeroOnlySuccessSample(ServerMetricSampleEntity sample) {
        return "SUCCESS".equalsIgnoreCase(sample.getProbeStatus())
                && !positive(sample.getCpuUsagePercent())
                && !positive(sample.getMemoryUsagePercent())
                && !positive(sample.getDiskUsagePercent());
    }

    private String resolveCiphertextForSave(String existingCiphertext, String requestedValue, boolean creating, String blankMessage) {
        String normalized = trimToNull(requestedValue);
        if (normalized != null) {
            return tokenCipherService.encrypt(normalized);
        }
        if (!creating && hasText(existingCiphertext)) {
            return existingCiphertext;
        }
        throw new IllegalArgumentException(blankMessage);
    }

    private String normalizeOsType(String osType) {
        String normalized = requireText(osType, "操作系统类型不能为空").toUpperCase();
        if (!ServerInfoEntity.OS_TYPE_LINUX.equals(normalized)) {
            throw new IllegalArgumentException("第一版仅支持 Linux 服务器");
        }
        return normalized;
    }

    private String normalizeAuthType(String authType) {
        String normalized = requireText(authType, "认证方式不能为空").toUpperCase();
        if (!ServerInfoEntity.AUTH_TYPE_PASSWORD.equals(normalized) && !ServerInfoEntity.AUTH_TYPE_PRIVATE_KEY.equals(normalized)) {
            throw new IllegalArgumentException("认证方式仅支持 PASSWORD 或 PRIVATE_KEY");
        }
        return normalized;
    }

    private Integer requirePort(Integer port, String message) {
        if (port == null || port < 1 || port > 65535) {
            throw new IllegalArgumentException(message);
        }
        return port;
    }

    private String requireText(String value, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException(message);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private boolean positive(Integer value) {
        return value != null && value > 0;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private Long requireCurrentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId).orElseThrow(() -> new UnauthorizedException("Not logged in"));
    }

    private UserEntity requireCurrentUser() {
        return userRepository.findById(requireCurrentUserId())
                .orElseThrow(() -> new UnauthorizedException("当前用户不存在"));
    }

    private boolean currentUserHasPermission(String permissionCode) {
        return AuthContextHolder.get().map(authContext -> authContext.hasPermission(permissionCode)).orElse(false);
    }

    private String limitMessage(String message) {
        if (message == null) {
            return "";
        }
        String normalized = message.trim();
        return normalized.length() <= 500 ? normalized : normalized.substring(0, 500);
    }
}
