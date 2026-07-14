package com.aiclub.platform.service.assistant.prompt;

import org.springframework.stereotype.Component;

/**
 * 迭代发版总结 Skill。
 * 作为执行任务类业务回答的一部分，只有用户显式选择 /执行任务 时启用。
 */
@Component
public class IterationReleaseSummaryAssistantPromptSkill extends AbstractAssistantPromptSkill {

    private static final String RESOURCE_PATH = "prompts/assistant/skills/iteration-release-summary.md";

    public IterationReleaseSummaryAssistantPromptSkill(AssistantPromptResourceLoader resourceLoader) {
        super(resourceLoader, RESOURCE_PATH);
    }

    @Override
    public String code() {
        return "iteration-release-summary";
    }

    @Override
    public int order() {
        return 180;
    }

    @Override
    public boolean matches(AssistantSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/执行任务");
    }
}
