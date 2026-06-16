package com.aiclub.platform.dto;

/**
 * 轻量进度视图，专供前端轮询使用，避免每次拉详情时都触发指标行查询。
 */
public record ModelBenchmarkProgressView(
        Long id,
        String status,
        Integer progressTotal,
        Integer progressDone,
        String errorMessage
) {
}
