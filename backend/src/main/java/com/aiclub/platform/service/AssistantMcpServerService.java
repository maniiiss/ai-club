package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantMcpServerEntity;
import com.aiclub.platform.dto.AssistantMcpConnectionTestResult;
import com.aiclub.platform.dto.AssistantMcpServerSummary;
import com.aiclub.platform.dto.AssistantMcpToolSummary;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.request.AssistantMcpServerRequest;
import com.aiclub.platform.repository.AssistantMcpServerRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GitPilot 用户 MCP 配置服务。
 * 业务意图：集中处理个人隔离、凭证加密、连接发现、版本快照和外部工具路由。
 */
@Service
@Transactional(readOnly = true)
public class AssistantMcpServerService {

    private static final Pattern TOOL_CODE_PATTERN = Pattern.compile("^external_mcp__(\\d+)__v(\\d+)__(.+)$");
    /** 个人 MCP 专项 Slash 命令格式，只允许按服务主键选择当前会话快照中的工具。 */
    private static final Pattern MCP_SLASH_COMMAND_PATTERN = Pattern.compile("^/mcp/(\\d+)$", Pattern.CASE_INSENSITIVE);
    private final AssistantMcpServerRepository repository;
    private final UserRepository userRepository;
    private final AuthService authService;
    private final TokenCipherService tokenCipherService;
    private final ExternalMcpClient externalMcpClient;
    private final ObjectMapper objectMapper;
    private final AssistantConversationStateStore assistantConversationStateStore;

    public AssistantMcpServerService(AssistantMcpServerRepository repository,
                                     UserRepository userRepository,
                                     AuthService authService,
                                     TokenCipherService tokenCipherService,
                                     ExternalMcpClient externalMcpClient,
                                     ObjectMapper objectMapper,
                                     AssistantConversationStateStore assistantConversationStateStore) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.authService = authService;
        this.tokenCipherService = tokenCipherService;
        this.externalMcpClient = externalMcpClient;
        this.objectMapper = objectMapper;
        this.assistantConversationStateStore = assistantConversationStateStore;
    }

    /** 读取当前用户的全部 MCP 服务摘要。 */
    public List<AssistantMcpServerSummary> listMine() {
        return repository.findByUser_IdOrderByIdAsc(currentUserId()).stream().map(this::toSummary).toList();
    }

    /** 连接测试但不落库，供添加表单预览服务工具目录。 */
    public AssistantMcpConnectionTestResult test(@Valid AssistantMcpServerRequest request) {
        String credential = request.credential() == null ? "" : request.credential().trim();
        ExternalMcpClient.DiscoveryResult result = discover(request.endpointUrl(), request.transport(), request.authType(), credential);
        return new AssistantMcpConnectionTestResult(true, "MCP 连接成功", result.serverName(), result.serverVersion(), result.tools());
    }

    /** 新增个人 MCP 服务，连接测试成功后才写入启用配置。 */
    @Transactional
    public AssistantMcpServerSummary create(@Valid AssistantMcpServerRequest request) {
        Long userId = currentUserId();
        String name = normalizeRequired(request.name(), "MCP 服务名称不能为空");
        if (repository.findByUser_IdAndName(userId, name).isPresent()) {
            throw new IllegalArgumentException("已存在同名 MCP 服务");
        }
        String credential = request.credential() == null ? "" : request.credential().trim();
        ExternalMcpClient.DiscoveryResult discovery = discover(request.endpointUrl(), request.transport(), request.authType(), credential);
        AssistantMcpServerEntity entity = new AssistantMcpServerEntity();
        entity.setUser(userRepository.getReferenceById(userId));
        entity.setName(name);
        entity.setEndpointUrl(request.endpointUrl().trim());
        entity.setTransport(normalize(request.transport(), "AUTO"));
        entity.setAuthType(normalize(request.authType(), "NONE"));
        entity.setCredentialCiphertext(encrypt(credential));
        // 先取得主键，再生成带 serverId 的稳定工具编码。
        entity.setToolsJson("[]");
        AssistantMcpServerEntity saved = repository.saveAndFlush(entity);
        applyCurrentConfig(saved, request.endpointUrl(), request.transport(), request.authType(), credential, discovery, 1L,
                request.toolConfirmationOverrides(), request.toolEnabledOverrides());
        saved.setEnabled(request.enabled() == null || request.enabled());
        return toSummary(repository.save(saved));
    }

    /** 更新个人 MCP 服务；凭证留空时沿用原密文。 */
    @Transactional
    public AssistantMcpServerSummary update(Long id, @Valid AssistantMcpServerRequest request) {
        AssistantMcpServerEntity entity = requireMine(id);
        String name = normalizeRequired(request.name(), "MCP 服务名称不能为空");
        repository.findByUser_IdAndName(currentUserId(), name).ifPresent(other -> {
            if (!other.getId().equals(id)) throw new IllegalArgumentException("已存在同名 MCP 服务");
        });
        String credential = request.credential() == null || request.credential().isBlank()
                ? decrypt(entity.getCredentialCiphertext()) : request.credential().trim();
        ExternalMcpClient.DiscoveryResult discovery = discover(request.endpointUrl(), request.transport(), request.authType(), credential);
        long nextVersion = (entity.getConfigVersion() == null ? 1L : entity.getConfigVersion()) + 1L;
        appendHistory(entity);
        entity.setName(name);
        applyCurrentConfig(entity, request.endpointUrl(), request.transport(), request.authType(), credential, discovery, nextVersion,
                request.toolConfirmationOverrides(), request.toolEnabledOverrides());
        entity.setEnabled(request.enabled() == null ? entity.isEnabled() : request.enabled());
        return toSummary(repository.save(entity));
    }

    /** 重新测试已保存服务并刷新工具目录。 */
    @Transactional
    public AssistantMcpServerSummary retest(Long id) {
        AssistantMcpServerEntity entity = requireMine(id);
        String credential = decrypt(entity.getCredentialCiphertext());
        ExternalMcpClient.DiscoveryResult discovery = discover(entity.getEndpointUrl(), entity.getTransport(), entity.getAuthType(), credential);
        appendHistory(entity);
        applyCurrentConfig(entity, entity.getEndpointUrl(), entity.getTransport(), entity.getAuthType(), credential,
                discovery, (entity.getConfigVersion() == null ? 1L : entity.getConfigVersion()) + 1L,
                currentToolConfirmationOverrides(entity), currentToolEnabledOverrides(entity));
        return toSummary(repository.save(entity));
    }

    /** 切换后续新会话是否加载该 MCP 服务。 */
    @Transactional
    public AssistantMcpServerSummary setEnabled(Long id, boolean enabled) {
        AssistantMcpServerEntity entity = requireMine(id);
        entity.setEnabled(enabled);
        return toSummary(repository.save(entity));
    }

    /** 删除个人 MCP 服务；删除后其历史工具调用立即失效。 */
    @Transactional
    public void delete(Long id) {
        repository.delete(requireMine(id));
    }

    /** 为新会话生成加密的外部 MCP 配置快照。 */
    public String snapshotForNewSession(Long userId) {
        List<ConfigSnapshot> snapshots = repository.findByUser_IdAndEnabledTrueOrderByIdAsc(userId).stream()
                .map(this::currentSnapshot)
                .toList();
        if (snapshots.isEmpty()) return "";
        return encrypt(writeJson(snapshots));
    }

    /** 从会话快照恢复当前轮次可见的外部工具目录。 */
    public List<AssistantMcpToolSummary> toolsFromSnapshot(String snapshotCiphertext) {
        return toolsFromSnapshot(snapshotCiphertext, null);
    }

    /**
     * 从会话快照恢复工具，并按 `/mcp/{serverId}` 专项命令限制服务范围。
     * 业务意图：用户选择某个 MCP 后，本轮 Runtime 只能看到该服务的工具，避免跨服务误调用。
     */
    public List<AssistantMcpToolSummary> toolsFromSnapshot(String snapshotCiphertext, String slashCommand) {
        if (snapshotCiphertext == null || snapshotCiphertext.isBlank()) return List.of();
        try {
            List<AssistantMcpToolSummary> allTools = readJson(decrypt(snapshotCiphertext), new TypeReference<List<ConfigSnapshot>>() {}).stream()
                    .flatMap(snapshot -> snapshot.tools().stream())
                    .filter(AssistantMcpToolSummary::enabled)
                    .toList();
            String normalized = slashCommand == null ? "" : slashCommand.trim();
            if (!normalized.toLowerCase(java.util.Locale.ROOT).startsWith("/mcp/")) return allTools;
            Matcher matcher = MCP_SLASH_COMMAND_PATTERN.matcher(normalized);
            if (!matcher.matches()) return List.of();
            String prefix = "external_mcp__" + Long.parseLong(matcher.group(1)) + "__";
            return allTools.stream().filter(tool -> tool.toolCode().startsWith(prefix)).toList();
        } catch (Exception exception) {
            return List.of();
        }
    }

    /** 内部工具网关再次校验专项 MCP 命令，防止模型伪造其他服务的工具编码。 */
    public boolean isToolAllowedForSlashCommand(String toolCode, String slashCommand) {
        String normalized = slashCommand == null ? "" : slashCommand.trim();
        if (!normalized.toLowerCase(java.util.Locale.ROOT).startsWith("/mcp/")) return true;
        Matcher matcher = MCP_SLASH_COMMAND_PATTERN.matcher(normalized);
        if (!matcher.matches()) return false;
        try {
            return toolCode != null && toolCode.startsWith("external_mcp__" + Long.parseLong(matcher.group(1)) + "__");
        } catch (NumberFormatException exception) {
            return false;
        }
    }

    /** 按外部工具编码调用 MCP；调用前再次确认用户、服务启用状态和配置版本。 */
    public String executeExternalTool(Long userId, String toolCode, Map<String, Object> arguments) {
        return executeExternalTool(userId, toolCode, arguments, false);
    }

    /** 用户确认动作卡片后执行外部 MCP 写工具。 */
    @Transactional(readOnly = true)
    public String executeConfirmedExternalTool(Long userId, String toolCode, Map<String, Object> arguments) {
        return executeExternalTool(userId, toolCode, arguments, true);
    }

    /** 校验动作卡片携带的短期确认令牌，避免用户绕过动作卡片直接触发写工具。 */
    public void validateActionConfirmation(Long userId,
                                           String scopeKey,
                                           String clientConversationId,
                                           String confirmationToken,
                                           String toolCode,
                                           Map<String, Object> arguments) {
        AssistantConversationState state = assistantConversationStateStore.load(scopeKey, clientConversationId)
                .orElseThrow(() -> new IllegalArgumentException("GitPilot 确认动作已过期，请重新发起请求"));
        if (state.currentUser() == null || !userId.equals(state.currentUser().id())) {
            throw new IllegalArgumentException("GitPilot 确认动作不属于当前用户");
        }
        boolean matched = state.actions().stream().anyMatch(action ->
                "EXTERNAL_MCP_TOOL".equals(action.type())
                        && confirmationToken.equals(String.valueOf(action.params().getOrDefault("confirmationToken", "")))
                        && toolCode.equals(String.valueOf(action.params().getOrDefault("toolCode", "")))
                        && argumentsEqual(arguments, action.params().get("arguments")));
        if (!matched) throw new IllegalArgumentException("GitPilot 确认动作无效或已失效");
    }

    /** 归一化客户端 JSON 参数后比较，防止确认时修改工具参数。 */
    private boolean argumentsEqual(Map<String, Object> actual, Object expected) {
        try {
            return objectMapper.readTree(writeJson(actual == null ? Map.of() : actual))
                    .equals(objectMapper.readTree(writeJson(expected == null ? Map.of() : expected)));
        } catch (Exception exception) {
            return false;
        }
    }

    /** 返回当前用户对应的外部工具定义，供确认动作展示使用。 */
    public AssistantMcpToolSummary findExternalTool(Long userId, String toolCode) {
        ToolReference reference = parseToolCode(toolCode);
        AssistantMcpServerEntity entity = repository.findByIdAndUser_Id(reference.serverId(), userId)
                .orElseThrow(() -> new IllegalArgumentException("外部 MCP 服务不存在或不属于当前用户"));
        if (!entity.isEnabled()) throw new IllegalStateException("外部 MCP 服务已停用");
        requireCurrentToolEnabled(entity, reference.toolName());
        ConfigSnapshot config = resolveSnapshot(entity, reference.version());
        return config.tools().stream()
                .filter(AssistantMcpToolSummary::enabled)
                .filter(item -> item.name().equals(reference.toolName()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("外部 MCP 工具未在已发现目录中"));
    }

    /** 为确认动作接口读取当前登录用户 ID。 */
    public Long currentUserIdForAction() {
        return currentUserId();
    }

    private String executeExternalTool(Long userId, String toolCode, Map<String, Object> arguments, boolean confirmed) {
        ToolReference reference = parseToolCode(toolCode);
        AssistantMcpServerEntity entity = repository.findByIdAndUser_Id(reference.serverId(), userId)
                .orElseThrow(() -> new IllegalArgumentException("外部 MCP 服务不存在或不属于当前用户"));
        if (!entity.isEnabled()) throw new IllegalStateException("外部 MCP 服务已停用");
        requireCurrentToolEnabled(entity, reference.toolName());
        ConfigSnapshot config = resolveSnapshot(entity, reference.version());
        AssistantMcpToolSummary tool = config.tools().stream()
                .filter(item -> item.name().equals(reference.toolName()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("外部 MCP 工具未在已发现目录中"));
        if (tool.requiresConfirm() && !confirmed) throw new IllegalStateException("外部 MCP 工具需要用户确认后才能执行");
        return externalMcpClient.call(config.endpointUrl(), config.transport(), config.authType(), config.credential(), tool.name(), arguments);
    }

    /** 工具被用户关闭后立即撤销调用权限，即使旧会话仍保留旧的工具快照。 */
    private void requireCurrentToolEnabled(AssistantMcpServerEntity entity, String toolName) {
        boolean enabled = readJson(entity.getToolsJson(), new TypeReference<List<AssistantMcpToolSummary>>() {}).stream()
                .anyMatch(item -> item.enabled() && item.name().equals(toolName));
        if (!enabled) throw new IllegalStateException("外部 MCP 工具已停用");
    }

    /** 判断工具编码是否属于外部 MCP 命名空间。 */
    public boolean isExternalToolCode(String toolCode) {
        return toolCode != null && TOOL_CODE_PATTERN.matcher(toolCode.trim()).matches();
    }

    private ExternalMcpClient.DiscoveryResult discover(String endpoint, String transport, String authType, String credential) {
        return externalMcpClient.discover(endpoint, normalize(transport, "AUTO"), normalize(authType, "NONE"), credential);
    }

    private void applyCurrentConfig(AssistantMcpServerEntity entity,
                                    String endpoint,
                                    String transport,
                                    String authType,
                                    String credential,
                                    ExternalMcpClient.DiscoveryResult discovery,
                                    long version,
                                    Map<String, Boolean> confirmationOverrides,
                                    Map<String, Boolean> enabledOverrides) {
        List<AssistantMcpToolSummary> tools = assignToolCodes(entity.getId(), version, discovery.tools(), confirmationOverrides, enabledOverrides);
        entity.setEndpointUrl(endpoint.trim());
        entity.setTransport(normalize(transport, "AUTO"));
        entity.setAuthType(normalize(authType, "NONE"));
        entity.setCredentialCiphertext(encrypt(credential));
        entity.setConfigVersion(version);
        entity.setConnectionStatus("HEALTHY");
        entity.setConnectionMessage("MCP 连接成功");
        entity.setServerInfoJson(writeJson(Map.of("name", discovery.serverName(), "version", discovery.serverVersion())));
        entity.setToolsJson(writeJson(tools));
        entity.setLastTestedAt(LocalDateTime.now());
    }

    /** 生成稳定工具编码，并把用户的逐工具确认策略合并到本次配置版本。 */
    private List<AssistantMcpToolSummary> assignToolCodes(Long id,
                                                          long version,
                                                          List<AssistantMcpToolSummary> tools,
                                                          Map<String, Boolean> confirmationOverrides,
                                                          Map<String, Boolean> enabledOverrides) {
        return tools.stream().map(tool -> new AssistantMcpToolSummary(
                buildToolCode(id == null ? 0L : id, version, tool.name()), tool.name(), tool.description(),
                tool.readOnly(), resolveRequiresConfirm(tool, confirmationOverrides), tool.inputSchema(),
                resolveEnabled(tool, enabledOverrides))).toList();
    }

    /** 合并发现结果和用户人工策略；未配置覆盖时，写入或未知工具默认必须确认。 */
    private boolean resolveRequiresConfirm(AssistantMcpToolSummary tool, Map<String, Boolean> confirmationOverrides) {
        if (confirmationOverrides != null && confirmationOverrides.containsKey(tool.name())) {
            return Boolean.TRUE.equals(confirmationOverrides.get(tool.name()));
        }
        return !tool.readOnly() || tool.requiresConfirm();
    }

    /** 新发现工具默认启用；用户明确关闭的工具不会注入后续新会话。 */
    private boolean resolveEnabled(AssistantMcpToolSummary tool, Map<String, Boolean> enabledOverrides) {
        if (enabledOverrides != null && enabledOverrides.containsKey(tool.name())) {
            return Boolean.TRUE.equals(enabledOverrides.get(tool.name()));
        }
        return tool.enabled();
    }

    /** 重新测试时沿用当前工具的人工确认配置，避免只刷新连接就丢失用户选择。 */
    private Map<String, Boolean> currentToolConfirmationOverrides(AssistantMcpServerEntity entity) {
        return readJson(entity.getToolsJson(), new TypeReference<List<AssistantMcpToolSummary>>() {}).stream()
                .collect(java.util.stream.Collectors.toMap(AssistantMcpToolSummary::name,
                        AssistantMcpToolSummary::requiresConfirm, (first, ignored) -> first));
    }

    /** 重新测试时沿用当前工具启用状态，避免刷新目录后重新启用已关闭工具。 */
    private Map<String, Boolean> currentToolEnabledOverrides(AssistantMcpServerEntity entity) {
        return readJson(entity.getToolsJson(), new TypeReference<List<AssistantMcpToolSummary>>() {}).stream()
                .collect(java.util.stream.Collectors.toMap(AssistantMcpToolSummary::name,
                        AssistantMcpToolSummary::enabled, (first, ignored) -> first));
    }

    private void appendHistory(AssistantMcpServerEntity entity) {
        List<ConfigSnapshot> history = readJson(entity.getConfigHistoryCiphertext(), new TypeReference<List<ConfigSnapshot>>() {});
        history = new ArrayList<>(history);
        history.add(currentSnapshot(entity));
        entity.setConfigHistoryCiphertext(encrypt(writeJson(history)));
    }

    private ConfigSnapshot currentSnapshot(AssistantMcpServerEntity entity) {
        return new ConfigSnapshot(entity.getId(), entity.getConfigVersion() == null ? 1L : entity.getConfigVersion(),
                entity.getName(), entity.getEndpointUrl(), entity.getTransport(), entity.getAuthType(),
                decrypt(entity.getCredentialCiphertext()), readJson(entity.getToolsJson(), new TypeReference<List<AssistantMcpToolSummary>>() {}));
    }

    private ConfigSnapshot resolveSnapshot(AssistantMcpServerEntity entity, long version) {
        if (entity.getConfigVersion() != null && entity.getConfigVersion() == version) return currentSnapshot(entity);
        return readJson(entity.getConfigHistoryCiphertext(), new TypeReference<List<ConfigSnapshot>>() {}).stream()
                .filter(item -> item.version() == version)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("外部 MCP 配置版本已失效"));
    }

    private AssistantMcpServerEntity requireMine(Long id) {
        return repository.findByIdAndUser_Id(id, currentUserId())
                .orElseThrow(() -> new IllegalArgumentException("MCP 服务不存在"));
    }

    private Long currentUserId() {
        CurrentUserInfo user = authService.currentUser();
        if (user == null || user.id() == null) throw new IllegalStateException("当前用户信息缺失");
        return user.id();
    }

    private AssistantMcpServerSummary toSummary(AssistantMcpServerEntity entity) {
        Map<String, String> serverInfo = readJson(entity.getServerInfoJson(), new TypeReference<Map<String, String>>() {});
        List<AssistantMcpToolSummary> tools = readJson(entity.getToolsJson(), new TypeReference<List<AssistantMcpToolSummary>>() {});
        return new AssistantMcpServerSummary(entity.getId(), entity.getName(), entity.getEndpointUrl(), entity.getTransport(), entity.getAuthType(),
                entity.getCredentialCiphertext() != null && !entity.getCredentialCiphertext().isBlank(), entity.isEnabled(),
                entity.getConfigVersion() == null ? 1L : entity.getConfigVersion(), entity.getConnectionStatus(), entity.getConnectionMessage(),
                serverInfo.getOrDefault("name", ""), serverInfo.getOrDefault("version", ""), tools, entity.getLastTestedAt());
    }

    private String buildToolCode(Long serverId, long version, String toolName) {
        return "external_mcp__" + serverId + "__v" + version + "__" + toolName;
    }

    private ToolReference parseToolCode(String toolCode) {
        Matcher matcher = TOOL_CODE_PATTERN.matcher(toolCode == null ? "" : toolCode.trim());
        if (!matcher.matches()) throw new IllegalArgumentException("外部 MCP 工具编码无效");
        try { return new ToolReference(Long.parseLong(matcher.group(1)), Long.parseLong(matcher.group(2)), matcher.group(3)); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("外部 MCP 工具编码无效", exception); }
    }

    private String encrypt(String value) { return value == null || value.isBlank() ? "" : tokenCipherService.encrypt(value); }
    private String decrypt(String value) { return value == null || value.isBlank() ? "" : tokenCipherService.decrypt(value); }
    private String writeJson(Object value) { try { return objectMapper.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("MCP 配置序列化失败", e); } }
    private <T> T readJson(String value, TypeReference<T> type) { try { return objectMapper.readValue(value == null || value.isBlank() ? "[]" : value, type); } catch (Exception e) { return (T) List.of(); } }
    private String normalize(String value, String fallback) { return value == null || value.isBlank() ? fallback : value.trim().toUpperCase(); }
    private String normalizeRequired(String value, String message) { if (value == null || value.isBlank()) throw new IllegalArgumentException(message); return value.trim(); }

    /** 会话快照中的一份不可变 MCP 配置。 */
    public record ConfigSnapshot(Long serverId, long version, String name, String endpointUrl, String transport,
                                 String authType, String credential, List<AssistantMcpToolSummary> tools) {
        public ConfigSnapshot { tools = tools == null ? List.of() : List.copyOf(tools); }
    }

    private record ToolReference(Long serverId, long version, String toolName) { }
}
