package com.aiclub.platform.service.hermes.prompt;

import org.springframework.stereotype.Component;

/**
 * 执行任务查询 Skill。
 * 统一约束扫描结果、执行任务详情、日志/产物读取及重试/取消动作的处理方式。
 */
@Component
public class ExecutionTaskQueryHermesPromptSkill extends AbstractHermesPromptSkill {

    private static final String RESOURCE_PATH = "prompts/hermes/skills/execution-task-query.md";

    public ExecutionTaskQueryHermesPromptSkill(HermesPromptResourceLoader resourceLoader) {
        super(resourceLoader, RESOURCE_PATH);
    }

    @Override
    public String code() {
        return "execution-task-query";
    }

    @Override
    public int order() {
        return 400;
    }

    @Override
    public boolean matches(HermesSkillContext context) {
        if (context == null) {
            return false;
        }
        return context.hasReferenceType("EXECUTION_TASK")
                || context.hasGroundingEntityType("EXECUTION_TASK")
                || containsAny(context.question(), "扫描结果", "执行任务", "运行结果", "日志", "产物", "重试", "取消", "execution");
    }
}
