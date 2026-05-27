package com.aiclub.platform.dto;

import java.util.Map;

/**
 * AI Club Pipeline 修改配置时的编辑上下文。
 * rawContent 始终优先回显仓库中的真实 YAML；当平台能识别模板时，再额外返回 templateCode 与 parameters 供表单回填。
 */
public record AiClubPipelineConfigEditContextResult(
        String branch,
        String configPath,
        String status,
        String rawContent,
        String prefillMode,
        String templateCode,
        Map<String, String> parameters,
        String message
) {
}
