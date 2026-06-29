package com.aiclub.platform.dto;

import java.util.List;

/**
 * GitLab 仓库同步 API 到 API Studio 后返回给前端的结果摘要。
 */
public record GitlabApiSyncResult(
        /**
         * GitLab 绑定 ID。
         */
        Long bindingId,
        /**
         * 平台项目 ID。
         */
        Long projectId,
        /**
         * 实际同步的 Git 分支。
         */
        String branch,
        /**
         * 本次读取到的仓库提交 SHA。
         */
        String commitSha,
        /**
         * code-processing 扫描的 Java 文件数量。
         */
        int scannedCount,
        /**
         * 新建的接口数量。
         */
        int createdCount,
        /**
         * 更新的接口数量。
         */
        int updatedCount,
        /**
         * 删除的过期平台生成请求数量。
         */
        int deletedCount,
        /**
         * 未变更或被跳过的接口数量。
         */
        int skippedCount,
        /**
         * 抽取和同步过程中的非阻断告警。
         */
        List<String> warnings,
        /**
         * 同步完成时间。
         */
        String syncedAt
) {
}
