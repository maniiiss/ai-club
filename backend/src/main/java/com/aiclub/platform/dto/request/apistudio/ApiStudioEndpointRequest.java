package com.aiclub.platform.dto.request.apistudio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 创建/编辑 API 请求。
 * revision 用于乐观锁，前端编辑时回传当前版本号，服务端校验避免并发覆盖。
 */
public record ApiStudioEndpointRequest(
        Long directoryId,
        @NotBlank @Size(max = 255) String name,
        @NotBlank String method,
        @NotBlank String path,
        String summary,
        String descriptionMarkdown,
        String status,
        String requestBodyType,
        String requestBodySchemaJson,
        String requestBodyExample,
        Integer sortOrder,
        Integer revision,
        List<ApiStudioParameterPayload> parameters,
        List<ApiStudioResponsePayload> responses,
        String changeSummary
) {
}
