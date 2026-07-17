package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantCallableTool;
import com.aiclub.platform.dto.AssistantMcpToolSummary;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.runtime.RuntimeToolContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 验证 Runtime 无关工具契约会保留工具 Schema，并按房间策略收敛可见工具。
 */
@ExtendWith(MockitoExtension.class)
class RuntimeToolContractServiceTests {

    @Mock
    private AssistantToolSchemaService assistantToolSchemaService;

    @Mock
    private PlatformToolRegistry platformToolRegistry;

    @Test
    void shouldBuildRuntimeNeutralToolContract() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        AssistantCallableTool search = new AssistantCallableTool(
                PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                "project__search",
                "搜索项目",
                "按名称搜索项目",
                true,
                false,
                objectMapper.readTree("{\"type\":\"object\",\"properties\":{\"keyword\":{\"type\":\"string\"}}}")
        );
        PlatformToolDefinition definition = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                "搜索项目",
                "PROJECT",
                "按名称搜索项目",
                true,
                "LOW",
                "project:view",
                false,
                Map.of("keyword", "项目关键词")
        );

        when(assistantToolSchemaService.listCallableTools(currentUser())).thenReturn(List.of(search));
        when(assistantToolSchemaService.listCallableWriteTools(currentUser())).thenReturn(List.of());
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(definition);
        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(true);
        when(platformToolRegistry.isAllowAutoExecute(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(true);

        RuntimeToolContext context = new RuntimeToolContractService(assistantToolSchemaService, platformToolRegistry)
                .forUser(currentUser(), "session-token");

        assertThat(context.contractVersion()).isEqualTo("v1");
        assertThat(context.tools()).hasSize(1);
        assertThat(context.tools().get(0).toolCode()).isEqualTo(PlatformToolRegistry.TOOL_PROJECT_SEARCH);
        assertThat(context.tools().get(0).name()).isEqualTo("project__search");
        assertThat(context.tools().get(0).parameters().path("properties").path("keyword").path("type").asText())
                .isEqualTo("string");
        assertThat(context.policy().sessionToken()).isEqualTo("session-token");
        assertThat(context.policy().allowedToolCodes()).containsExactly(PlatformToolRegistry.TOOL_PROJECT_SEARCH);
        assertThat(context.policy().autoExecuteToolCodes()).containsExactly(PlatformToolRegistry.TOOL_PROJECT_SEARCH);
    }

    @Test
    void shouldRestrictToolsForRoomPolicy() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        AssistantCallableTool search = new AssistantCallableTool(
                PlatformToolRegistry.TOOL_PROJECT_SEARCH,
                "project__search",
                "搜索项目",
                "按名称搜索项目",
                true,
                false,
                objectMapper.readTree("{\"type\":\"object\"}")
        );
        PlatformToolDefinition definition = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_PROJECT_SEARCH, "搜索项目", "PROJECT", "按名称搜索项目", true,
                "LOW", "project:view", false, Map.of()
        );
        when(assistantToolSchemaService.listCallableTools(currentUser())).thenReturn(List.of(search));
        when(assistantToolSchemaService.listCallableWriteTools(currentUser())).thenReturn(List.of());
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_PROJECT_SEARCH)).thenReturn(definition);

        RuntimeToolContext context = new RuntimeToolContractService(assistantToolSchemaService, platformToolRegistry)
                .forUser(currentUser(), "session-token", List.of("work_item.search"), List.of());

        assertThat(context.tools()).isEmpty();
        assertThat(context.policy().allowedToolCodes()).isEmpty();
    }

    /** 外部 MCP 只读工具应进入自动执行目录，未知/写工具不能自动执行。 */
    @Test
    void shouldAppendExternalMcpToolsWithSafeAutoExecutionPolicy() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        AssistantMcpToolSummary readTool = new AssistantMcpToolSummary(
                "external_mcp__7__v2__search", "search", "查询知识库", true, false,
                objectMapper.readTree("{\"type\":\"object\"}"));
        AssistantMcpToolSummary writeTool = new AssistantMcpToolSummary(
                "external_mcp__7__v2__update", "update", "修改知识库", false, true,
                objectMapper.readTree("{\"type\":\"object\"}"));
        when(assistantToolSchemaService.listCallableTools(currentUser())).thenReturn(List.of());
        when(assistantToolSchemaService.listCallableWriteTools(currentUser())).thenReturn(List.of());

        RuntimeToolContext context = new RuntimeToolContractService(assistantToolSchemaService, platformToolRegistry)
                .forUser(currentUser(), "session-token", List.of(readTool, writeTool));

        assertThat(context.tools()).extracting(tool -> tool.toolCode())
                .containsExactly("external_mcp__7__v2__search", "external_mcp__7__v2__update");
        assertThat(context.policy().autoExecuteToolCodes()).containsExactly("external_mcp__7__v2__search");
    }

    /** 明确只读工具也可以被用户改为每次确认，人工策略不得进入自动执行目录。 */
    @Test
    void shouldRespectManualConfirmationForReadOnlyExternalTool() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        AssistantMcpToolSummary confirmedReadTool = new AssistantMcpToolSummary(
                "external_mcp__7__v2__search", "search", "查询知识库", true, true,
                objectMapper.readTree("{\"type\":\"object\"}"));
        when(assistantToolSchemaService.listCallableTools(currentUser())).thenReturn(List.of());
        when(assistantToolSchemaService.listCallableWriteTools(currentUser())).thenReturn(List.of());

        RuntimeToolContext context = new RuntimeToolContractService(assistantToolSchemaService, platformToolRegistry)
                .forUser(currentUser(), "session-token", List.of(confirmedReadTool));

        assertThat(context.tools().get(0).requiresConfirm()).isTrue();
        assertThat(context.policy().autoExecuteToolCodes()).isEmpty();
    }

    /** 用户明确取消确认后，即使服务没有声明只读，外部工具也应进入自动执行目录。 */
    @Test
    void shouldAllowManuallyAuthorizedExternalToolWithoutReadOnlyHint() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        AssistantMcpToolSummary manuallyAuthorizedTool = new AssistantMcpToolSummary(
                "external_mcp__7__v2__search", "search", "查询知识库", false, false,
                objectMapper.readTree("{\"type\":\"object\"}"));
        when(assistantToolSchemaService.listCallableTools(currentUser())).thenReturn(List.of());
        when(assistantToolSchemaService.listCallableWriteTools(currentUser())).thenReturn(List.of());

        RuntimeToolContext context = new RuntimeToolContractService(assistantToolSchemaService, platformToolRegistry)
                .forUser(currentUser(), "session-token", List.of(manuallyAuthorizedTool));

        assertThat(context.policy().autoExecuteToolCodes()).containsExactly("external_mcp__7__v2__search");
    }

    /** 关闭工具后，统一 Runtime 契约不得继续暴露该工具。 */
    @Test
    void shouldExcludeDisabledExternalToolFromRuntimeContract() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        AssistantMcpToolSummary disabledTool = new AssistantMcpToolSummary(
                "external_mcp__7__v2__search", "search", "查询知识库", true, false,
                objectMapper.readTree("{\"type\":\"object\"}"), false);
        when(assistantToolSchemaService.listCallableTools(currentUser())).thenReturn(List.of());
        when(assistantToolSchemaService.listCallableWriteTools(currentUser())).thenReturn(List.of());

        RuntimeToolContext context = new RuntimeToolContractService(assistantToolSchemaService, platformToolRegistry)
                .forUser(currentUser(), "session-token", List.of(disabledTool));

        assertThat(context.tools()).isEmpty();
    }

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(
                1L, "runtime-user", "Runtime User", "", "", "", "", true,
                List.of("SUPER_ADMIN"), List.of("超级管理员"), List.of("project:view"), List.of()
        );
    }
}
