package com.aiclub.platform.dto;

public record UploadedFileSummary(
        String url,
        String fileName,
        long size
) {
}
