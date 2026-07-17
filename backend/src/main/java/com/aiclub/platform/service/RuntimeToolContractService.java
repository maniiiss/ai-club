package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantCallableTool;
import com.aiclub.platform.dto.AssistantMcpToolSummary;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.runtime.RuntimeToolContext;
import com.aiclub.platform.runtime.RuntimeToolDefinition;
import com.aiclub.platform.runtime.RuntimeToolPolicy;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * AgentRuntime 工具契约编排服务。
 * 业务意图：把用户权限、房间工具策略、平台工具 Schema 和会话令牌收敛成 Runtime 无关的 v1 契约。
 */
@Service
public class RuntimeToolContractService {

    private static final String SUPER_ADMIN_ROLE = "SUPER_ADMIN";

    private final AssistantToolSchemaService assistantToolSchemaService;
    private final PlatformToolRegistry platformToolRegistry;

    public RuntimeToolContractService(AssistantToolSchemaService assistantToolSchemaService,
                                      PlatformToolRegistry platformToolRegistry) {
        this.assistantToolSchemaService = assistantToolSchemaService;
        this.platformToolRegistry = platformToolRegistry;
    }

    /** 为普通 GitPilot 会话构建当前用户可见的 Runtime 工具目录。 */
    public RuntimeToolContext forUser(CurrentUserInfo currentUser, String sessionToken) {
        return build(currentUser, sessionToken, null, null, null);
    }

    /** 为 GitPilot 新 Runtime 添加当前会话固定的个人外部 MCP 工具。 */
    public RuntimeToolContext forUser(CurrentUserInfo currentUser,
                                      String sessionToken,
                                      Collection<AssistantMcpToolSummary> externalTools) {
        return build(currentUser, sessionToken, null, null, externalTools);
    }

    /** 为聊天室/Agent 任务构建受房间策略约束的 Runtime 工具目录。 */
    public RuntimeToolContext forUser(CurrentUserInfo currentUser,
                                      String sessionToken,
                                      Collection<String> restrictedToolCodes,
                                      Collection<String> autoExecuteToolCodes) {
        return build(currentUser, sessionToken, restrictedToolCodes, autoExecuteToolCodes, null);
    }

    /** 为聊天室或受策略限制的 GitPilot 会话附加个人 MCP 工具目录。 */
    public RuntimeToolContext forUser(CurrentUserInfo currentUser,
                                      String sessionToken,
                                      Collection<String> restrictedToolCodes,
                                      Collection<String> autoExecuteToolCodes,
                                      Collection<AssistantMcpToolSummary> externalTools) {
        return build(currentUser, sessionToken, restrictedToolCodes, autoExecuteToolCodes, externalTools);
    }

    private RuntimeToolContext build(CurrentUserInfo currentUser,
                                     String sessionToken,
                                     Collection<String> restrictedToolCodes,
                                     Collection<String> autoExecuteToolCodes,
                                     Collection<AssistantMcpToolSummary> externalTools) {
        Map<String, AssistantCallableTool> candidates = new LinkedHashMap<>();
        appendVisibleTools(candidates, assistantToolSchemaService.listCallableTools(currentUser), currentUser);
        appendVisibleTools(candidates, assistantToolSchemaService.listCallableWriteTools(currentUser), currentUser);
        appendExternalTools(candidates, externalTools);

        Set<String> restricted = normalizeCodes(restrictedToolCodes);
        List<RuntimeToolDefinition> definitions = candidates.values().stream()
                .filter(tool -> restrictedToolCodes == null || restricted.contains(normalize(tool.toolCode())))
                .filter(tool -> tool.toolCode().startsWith("external_mcp__")
                        || platformToolRegistry.isEnabled(tool.toolCode()))
                .map(this::toRuntimeDefinition)
                .toList();

        List<String> allowedCodes = definitions.stream().map(RuntimeToolDefinition::toolCode).toList();
        Set<String> requestedAuto = normalizeCodes(autoExecuteToolCodes);
        List<String> autoCodes = definitions.stream()
                .filter(tool -> isAutoExecutable(tool, autoExecuteToolCodes, requestedAuto))
                .map(RuntimeToolDefinition::toolCode)
                .toList();
        return new RuntimeToolContext("v1", definitions,
                new RuntimeToolPolicy(sessionToken, allowedCodes, autoCodes));
    }

    /** 将会话快照中的外部 MCP 工具转换为统一 Runtime 工具定义。 */
    private void appendExternalTools(Map<String, AssistantCallableTool> target,
                                     Collection<AssistantMcpToolSummary> externalTools) {
        if (externalTools == null) return;
        for (AssistantMcpToolSummary tool : externalTools) {
            if (tool == null || !tool.enabled() || tool.toolCode() == null || tool.toolCode().isBlank()) continue;
            target.putIfAbsent(normalize(tool.toolCode()), new AssistantCallableTool(
                    tool.toolCode(), tool.toolCode(), tool.name(),
                    tool.description(), tool.readOnly(), tool.requiresConfirm(), tool.inputSchema()));
        }
    }

    private void appendVisibleTools(Map<String, AssistantCallableTool> target,
                                    List<AssistantCallableTool> tools,
                                    CurrentUserInfo currentUser) {
        if (tools == null) {
            return;
        }
        for (AssistantCallableTool tool : tools) {
            if (tool == null || normalize(tool.toolCode()).isBlank() || !hasPermission(currentUser, tool.toolCode())) {
                continue;
            }
            target.putIfAbsent(normalize(tool.toolCode()), tool);
        }
    }

    private RuntimeToolDefinition toRuntimeDefinition(AssistantCallableTool tool) {
        return new RuntimeToolDefinition(
                tool.toolCode(),
                tool.functionName(),
                tool.displayName(),
                tool.description(),
                tool.readOnly(),
                tool.requiresConfirm(),
                tool.parameters()
        );
    }

    private boolean isAutoExecutable(RuntimeToolDefinition tool,
                                     Collection<String> requestedAutoCodes,
                                     Set<String> normalizedRequestedAutoCodes) {
        if (requestedAutoCodes != null) {
            return !tool.requiresConfirm()
                    && (tool.readOnly() || tool.toolCode().startsWith("external_mcp__"))
                    && normalizedRequestedAutoCodes.contains(normalize(tool.toolCode()));
        }
        return !tool.requiresConfirm() && (tool.toolCode().startsWith("external_mcp__")
                || platformToolRegistry.isAllowAutoExecute(tool.toolCode()));
    }

    private boolean hasPermission(CurrentUserInfo currentUser, String toolCode) {
        PlatformToolDefinition definition = platformToolRegistry.requireDefinition(toolCode);
        if (definition.permissionCode() == null || definition.permissionCode().isBlank()) {
            return true;
        }
        if (currentUser == null) {
            return false;
        }
        if (currentUser.roleCodes() != null && currentUser.roleCodes().stream()
                .anyMatch(role -> SUPER_ADMIN_ROLE.equalsIgnoreCase(role))) {
            return true;
        }
        return currentUser.permissionCodes() != null
                && currentUser.permissionCodes().contains(definition.permissionCode());
    }

    private Set<String> normalizeCodes(Collection<String> codes) {
        if (codes == null) {
            return Set.of();
        }
        return codes.stream()
                .filter(code -> code != null && !code.isBlank())
                .map(this::normalize)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
