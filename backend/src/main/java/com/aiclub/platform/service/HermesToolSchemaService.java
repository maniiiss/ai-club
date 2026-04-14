package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesCallableTool;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 将平台工具定义适配为 Hermes 可见的函数工具 schema。
 */
@Service
public class HermesToolSchemaService {

    private static final String SUPER_ADMIN_ROLE = "SUPER_ADMIN";
    private static final Set<String> SUPPORTED_WRITE_TOOL_CODES = Set.of(
            PlatformToolRegistry.TOOL_REPO_SCAN_START,
            PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT,
            PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE,
            PlatformToolRegistry.TOOL_TEST_PLAN_CREATE_DRAFT
    );

    private final PlatformToolRegistry platformToolRegistry;
    private final ObjectMapper objectMapper;

    public HermesToolSchemaService(PlatformToolRegistry platformToolRegistry,
                                   ObjectMapper objectMapper) {
        this.platformToolRegistry = platformToolRegistry;
        this.objectMapper = objectMapper;
    }

    /**
     * 列出当前用户对 Hermes 可见的工具。
     * 只读工具全部开放；写工具仅开放当前前端已支持确认卡片的几种。
     */
    public List<HermesCallableTool> listCallableTools(CurrentUserInfo currentUser) {
        return platformToolRegistry.listDefinitions().stream()
                .filter(PlatformToolDefinition::readOnly)
                .filter(definition -> hasPermission(currentUser, definition.permissionCode()))
                .map(this::toCallableTool)
                .toList();
    }

    /**
     * 列出当前用户对 Hermes 可见的写工具。
     * 这些工具不会被平台直接执行，只会转成确认卡片，
     * 因此这里默认向 Hermes 暴露支持的写工具，由平台在确认执行阶段再做最终权限校验。
     */
    public List<HermesCallableTool> listCallableWriteTools(CurrentUserInfo currentUser) {
        return platformToolRegistry.listDefinitions().stream()
                .filter(definition -> !definition.readOnly())
                .filter(definition -> SUPPORTED_WRITE_TOOL_CODES.contains(definition.code()))
                .map(this::toCallableTool)
                .toList();
    }

    /**
     * 将工具函数名映射回平台内部工具编码。
     */
    public String resolveToolCode(String functionName) {
        if (functionName == null || functionName.isBlank()) {
            return "";
        }
        return functionName.trim().replace("__", ".");
    }

    /**
     * 判断工具是否属于当前可支持的写操作确认范围。
     */
    public boolean isCallableWriteTool(String toolCode) {
        return SUPPORTED_WRITE_TOOL_CODES.contains(toolCode);
    }

    /**
     * 将平台工具定义转换为 Hermes 可消费的 JSON Schema。
     */
    private HermesCallableTool toCallableTool(PlatformToolDefinition definition) {
        ObjectNode parameters = JsonNodeFactory.instance.objectNode();
        parameters.put("type", "object");
        ObjectNode properties = parameters.putObject("properties");
        if (definition.inputSchema() != null) {
            for (Map.Entry<String, String> entry : definition.inputSchema().entrySet()) {
                ObjectNode property = properties.putObject(entry.getKey());
                property.put("type", inferJsonType(entry.getKey()));
                property.put("description", entry.getValue());
            }
        }
        appendRequiredFields(parameters.putArray("required"), definition);
        parameters.put("additionalProperties", false);
        return new HermesCallableTool(
                definition.code(),
                functionName(definition.code()),
                definition.name(),
                definition.description(),
                definition.readOnly(),
                definition.requiresConfirm(),
                objectMapper.valueToTree(parameters)
        );
    }

    /**
     * 将平台工具编码转换为 OpenAI 兼容函数名。
     */
    private String functionName(String toolCode) {
        return toolCode == null ? "" : toolCode.replace(".", "__");
    }

    /**
     * Hermes 工具暴露遵循平台权限，但超级管理员角色可以直接看到全部工具。
     */
    private boolean hasPermission(CurrentUserInfo currentUser, String permissionCode) {
        if (isSuperAdmin(currentUser)) {
            return true;
        }
        if (permissionCode == null || permissionCode.isBlank()) {
            return true;
        }
        List<String> permissionCodes = currentUser == null || currentUser.permissionCodes() == null
                ? List.of()
                : currentUser.permissionCodes();
        return permissionCodes.contains(permissionCode);
    }

    private boolean isSuperAdmin(CurrentUserInfo currentUser) {
        List<String> roleCodes = currentUser == null || currentUser.roleCodes() == null
                ? List.of()
                : currentUser.roleCodes();
        return roleCodes.stream().anyMatch(code -> SUPER_ADMIN_ROLE.equalsIgnoreCase(code));
    }

    /**
     * 现有工具入参大多是 ID 或关键词，第一版按命名约定推断基础 JSON 类型。
     */
    private String inferJsonType(String fieldName) {
        if (fieldName == null) {
            return "string";
        }
        String normalized = fieldName.toLowerCase();
        if (normalized.endsWith("id") || normalized.endsWith("ids")) {
            return "integer";
        }
        if (normalized.contains("enabled") || normalized.startsWith("is")) {
            return "boolean";
        }
        return "string";
    }

    /**
     * 目前仅对仓库扫描写工具显式声明规则集必填，避免模型在未确认规则集时直接发起扫描。
     */
    private void appendRequiredFields(com.fasterxml.jackson.databind.node.ArrayNode required,
                                      PlatformToolDefinition definition) {
        if (required == null || definition == null) {
            return;
        }
        if (PlatformToolRegistry.TOOL_REPO_SCAN_START.equals(definition.code())) {
            required.add("rulesetCode");
        }
    }
}
