package com.aiclub.platform.dto;

/**
 * 项目只读分享页对外暴露的流水线摘要。
 *
 * <p>同时承载 Woodpecker（AI Club 内置流水线）与 Jenkins（项目流水线绑定）两类来源，
 * 公开页据此渲染流水线选择列表。仅暴露非敏感字段：</p>
 * <ul>
 *     <li>{@code id} 流水线主键，配合 {@code kind} 唯一定位一条流水线</li>
 *     <li>{@code kind} 来源类型，目前仅 {@code WOODPECKER} 与 {@code JENKINS}</li>
 *     <li>{@code name} 流水线展示名称（Jenkins 取 jobName）</li>
 *     <li>{@code defaultBranch} 默认构建分支，可空</li>
 *     <li>{@code lastStatus} 最近一次运行状态，可空</li>
 *     <li>{@code lastTriggeredAt} 最近一次触发时间，已格式化字符串</li>
 *     <li>{@code lastUrl} 最近一次运行外链，前端只读跳转</li>
 * </ul>
 */
public record ProjectPublicPipelineSummary(
        Long id,
        String kind,
        String name,
        String defaultBranch,
        String lastStatus,
        String lastTriggeredAt,
        String lastUrl
) {
}
