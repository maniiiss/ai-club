package com.aiclub.platform.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 提供给 Hermes 原生 tool calling 的平台工具定义。
 * 这里同时保留平台内部工具编码与对外函数名，避免直接把带点号的编码暴露给模型。
 */
public record HermesCallableTool(
        String toolCode,
        String functionName,
        String displayName,
        String description,
        boolean readOnly,
        boolean requiresConfirm,
        JsonNode parameters
) {
}
