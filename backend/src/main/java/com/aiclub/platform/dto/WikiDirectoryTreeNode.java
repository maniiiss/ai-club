package com.aiclub.platform.dto;

import java.util.List;

/**
 * Wiki 目录树节点，包含子目录和目录下页面。
 */
public record WikiDirectoryTreeNode(
        Long id,
        Long parentDirectoryId,
        String name,
        String slug,
        String content,
        Long boundProjectId,
        String boundProjectName,
        List<WikiDirectoryTreeNode> children,
        List<WikiSpacePageSummary> pages
) {
    public WikiDirectoryTreeNode {
        children = children == null ? List.of() : List.copyOf(children);
        pages = pages == null ? List.of() : List.copyOf(pages);
    }
}
