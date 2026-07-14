package com.aiclub.platform.service.assistant.prompt;

import org.springframework.stereotype.Component;

/**
 * Wiki 问答 Skill。
 * 只有用户通过 Slash 菜单显式选择 /wiki 时启用。
 */
@Component
public class WikiQaAssistantPromptSkill extends AbstractAssistantPromptSkill {

    private static final String RESOURCE_PATH = "prompts/assistant/skills/wiki-qa.md";

    public WikiQaAssistantPromptSkill(AssistantPromptResourceLoader resourceLoader) {
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
    public boolean matches(AssistantSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/wiki");
    }
}
