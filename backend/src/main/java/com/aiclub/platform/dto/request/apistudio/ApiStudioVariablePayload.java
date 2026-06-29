package com.aiclub.platform.dto.request.apistudio;

/**
 * 环境变量 Payload。
 * value 为 null 表示前端未修改；值为空字符串表示清空。
 */
public record ApiStudioVariablePayload(
        Long id,
        String name,
        String value,
        Boolean secret,
        String description
) {
}
