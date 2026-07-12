package com.aiclub.platform.dto;

/**
 * 提交需求 AI 执行时保存的工作项文本快照，避免后台执行期间用户编辑导致提示词语义漂移。
 */
public record RequirementAiTaskSnapshot(
        Long taskId,
        String action,
        String name,
        String workItemType,
        String taskType,
        String projectName,
        String iterationName,
        String status,
        String priority,
        String prototypeUrl,
        String description,
        String requirementMarkdown,
        String requirementTaskName,
        String requirementTaskDescription
) {
    public RequirementAiTaskSnapshot {
        requirementMarkdown = requirementMarkdown == null ? "" : requirementMarkdown;
    }

    /** 兼容早期调用方；新增的需求模板 Markdown 默认按空文本处理。 */
    public RequirementAiTaskSnapshot(Long taskId,
                                     String action,
                                     String name,
                                     String workItemType,
                                     String taskType,
                                     String projectName,
                                     String iterationName,
                                     String status,
                                     String priority,
                                     String prototypeUrl,
                                     String description,
                                     String requirementTaskName,
                                     String requirementTaskDescription) {
        this(taskId, action, name, workItemType, taskType, projectName, iterationName, status, priority,
                prototypeUrl, description, "", requirementTaskName, requirementTaskDescription);
    }
}
