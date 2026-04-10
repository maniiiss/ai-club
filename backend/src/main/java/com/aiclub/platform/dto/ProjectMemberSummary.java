package com.aiclub.platform.dto;

/**
 * 项目列表成员轻量摘要，仅用于列表头像与浮层展示。
 */
public record ProjectMemberSummary(
        Long id,
        String name,
        /* 成员头像访问地址，为空时前端回退显示姓名首字。 */
        String avatarUrl
) {
}
