package com.aiclub.platform.dto.request;

/**
 * 单接口 AI 测试用例生成请求，modelConfigId 为空时使用首个启用的对话模型。
 */
public record YaadeApiTestCaseGenerationRequest(
        Long modelConfigId
) {
}
