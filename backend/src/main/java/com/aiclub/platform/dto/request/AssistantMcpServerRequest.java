package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Map;

/** 用户新增或更新个人 MCP 服务的请求。credential 为空时更新接口保留原凭证。 */
public record AssistantMcpServerRequest(
        @NotBlank @Size(max = 120) String name,
        @NotBlank @Size(max = 1000) String endpointUrl,
        @Size(max = 30) String transport,
        @Size(max = 30) String authType,
        @Size(max = 2000) String credential,
        Boolean enabled,
        /** 用户针对已发现工具的确认策略覆盖，键为 MCP 工具名称。 */
        Map<String, Boolean> toolConfirmationOverrides,
        /** 用户针对已发现工具的启用策略覆盖，键为 MCP 工具名称。 */
        Map<String, Boolean> toolEnabledOverrides
) {
    public AssistantMcpServerRequest {
        toolConfirmationOverrides = toolConfirmationOverrides == null ? Map.of() : Map.copyOf(toolConfirmationOverrides);
        toolEnabledOverrides = toolEnabledOverrides == null ? Map.of() : Map.copyOf(toolEnabledOverrides);
    }
}
