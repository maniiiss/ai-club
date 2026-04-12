package com.aiclub.platform.dto;

import com.aiclub.platform.service.HermesContextAssembler;

import java.util.List;

/**
 * Hermes 会话当前页面上下文的可持久化快照。
 * 后端内部 MCP 执行链路会复用它恢复项目、任务和建议信息。
 */
public record HermesConversationContextSnapshot(
        String sceneCode,
        Long projectId,
        Long taskId,
        String roleName,
        List<HermesReferenceSummary> references,
        List<String> suggestions,
        String contextMarkdown
) {

    public HermesConversationContextSnapshot {
        references = references == null ? List.of() : List.copyOf(references);
        suggestions = suggestions == null ? List.of() : List.copyOf(suggestions);
        contextMarkdown = contextMarkdown == null ? "" : contextMarkdown.trim();
        roleName = roleName == null ? "" : roleName.trim();
        sceneCode = sceneCode == null ? "" : sceneCode.trim();
    }

    /**
     * 从上下文装配结果构造可持久化快照。
     */
    public static HermesConversationContextSnapshot fromContext(HermesContextAssembler.HermesConversationContext context) {
        if (context == null) {
            return new HermesConversationContextSnapshot("", null, null, "", List.of(), List.of(), "");
        }
        return new HermesConversationContextSnapshot(
                context.sceneCode(),
                context.projectId(),
                context.taskId(),
                context.roleName(),
                context.references(),
                context.suggestions(),
                context.contextMarkdown()
        );
    }

    /**
     * 将持久化快照恢复为上下文装配器使用的上下文对象。
     */
    public HermesContextAssembler.HermesConversationContext toContext() {
        return new HermesContextAssembler.HermesConversationContext(
                sceneCode,
                projectId,
                taskId,
                roleName,
                references,
                suggestions,
                contextMarkdown
        );
    }
}
