package com.aiclub.platform.dto;

import java.util.List;

/**
 * 当工具查询命中多个候选对象时，返回给前端的单个可选项。
 */
public record AssistantSelectionOption(
        String slot,
        String entityType,
        Long entityId,
        String title,
        String subtitle,
        String route,
        double matchScore,
        List<String> matchReasons
) {
}
