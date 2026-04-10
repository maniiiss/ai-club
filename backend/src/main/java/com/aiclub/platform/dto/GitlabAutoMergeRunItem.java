package com.aiclub.platform.dto;

public record GitlabAutoMergeRunItem(
        Long iid,
        String title,
        String action,
        String message,
        String webUrl
) {
}
