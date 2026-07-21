package com.aiclub.platform.service;

import com.aiclub.platform.config.GitPilotCliProperties;
import com.aiclub.platform.domain.model.GitPilotCliAccessTokenEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.cli.CliDtos;
import com.aiclub.platform.dto.cli.CliDtos.CliModelSummary;
import com.aiclub.platform.dto.cli.CliDtos.CliTokenResponse;
import com.aiclub.platform.dto.cli.CliDtos.ModelSessionResponse;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.GitPilotCliAccessTokenRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * GitPilot CLI 设备授权、CLI Token 和短期模型 session 服务。
 * 业务意图：CLI 凭据与浏览器登录态、模型上游密钥完全分离，所有短期凭据都可撤销和过期。
 */
@Service
public class GitPilotCliService {

    public static final String SCOPE_MODEL_READ = "cli:model:read";
    public static final String SCOPE_MODEL_INVOKE = "cli:model:invoke";
    private static final String CLI_TOKEN_PREFIX = "gpt_";
    private static final String MODEL_SESSION_PREFIX = "gms_";
    private static final String DEVICE_KEY_PREFIX = "gitpilot:cli:device:";
    private static final String USER_CODE_KEY_PREFIX = "gitpilot:cli:user-code:";
    private static final String MODEL_KEY_PREFIX = "gitpilot:cli:model-session:";

    private final GitPilotCliProperties properties;
    private final GitPilotCliAccessTokenRepository accessTokenRepository;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final AuthService authService;
    private final ModelConfigService modelConfigService;

    public GitPilotCliService(GitPilotCliProperties properties,
                              GitPilotCliAccessTokenRepository accessTokenRepository,
                              StringRedisTemplate redis,
                              ObjectMapper objectMapper,
                              AuthService authService,
                              ModelConfigService modelConfigService) {
        this.properties = properties;
        this.accessTokenRepository = accessTokenRepository;
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.authService = authService;
        this.modelConfigService = modelConfigService;
    }

    /** 创建一次性设备码，CLI 不需要先登录即可调用。 */
    public CliDtos.DeviceAuthorizationResponse createDeviceAuthorization(String clientVersion) {
        requireEnabled();
        String deviceCode = "gpd_" + randomToken(24);
        String userCode = randomUserCode();
        DeviceState state = new DeviceState(userCode, clientVersion == null ? "" : clientVersion.trim(), null, Instant.now().plusSeconds(properties.deviceCodeTtlSeconds()).toEpochMilli());
        saveJson(DEVICE_KEY_PREFIX + deviceCode, state, properties.deviceCodeTtlSeconds());
        redis.opsForValue().set(USER_CODE_KEY_PREFIX + userCode, deviceCode, Duration.ofSeconds(properties.deviceCodeTtlSeconds()));
        String baseUrl = properties.publicBaseUrl().isBlank() ? "http://localhost:3000" : properties.publicBaseUrl();
        return new CliDtos.DeviceAuthorizationResponse(
                deviceCode,
                userCode,
                baseUrl + "/cli/device?user_code=" + userCode,
                properties.deviceCodeTtlSeconds(),
                properties.pollIntervalSeconds()
        );
    }

    /** 浏览器确认设备授权，只使用当前浏览器登录用户身份。 */
    public void approveDevice(String userCode) {
        requireEnabled();
        Long userId = AuthContextHolder.get().orElseThrow(() -> new UnauthorizedException("Not logged in")).userId();
        String normalizedCode = normalizeUserCode(userCode);
        String deviceCode = redis.opsForValue().get(USER_CODE_KEY_PREFIX + normalizedCode);
        if (deviceCode == null || deviceCode.isBlank()) throw new IllegalArgumentException("设备验证码已过期");
        String raw = redis.opsForValue().get(DEVICE_KEY_PREFIX + deviceCode);
        DeviceState state = readJson(raw, DeviceState.class);
        if (state.expiresAtEpochMillis() < Instant.now().toEpochMilli()) throw new IllegalArgumentException("设备验证码已过期");
        saveJson(DEVICE_KEY_PREFIX + deviceCode, new DeviceState(state.userCode(), state.clientVersion(), userId, state.expiresAtEpochMillis()), properties.deviceCodeTtlSeconds());
    }

    /** 轮询设备授权状态；pending 使用 428 由控制器映射，避免 CLI 把 pending 当成成功数据。 */
    @Transactional
    public DeviceTokenPoll pollDeviceToken(String deviceCode) {
        requireEnabled();
        String raw = redis.opsForValue().get(DEVICE_KEY_PREFIX + trim(deviceCode));
        if (raw == null || raw.isBlank()) return new DeviceTokenPoll(DeviceTokenStatus.EXPIRED, null);
        DeviceState state = readJson(raw, DeviceState.class);
        if (state.expiresAtEpochMillis() < Instant.now().toEpochMilli()) return new DeviceTokenPoll(DeviceTokenStatus.EXPIRED, null);
        if (state.userId() == null) return new DeviceTokenPoll(DeviceTokenStatus.PENDING, null);
        String token = CLI_TOKEN_PREFIX + randomToken(40);
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(properties.tokenTtlDays());
        GitPilotCliAccessTokenEntity entity = new GitPilotCliAccessTokenEntity();
        entity.setUserId(state.userId());
        entity.setTokenHash(hash(token));
        entity.setTokenPrefix(token.substring(0, Math.min(16, token.length())));
        entity.setScopesJson(writeJson(List.of(SCOPE_MODEL_READ, SCOPE_MODEL_INVOKE)));
        entity.setClientVersion(state.clientVersion());
        entity.setExpiresAt(expiresAt);
        accessTokenRepository.save(entity);
        redis.delete(DEVICE_KEY_PREFIX + trim(deviceCode));
        redis.delete(USER_CODE_KEY_PREFIX + state.userCode());
        CurrentUserInfo user = authService.currentUserById(state.userId());
        return new DeviceTokenPoll(DeviceTokenStatus.APPROVED, new CliTokenResponse(token, expiresAt.toString(), user, List.of(SCOPE_MODEL_READ, SCOPE_MODEL_INVOKE)));
    }

    /** 校验 CLI Token 并按数据库最新权限构造 AuthContext。 */
    public AuthContext authenticateCliToken(String token) {
        GitPilotCliAccessTokenEntity entity = accessTokenRepository.findByTokenHash(hash(trim(token)))
                .orElseThrow(() -> new UnauthorizedException("CLI Token 无效或已撤销"));
        if (entity.getRevokedAt() != null || entity.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new UnauthorizedException("CLI Token 已过期或已撤销");
        }
        entity.setLastUsedAt(LocalDateTime.now());
        accessTokenRepository.save(entity);
        return authService.authenticateUserToken(entity.getUserId(), trim(token));
    }

    public void requireScope(String token, String scope) {
        GitPilotCliAccessTokenEntity entity = accessTokenRepository.findByTokenHash(hash(trim(token)))
                .orElseThrow(() -> new UnauthorizedException("CLI Token 无效"));
        if (entity.getRevokedAt() != null || entity.getExpiresAt().isBefore(LocalDateTime.now())) throw new UnauthorizedException("CLI Token 已过期或已撤销");
        List<String> scopes = readJson(entity.getScopesJson(), new TypeReference<>() {});
        if (!scopes.contains(scope)) throw new com.aiclub.platform.exception.ForbiddenException("CLI Token 缺少 scope: " + scope);
    }

    /** 撤销当前 CLI Token，幂等处理重复退出。 */
    @Transactional
    public void revoke(String token) {
        if (token == null || token.isBlank()) return;
        accessTokenRepository.findByTokenHash(hash(trim(token))).ifPresent(entity -> {
            entity.setRevokedAt(LocalDateTime.now());
            accessTokenRepository.save(entity);
        });
    }

    /** 返回启用的 CHAT 模型，API Key、Base URL 和数据库密文均不出服务端。 */
    public List<CliModelSummary> listModels() {
        return modelConfigService.listEnabledOptions(ModelConfigService.MODEL_TYPE_CHAT).stream()
                .filter(item -> Boolean.TRUE.equals(item.enabled()))
                .filter(item -> "OPENAI".equalsIgnoreCase(item.provider()) || "ANTHROPIC".equalsIgnoreCase(item.provider()))
                .map(item -> new CliModelSummary(item.id(), item.name(), item.provider(), item.modelName(), item.description(), item.openaiApiMode()))
                .toList();
    }

    /** 为当前 CLI 用户签发只允许调用指定模型的短期凭据。 */
    public ModelSessionResponse createModelSession(Long modelConfigId, String clientVersion, String proxyBaseUrl) {
        requireEnabled();
        AuthContext current = AuthContextHolder.get().orElseThrow(() -> new UnauthorizedException("Not logged in"));
        requireScope(current.token(), SCOPE_MODEL_INVOKE);
        var summary = modelConfigService.getConfig(modelConfigId);
        if (!Boolean.TRUE.equals(summary.enabled()) || !ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(summary.modelType())) throw new IllegalArgumentException("模型未启用或不是 CHAT 模型");
        if (!"OPENAI".equalsIgnoreCase(summary.provider()) && !"ANTHROPIC".equalsIgnoreCase(summary.provider())) throw new IllegalArgumentException("CLI 暂不支持该模型 provider");
        // 提前解密校验配置，避免返回一个之后必然失败的 session。
        modelConfigService.resolveModelConfig(modelConfigId);
        String sessionId = UUID.randomUUID().toString().replace("-", "");
        String token = MODEL_SESSION_PREFIX + randomToken(40);
        Instant expiresAt = Instant.now().plusSeconds(properties.modelSessionTtlSeconds());
        ModelSessionState state = new ModelSessionState(sessionId, current.userId(), modelConfigId, expiresAt.toEpochMilli());
        saveJson(MODEL_KEY_PREFIX + token, state, properties.modelSessionTtlSeconds());
        return new ModelSessionResponse(sessionId, token, expiresAt.toString(), summary.provider(), summary.modelName(), trim(proxyBaseUrl) + "/" + sessionId);
    }

    /** 认证模型代理请求，并返回绑定的模型配置。 */
    public ModelSessionState requireModelSession(String sessionId, String token) {
        ModelSessionState state = readJson(redis.opsForValue().get(MODEL_KEY_PREFIX + trim(token)), ModelSessionState.class);
        if (state.expiresAtEpochMillis() < Instant.now().toEpochMilli() || !state.sessionId().equals(sessionId)) throw new UnauthorizedException("模型 session 已过期或不匹配");
        return state;
    }

    public AuthContext authenticateModelSession(String token) {
        ModelSessionState state = readJson(redis.opsForValue().get(MODEL_KEY_PREFIX + trim(token)), ModelSessionState.class);
        if (state.expiresAtEpochMillis() < Instant.now().toEpochMilli()) throw new UnauthorizedException("模型 session 已过期");
        return authService.authenticateUserToken(state.userId(), trim(token));
    }

    /** 返回当前 CLI 用户的最新资料，供设备端状态命令使用。 */
    public CurrentUserInfo currentUser(Long userId) {
        return authService.currentUserById(userId);
    }

    public boolean isCliToken(String token) { return trim(token).startsWith(CLI_TOKEN_PREFIX); }
    public boolean isModelSessionToken(String token) { return trim(token).startsWith(MODEL_SESSION_PREFIX); }
    public String normalizeAuthorization(String value) { return value != null && value.startsWith("Bearer ") ? value.substring(7).trim() : trim(value); }
    public GitPilotCliProperties properties() { return properties; }

    private void requireEnabled() { if (!properties.enabled()) throw new IllegalStateException("GitPilot CLI 功能已关闭"); }
    private String normalizeUserCode(String value) { return trim(value).toUpperCase(); }
    private String trim(String value) { return value == null ? "" : value.trim(); }
    private String randomToken(int length) {
        String source = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        return source.substring(0, Math.min(Math.max(length, 16), source.length()));
    }
    private String randomUserCode() { return UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(); }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    private <T> void saveJson(String key, T value, long ttlSeconds) {
        redis.opsForValue().set(key, writeJson(value), Duration.ofSeconds(ttlSeconds));
    }

    private String writeJson(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("CLI 临时状态序列化失败", exception); }
    }

    private <T> T readJson(String raw, Class<T> type) {
        if (raw == null || raw.isBlank()) throw new UnauthorizedException("CLI 临时凭据不存在或已过期");
        try { return objectMapper.readValue(raw, type); }
        catch (JsonProcessingException exception) { throw new UnauthorizedException("CLI 临时凭据格式非法"); }
    }

    private <T> T readJson(String raw, TypeReference<T> type) {
        if (raw == null || raw.isBlank()) return objectMapper.convertValue(List.of(), type);
        try { return objectMapper.readValue(raw, type); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("CLI Token scope 格式非法", exception); }
    }

    public enum DeviceTokenStatus { PENDING, APPROVED, EXPIRED }
    public record DeviceTokenPoll(DeviceTokenStatus status, CliTokenResponse response) {}
    public record ModelSessionState(String sessionId, Long userId, Long modelConfigId, long expiresAtEpochMillis) {}
    private record DeviceState(String userCode, String clientVersion, Long userId, long expiresAtEpochMillis) {}
}
