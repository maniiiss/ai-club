package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * 执行任务查询 Skill。
 * 只有用户通过 Slash 菜单显式选择 /执行任务 时启用。
 */
@Component
public class ExecutionTaskQueryHermesPromptSkill extends AbstractHermesPromptSkill {

    private static final String RESOURCE_PATH = "prompts/hermes/skills/execution-task-query.md";

    public ExecutionTaskQueryHermesPromptSkill(HermesPromptResourceLoader resourceLoader) {
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
    public boolean matches(HermesSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/执行任务");
    }
}
