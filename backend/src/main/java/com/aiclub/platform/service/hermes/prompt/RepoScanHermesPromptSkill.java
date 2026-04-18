package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * 仓库扫描 Skill。
 * 面向 GitLab 绑定、规则集选择和仓库规范扫描发起场景。
 */
@Component
public class RepoScanHermesPromptSkill extends AbstractHermesPromptSkill {

    private static final String RESOURCE_PATH = "prompts/hermes/skills/repo-scan.md";

    public RepoScanHermesPromptSkill(HermesPromptResourceLoader resourceLoader) {
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
    public boolean matches(HermesSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasReferenceType("GITLAB_BINDING")
                || context.hasGroundingEntityType("GITLAB_BINDING")
                || containsAny(context.question(), "仓库", "repo", "扫描", "规则集", "规范检查", "代码扫描", "仓库规范");
    }
}
