package com.aiclub.platform.dto;

/**
 * 创建 Yaade 嵌入会话后返回给前端的入口信息。
 */
public record YaadeEmbedSessionSummary(
        YaadeProjectBindingSummary binding,
        String iframePath,
        boolean createdBinding
) {
}
