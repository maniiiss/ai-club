package com.aiclub.platform.dto.apistudio;

/**
 * 原生 API 工作台 - 环境变量。
 * secret=true 时 value 字段返回掩码字符串（"***"），不暴露密文。
 */
public record ApiStudioEnvironmentVariableItem(
        Long id,
        String name,
        String value,
        Boolean secret,
        String description
) {
}
