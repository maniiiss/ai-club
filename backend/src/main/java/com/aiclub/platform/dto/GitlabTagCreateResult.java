package com.aiclub.platform.dto;

/**
 * 创建 GitLab Tag 后返回给前端的结果摘要。
 *
 * @param projectName 平台项目名称
 * @param projectRef GitLab 项目标识
 * @param branchName 创建 Tag 时指定的来源分支
 * @param tagName Tag 名称
 * @param message Tag 备注说明
 * @param targetSha Tag 指向的提交 SHA
 * @param protectedTag 是否为受保护 Tag
 * @param webUrl Tag 页面链接
 * @param createdAt 创建时间
 */
public record GitlabTagCreateResult(
        String projectName,
        String projectRef,
        String branchName,
        String tagName,
        String message,
        String targetSha,
        Boolean protectedTag,
        String webUrl,
        String createdAt
) {
}
