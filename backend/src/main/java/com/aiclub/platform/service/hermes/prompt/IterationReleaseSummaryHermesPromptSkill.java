package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * 迭代发版总结 Skill。
 * 作为执行任务类业务回答的一部分，只有用户显式选择 /执行任务 时启用。
 */
@Component
public class IterationReleaseSummaryHermesPromptSkill extends AbstractHermesPromptSkill {

    private static final String RESOURCE_PATH = "prompts/hermes/skills/iteration-release-summary.md";

    public IterationReleaseSummaryHermesPromptSkill(HermesPromptResourceLoader resourceLoader) {
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
    public boolean matches(HermesSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/执行任务");
    }
}
