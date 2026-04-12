package com.aiclub.platform.dto;

import java.util.List;

/**
 * 多候选歧义时展示给用户的选择卡片。
 * 只有用户显式选择后，平台才会把对象绑定回 grounding 状态并继续回答。
 */
public record HermesSelectionCard(
        String slot,
        String title,
        String description,
        String resumeQuestion,
        List<HermesSelectionOption> options
) {
}
