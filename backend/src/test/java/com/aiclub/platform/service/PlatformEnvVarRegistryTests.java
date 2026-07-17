package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证外部 MCP 白名单已经进入管理员环境变量固定注册表。 */
class PlatformEnvVarRegistryTests {

    /** MCP 白名单应出现在环境变量管理列表，并映射到 Spring 属性。 */
    @Test
    void shouldRegisterExternalMcpAllowedHosts() {
        PlatformEnvVarRegistry.PlatformEnvVarDefinition definition = new PlatformEnvVarRegistry()
                .listDefinitions().stream()
                .filter(item -> PlatformEnvVarRegistry.KEY_ASSISTANT_EXTERNAL_MCP_ALLOWED_HOSTS.equals(item.envKey()))
                .findFirst()
                .orElseThrow();

        assertThat(definition.propertyKey()).isEqualTo("platform.assistant.external-mcp.allowed-hosts");
        assertThat(definition.displayName()).isEqualTo("GitPilot 外部 MCP 访问白名单");
        assertThat(definition.validateValue("")).isEmpty();
    }
}
