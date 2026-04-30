package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * 迭代发版总结 Skill。
 * 当用户在迭代详情中询问发版内容、缺陷修复数量、需求交付清单等汇总问题时启用。
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
        String question = context.question();
        boolean inIterationScene = "project-iterations".equals(context.sceneCode())
                || context.hasReferenceType("ITERATION")
                || context.hasGroundingEntityType("ITERATION");
        boolean hasIterationTopic = containsAny(question, "迭代", "发版", "发布", "上线", "版本内容");
        boolean hasSummaryIntent = containsAny(question, "总结", "汇总", "概览", "修复", "开发了哪些", "发了哪些", "内容");
        boolean hasWorkItemAggregateIntent = containsAny(question, "需求", "缺陷", "任务", "工作项");
        return inIterationScene && hasIterationTopic && (hasSummaryIntent || hasWorkItemAggregateIntent);
    }
}
