package com.aiclub.platform.dto;

/**
 * 创建 GitLab Merge Request 后返回给前端的结果摘要。
 *
 * @param projectName 平台项目名称
 * @param projectRef GitLab 项目标识
 * @param iid Merge Request 的内部编号
 * @param title Merge Request 标题
 * @param sourceBranch 源分支
 * @param targetBranch 目标分支
 * @param state Merge Request 当前状态
 * @param webUrl Merge Request 页面链接
 * @param createdAt 创建时间
 */
public record GitlabCreateMergeRequestResult(
        String projectName,
        String projectRef,
        Long iid,
        String title,
        String sourceBranch,
        String targetBranch,
        String state,
        String webUrl,
        String createdAt
) {
}
