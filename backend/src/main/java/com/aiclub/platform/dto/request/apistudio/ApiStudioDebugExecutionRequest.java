package com.aiclub.platform.dto.request.apistudio;

import java.util.List;
import java.util.Map;

/**
 * 调试执行请求。
 * 前端只能提交 environmentId 和临时覆盖字段，禁止直接传完整 URL。
 */
public record ApiStudioDebugExecutionRequest(
        Long environmentId,
        Map<String, String> pathOverrides,
        Map<String, String> queryOverrides,
        Map<String, String> headerOverrides,
        String requestBodyType,
        String requestBody,
        List<FormFieldOverride> formOverrides,
        Map<String, String> variableOverrides
) {

    public record FormFieldOverride(String name, String value, Boolean file) {
    }
}
