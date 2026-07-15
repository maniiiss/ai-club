package com.aiclub.platform.dto;

import java.time.LocalDateTime;

/** 版本发布完整内容，供管理端预览和公众端弹窗展示。 */
public record PlatformReleaseDetail(
        Long id,
        String version,
        String title,
        String content,
        Long publisherUserId,
        LocalDateTime publishedAt
) {
}
