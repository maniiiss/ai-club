package com.aiclub.platform.service.assistant.prompt;

/**
 * Assistant 内置 Skill SPI。
 * 每个 Skill 只负责判断“当前问题是否适合加载自己”以及返回对应的系统提示词片段。
 */
public interface AssistantPromptSkill {

    /**
     * Skill 唯一编码，用于在最终提示词里标识已启用能力。
     */
    String code();

    /**
     * 控制多个 Skill 在 system prompt 中的稳定输出顺序。
     */
    int order();

    /**
     * 判断当前上下文是否命中该 Skill。
     */
    boolean matches(AssistantSkillContext context);

    /**
     * 渲染当前 Skill 的系统提示词片段。
     */
    String renderSystemFragment(AssistantSkillContext context);
}
