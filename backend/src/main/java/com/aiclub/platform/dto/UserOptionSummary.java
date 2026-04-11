package com.aiclub.platform.dto;

/**
 * 用户选项轻量摘要，供负责人、协作者等前端选择器和列表展示复用。
 */
public record UserOptionSummary(
        Long id,
        String username,
        String nickname,
        /**
         * 用户头像地址，前端可直接用于列表和选择器头像展示。
         */
        String avatarUrl,
        boolean enabled
) {
}
