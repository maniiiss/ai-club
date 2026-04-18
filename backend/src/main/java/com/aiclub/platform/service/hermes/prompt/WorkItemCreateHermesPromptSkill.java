package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * 工作项创建 Skill。
 * 当用户意图是“创建需求/任务/缺陷”这类写操作时启用。
 */
@Component
public class WorkItemCreateHermesPromptSkill extends AbstractHermesPromptSkill {

    private static final String RESOURCE_PATH = "prompts/hermes/skills/work-item-create.md";

    public WorkItemCreateHermesPromptSkill(HermesPromptResourceLoader resourceLoader) {
        super(resourceLoader, RESOURCE_PATH);
    }

    @Override
    public String code() {
        return "work-item-create";
    }

    @Override
    public int order() {
        return 200;
    }

    @Override
    public boolean matches(HermesSkillContext context) {
        if (context == null) {
            return false;
        }
        String question = context.question();
        boolean hasCreateAction = containsAny(question, "创建", "新建", "新增", "提一个", "提个", "建一个", "建个");
        boolean hasWorkItemTarget = containsAny(question, "需求", "任务", "缺陷", "bug", "负责人", "指派");
        boolean hasBoundBusinessObject = context.hasReferenceType("PROJECT")
                || context.hasReferenceType("TASK")
                || context.hasGroundingEntityType("WORK_ITEM")
                || context.hasGroundingEntityType("PROJECT");
        return (hasCreateAction && hasWorkItemTarget)
                || (hasWorkItemTarget && containsAny(question, "负责人", "指派") && hasBoundBusinessObject);
    }
}
