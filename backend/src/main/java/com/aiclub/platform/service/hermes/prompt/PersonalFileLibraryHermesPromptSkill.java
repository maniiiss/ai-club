package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * Hermes 个人文件库 Skill。
 * 业务意图：当用户显式询问自己上传的文档、简历或述职报告时，优先让 Hermes 使用个人文件库证据。
 */
@Component
public class PersonalFileLibraryHermesPromptSkill extends AbstractHermesPromptSkill {

    private static final String RESOURCE_PATH = "prompts/hermes/skills/personal-file-library.md";

    public PersonalFileLibraryHermesPromptSkill(HermesPromptResourceLoader resourceLoader) {
        super(resourceLoader, RESOURCE_PATH);
    }

    @Override
    public String code() {
        return "personal-file-library";
    }

    @Override
    public int order() {
        return 150;
    }

    @Override
    public boolean matches(HermesSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasSlashCommand("/文件库")
                || containsAny(context.question(),
                "我的文档",
                "我上传的文档",
                "个人文件库",
                "文件库",
                "我的文件",
                "我的简历",
                "简历",
                "述职报告",
                "年终述职",
                "年终总结");
    }
}
