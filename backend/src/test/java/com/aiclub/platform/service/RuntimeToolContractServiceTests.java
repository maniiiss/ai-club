package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantCallableTool;
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

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(
                1L, "runtime-user", "Runtime User", "", "", "", "", true,
                List.of("SUPER_ADMIN"), List.of("超级管理员"), List.of("project:view"), List.of()
        );
    }
}
