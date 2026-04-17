package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesCallableTool;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 验证 Hermes 工具 schema 暴露符合仓库扫描闭环的接入约束。
 */
@ExtendWith(MockitoExtension.class)
class HermesToolSchemaServiceTests {

    @Mock
    private PlatformToolRegistry platformToolRegistry;

    /**
     * 只读工具目录应包含扫描规则集列表，供 Hermes 在发起扫描前先完成规则集确认。
     */
    @Test
    void shouldExposeRepositoryScanRulesetToolToReadableToolList() {
        HermesToolSchemaService service = new HermesToolSchemaService(platformToolRegistry, new ObjectMapper());
        when(platformToolRegistry.listDefinitions()).thenReturn(List.of(
                new PlatformToolDefinition(
                        PlatformToolRegistry.TOOL_REPO_SCAN_LIST_RULESETS,
                        "扫描规则集列表",
                        "GITLAB",
                        "列出可用于仓库规范扫描的规则集",
                        true,
                        "LOW",
                        "gitlab:view",
                        false,
                        Map.of(),
                        Map.of("summary", "规则集摘要", "candidates[]", "规则集候选列表")
                )
        ));

        List<HermesCallableTool> tools = service.listCallableTools(currentUser());

        assertThat(tools).extracting(HermesCallableTool::toolCode)
                .contains(PlatformToolRegistry.TOOL_REPO_SCAN_LIST_RULESETS);
        assertThat(tools.get(0).description())
                .contains("入参")
                .contains("出参")
                .contains("candidates[]");
    }

    /**
     * 写工具目录应包含仓库扫描工具，并将 rulesetCode 标记为必填参数。
     */
    @Test
    void shouldExposeRepositoryScanStartToolWithRequiredRulesetCode() {
        HermesToolSchemaService service = new HermesToolSchemaService(platformToolRegistry, new ObjectMapper());
        when(platformToolRegistry.listDefinitions()).thenReturn(List.of(
                new PlatformToolDefinition(
                        PlatformToolRegistry.TOOL_REPO_SCAN_START,
                        "发起仓库扫描",
                        "GITLAB",
                        "基于指定绑定仓库创建仓库规范扫描任务",
                        false,
                        "MEDIUM",
                        "gitlab:manage",
                        true,
                        Map.of("bindingId", "绑定ID", "branch", "分支", "rulesetCode", "规则集"),
                        Map.of("type", "待确认动作类型", "params", "动作参数")
                )
        ));

        List<HermesCallableTool> tools = service.listCallableWriteTools(currentUser());

        assertThat(tools).hasSize(1);
        assertThat(tools.get(0).toolCode()).isEqualTo(PlatformToolRegistry.TOOL_REPO_SCAN_START);
        List<String> requiredFields = StreamSupport.stream(tools.get(0).parameters().path("required").spliterator(), false)
                .map(JsonNode::asText)
                .toList();
        assertThat(requiredFields).contains("rulesetCode");
        assertThat(tools.get(0).description())
                .contains("rulesetCode (string) [必填]")
                .contains("待确认动作卡片");
    }

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(
                1L,
                "hermes",
                "Hermes",
                "hermes@example.com",
                "",
                "hermes",
                "",
                true,
                List.of("SUPER_ADMIN"),
                List.of("超级管理员"),
                List.of("gitlab:view", "gitlab:manage")
        );
    }
}
