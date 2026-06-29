package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * AI 测试用例生成数据源抽象。
 * 解耦 {@link ApiTestCaseAiService} 与具体接口管理实现（旧 Yaade vs 原生 API Studio）。
 *
 * 实现需返回一个 mimic 旧 Yaade {@code data} 形态的 JsonNode（含 name/method/uri/description/
 * contentType/headers/params/formDataBody/auth/body/aiclubSync），以保证脱敏/Prompt 逻辑 0 改动。
 */
public interface ApiTestContextSource {

    /**
     * 加载并校验单个接口的生成上下文。projectId 与 endpointId/requestId 必须配对存在且当前用户可见。
     */
    ApiTestGenerationContext requireContext(Long projectId, Long endpointId);

    /**
     * 测试用例生成所需的最小上下文。
     */
    record ApiTestGenerationContext(
            ProjectEntity project,
            Long endpointId,
            String collectionPath,
            JsonNode requestData
    ) {
    }
}
