package com.aiclub.platform.dto;

/** 用户版本发布展示确认结果。 */
public record PlatformReleaseAcknowledgeResult(Long releaseId, boolean viewed) {
}
