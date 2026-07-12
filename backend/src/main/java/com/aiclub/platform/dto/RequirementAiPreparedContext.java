package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * 一次性准备完成的需求 AI 上下文，主模型重试或兜底提示词必须复用同一实例。
 */
public record RequirementAiPreparedContext(
        String markdown,
        List<RequirementAiImageRef> images,
        Map<String, Object> stats,
        List<String> warnings
) {
    public RequirementAiPreparedContext {
        markdown = markdown == null ? "" : markdown;
        images = images == null ? List.of() : List.copyOf(images);
        stats = stats == null ? Map.of() : Map.copyOf(stats);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
