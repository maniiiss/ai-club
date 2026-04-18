package com.aiclub.platform.service.hermes.prompt;

import java.util.Locale;

/**
 * Hermes 内置 Skill 抽象基类。
 * 负责统一加载 Markdown 提示词资源，以及提供常用的关键词匹配辅助方法。
 */
public abstract class AbstractHermesPromptSkill implements HermesPromptSkill {

    private final String promptMarkdown;

    protected AbstractHermesPromptSkill(HermesPromptResourceLoader resourceLoader, String resourcePath) {
        this.promptMarkdown = resourceLoader.readRequiredMarkdown(resourcePath);
    }

    @Override
    public String renderSystemFragment(HermesSkillContext context) {
        return promptMarkdown;
    }

    protected boolean containsAny(String value, String... keywords) {
        if (value == null || value.isBlank() || keywords == null || keywords.length == 0) {
            return false;
        }
        String normalized = value.toLowerCase(Locale.ROOT);
        for (String keyword : keywords) {
            if (keyword != null && !keyword.isBlank() && normalized.contains(keyword.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }
}
