package com.aiclub.platform.dto;

import java.util.List;

/**
 * Wiki 左侧页面树节点。
 */
public record WikiPageTreeNode(
        Long id,
        Long parentPageId,
        String title,
        String slug,
        String visibilityScope,
        boolean canEdit,
        List<WikiPageTreeNode> children
) {
    public WikiPageTreeNode {
        children = children == null ? List.of() : List.copyOf(children);
    }
}
