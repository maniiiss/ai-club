package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * Wiki 问答 Skill。
 * 只有用户通过 Slash 菜单显式选择 /wiki 时启用。
 */
@Component
public class WikiQaHermesPromptSkill extends AbstractHermesPromptSkill {

    private static final String RESOURCE_PATH = "prompts/hermes/skills/wiki-qa.md";

    public WikiQaHermesPromptSkill(HermesPromptResourceLoader resourceLoader) {
        super(resourceLoader, RESOURCE_PATH);
    }

    @Override
    public String code() {
        return "wiki-qa";
    }

    @Override
    public int order() {
        return 100;
    }

    @Override
    public boolean matches(HermesSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/wiki");
    }
}
