package com.aiclub.platform.dto;

/**
 * GitLab 分支摘要，用于前端分支下拉选择。
 *
 * @param name 分支名称
 * @param defaultBranch 是否为默认分支
 * @param protectedBranch 是否为受保护分支
 * @param merged 是否已经合入默认分支
 * @param webUrl 分支详情链接
 */
public record GitlabBranchSummary(
        String name,
        Boolean defaultBranch,
        Boolean protectedBranch,
        Boolean merged,
        String webUrl
) {
}
