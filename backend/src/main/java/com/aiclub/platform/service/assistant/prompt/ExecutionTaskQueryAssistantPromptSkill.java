package com.aiclub.platform.service.assistant.prompt;

import org.springframework.stereotype.Component;

/**
 * 执行任务查询 Skill。
 * 只有用户通过 Slash 菜单显式选择 /执行任务 时启用。
 */
@Component
public class ExecutionTaskQueryAssistantPromptSkill extends AbstractAssistantPromptSkill {

    private static final String RESOURCE_PATH = "prompts/assistant/skills/execution-task-query.md";

    public ExecutionTaskQueryAssistantPromptSkill(AssistantPromptResourceLoader resourceLoader) {
        super(resourceLoader, RESOURCE_PATH);
    }

    @Override
    public String code() {
        return "execution-task-query";
    }

    @Override
    public int order() {
        return 400;
    }

    @Override
    public boolean matches(AssistantSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/执行任务");
    }
}
