package com.aiclub.platform.dto;

import java.util.List;

/**
 * 单接口 AI 测试用例生成结果，包含 Markdown 总览和结构化用例清单。
 */
public record ApiTestCaseAiResult(
        Long requestId,
        String requestName,
        String method,
        String path,
        String markdown,
        Long modelConfigId,
        String modelConfigName,
        List<ApiTestCaseSuggestion> testCases
) {
}
