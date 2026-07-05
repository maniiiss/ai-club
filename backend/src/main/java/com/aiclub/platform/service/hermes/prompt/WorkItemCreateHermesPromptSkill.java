package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * 工作项创建 Skill。
 * 只有用户通过 Slash 菜单显式选择 /需求 时启用。
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
        return context.hasSlashCommand("/需求");
    }
}
