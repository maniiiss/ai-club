package com.aiclub.platform.dto;

/**
 * AI 生成的接口断言建议，后续 API 自动化执行器可按该结构扩展为确定性断言。
 */
public record ApiTestAssertionSuggestion(
        String type,
        String target,
        String operator,
        String expected,
        String description
) {
}
