package com.aiclub.platform.service.hermes.prompt;

import com.aiclub.platform.dto.request.HermesChatRequest;
import org.springframework.stereotype.Component;

/**
 * Wiki 问答 Skill。
 * 当前场景已锚定 Wiki，或问题明显指向页面/空间知识时自动启用。
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
        HermesChatRequest request = context.request();
        if (request != null && (request.wikiSpaceId() != null || request.wikiPageId() != null)) {
            return true;
        }
        return containsAny(context.sceneCode(), "wiki")
                || context.hasReferenceType("WIKI_SPACE")
                || context.hasReferenceType("WIKI_PAGE")
                || containsAny(context.question(), "wiki", "当前页", "本页", "页面", "知识库", "知识", "空间", "文档");
    }
}
