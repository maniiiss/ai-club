package com.aiclub.platform.dto;

/**
 * 需求 AI 上下文中的平台图片引用，仅保存受控资产标识，不在任务输入中复制二进制内容。
 */
public record RequirementAiImageRef(
        Long assetId,
        String mediaType,
        String sourceName
) {
}
