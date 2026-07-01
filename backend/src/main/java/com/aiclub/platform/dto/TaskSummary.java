package com.aiclub.platform.dto;

import java.math.BigDecimal;
import java.util.List;

public record TaskSummary(
        Long id,
        /**
         * 工作项编号，由系统自动生成。
         */
        String workItemCode,
        String name,
        String workItemType,
        Long creatorUserId,
        /**
         * 创建人展示名称。
         */
        String creatorName,
        String status,
        String priority,
        String assignee,
        Long assigneeUserId,
        List<Long> collaboratorUserIds,
        List<String> collaboratorNames,
        /**
         * 工作项计划开始日期。
         */
        String planStartDate,
        /**
         * 工作项计划结束日期。
         */
        String planEndDate,
        /**
         * 创建时间。
         */
        String createdAt,
        String updatedAt,
        String description,
        /**
         * 需求模板 Markdown 文档。
         */
        String requirementMarkdown,
        /**
         * 原型链接。
         */
        String prototypeUrl,
        /**
         * 需求所属模块。
         */
        String moduleName,
        /**
         * PRD 投影状态：PENDING、READY、FAILED。
         */
        String prdStatus,
        /**
         * PRD 状态说明，主要用于初始化失败或待处理提示。
         */
        String prdStatusMessage,
        /**
         * PRD 所在 Wiki 空间ID。
         */
        Long prdWikiSpaceId,
        /**
         * PRD 所在目录ID。
         */
        Long prdWikiDirectoryId,
        /**
         * PRD 主页面ID。
         */
        Long prdWikiPageId,
        /**
         * 当前需求是否已开发通过。
         */
        boolean devPassed,
        /**
         * 当前需求是否已测试通过。
         */
        boolean testPassed,
        /**
         * 关联需求是否已开发通过。
         */
        Boolean requirementDevPassed,
        /**
         * 关联需求是否已测试通过。
         */
        Boolean requirementTestPassed,
        /**
         * 任务工时，单位为小时。
         */
        BigDecimal workHours,
        Long projectId,
        String projectName,
        Long agentId,
        String agentName,
        Long iterationId,
        String iterationName,
        Long requirementTaskId,
        String requirementTaskName,
        /**
         * 外部来源系统编码，当前同步场景下可能为 GITEE。
         */
        String externalSource,
        /**
         * 外部来源系统中的主键ID快照，供前端展示“来自 Gitee #123”等只读标识。
         */
        String externalRemoteId,
        /**
         * 外部来源系统中的跳转链接。
         */
        String externalRemoteUrl,
        boolean canDelete
) {
}
