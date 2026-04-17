package com.aiclub.platform.dto;

public record ModelTestResult(
        Long id,
        String name,
        /**
         * 返回模型类型，便于前端区分当前测试的是对话模型还是 Embedding 模型。
         */
        String modelType,
        String provider,
        String modelName,
        Boolean success,
        String message,
        String testedAt
) {
}
