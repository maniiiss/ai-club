package com.aiclub.platform.dto;

/** 执行任务创建时固化的单步执行器与仓库快照，后续编排修改不会改变该记录。 */
public record ExecutionResolvedBindingSummary(
        Integer stepNo,
        String stepCode,
        String stepName,
        Long agentId,
        String agentName,
        String accessType,
        String runtimeType,
        String runtimeRegistryCode,
        Long profileVersion,
        Integer timeoutSeconds,
        Long repositoryBindingId,
        String repositoryTargetBranch,
        String repositoryDisplayName
) {}
