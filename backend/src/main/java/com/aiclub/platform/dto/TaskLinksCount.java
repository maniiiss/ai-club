package com.aiclub.platform.dto;

/**
 * 工作项详情页关联角标的轻量计数。
 * 与 {@link TaskLinksSummary} 不同，只返回各关联类型的数量，供前端角标即时展示，
 * 避免为显示角标而加载完整关联列表（children/related/testCases/attachments 的整表 + N+1 汇总）。
 */
public record TaskLinksCount(
        long children,
        long parentWorkItems,
        long relatedWorkItems,
        long testCases,
        long attachments
) {
}