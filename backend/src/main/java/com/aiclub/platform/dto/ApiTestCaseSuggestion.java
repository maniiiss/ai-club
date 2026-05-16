package com.aiclub.platform.dto;

import java.util.List;

/**
 * 单接口 AI 测试用例建议，V1 只用于人工审核和复制导出，不直接执行。
 */
public record ApiTestCaseSuggestion(
        String title,
        String caseType,
        String priority,
        String precondition,
        String requestExample,
        List<ApiTestAssertionSuggestion> assertions,
        String riskNotes
) {
}
