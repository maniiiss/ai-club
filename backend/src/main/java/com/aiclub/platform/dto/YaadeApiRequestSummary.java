package com.aiclub.platform.dto;

/**
 * Yaade 项目内 REST 请求摘要，用于平台侧 AI 测试用例抽屉选择单个接口。
 */
public record YaadeApiRequestSummary(
        Long requestId,
        Long collectionId,
        String collectionPath,
        String name,
        String method,
        String path
) {
}
