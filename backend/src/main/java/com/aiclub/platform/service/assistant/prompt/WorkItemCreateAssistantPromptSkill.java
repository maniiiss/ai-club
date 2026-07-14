package com.aiclub.platform.service.assistant.prompt;

import org.springframework.stereotype.Component;

/**
 * 工作项创建 Skill。
 * 只有用户通过 Slash 菜单显式选择 /需求 时启用。
 */
@Component
public class WorkItemCreateAssistantPromptSkill extends AbstractAssistantPromptSkill {

    private static final String RESOURCE_PATH = "prompts/assistant/skills/work-item-create.md";

    public WorkItemCreateAssistantPromptSkill(AssistantPromptResourceLoader resourceLoader) {
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
    public boolean matches(AssistantSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/需求");
    }
}
