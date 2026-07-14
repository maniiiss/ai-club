package com.aiclub.platform.service.assistant.prompt;

import org.springframework.stereotype.Component;

/**
 * 仓库扫描 Skill。
 * 只有用户通过 Slash 菜单显式选择 /仓库扫描 时启用。
 */
@Component
public class RepoScanAssistantPromptSkill extends AbstractAssistantPromptSkill {

    private static final String RESOURCE_PATH = "prompts/assistant/skills/repo-scan.md";

    public RepoScanAssistantPromptSkill(AssistantPromptResourceLoader resourceLoader) {
        super(resourceLoader, RESOURCE_PATH);
    }

    @Override
    public String code() {
        return "repo-scan";
    }

    @Override
    public int order() {
        return 300;
    }

    @Override
    public boolean matches(AssistantSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/仓库扫描");
    }
}
