package com.aiclub.platform.dto;

import java.util.List;

public record ProjectSummary(
        Long id,
        String name,
        String owner,
        Long ownerUserId,
        Long creatorUserId,
        /* 负责人头像访问地址，为空时前端回退显示负责人首字。 */
        String ownerAvatarUrl,
        List<Long> memberUserIds,
        List<String> memberNames,
        /* 项目成员轻量摘要，供项目管理列表头像与浮层展示复用。 */
        List<ProjectMemberSummary> memberItems,
        String status,
        String description,
        Integer agentCount,
        Integer taskCount,
        Integer repoCount,
        boolean canEdit,
        boolean canDelete
) {
}
