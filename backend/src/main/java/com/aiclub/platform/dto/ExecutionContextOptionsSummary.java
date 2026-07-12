package com.aiclub.platform.dto;

/** 执行创建弹窗使用的需求与技术设计上下文可用性摘要，不返回正文内容。 */
public record ExecutionContextOptionsSummary(
        boolean requirementLinked,
        Long requirementTaskId,
        String requirementTaskCode,
        String requirementTaskName,
        boolean technicalDesignAvailable,
        Long technicalDesignArtifactId,
        Long technicalDesignExecutionTaskId,
        String technicalDesignWorkItemName,
        String technicalDesignCreatedAt,
        String requirementNotice,
        String technicalDesignNotice
) {
}
