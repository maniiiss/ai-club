package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 语义查询请求集合；敏感凭据仅允许写入，任何读取 DTO 都不会回显。 */
public final class DataSemanticQueryRequests {
    private DataSemanticQueryRequests() { }
    public record DataSourceRequest(@NotBlank @Size(max=120) String name, @NotBlank @Size(max=1000) String jdbcUrl, @NotBlank @Size(max=200) String username, @NotBlank @Size(max=1000) String password, @Size(max=1000) String allowedSchemas, @NotNull Boolean enabled) { }
    public record SemanticModelRequest(@NotNull Long dataSourceId, @NotBlank @Size(max=120) String name, @NotBlank @Size(max=30000) String definitionJson, Long modelConfigId) { }
    public record InterpretRequest(@NotNull Long semanticModelId, @NotBlank @Size(max=4000) String text) { }
    public record PreviewRequest(@NotNull Long requestId) { }
    public record ExecuteRequest(@NotNull Long requestId, @NotBlank @Size(max=100) String previewToken) { }
}
