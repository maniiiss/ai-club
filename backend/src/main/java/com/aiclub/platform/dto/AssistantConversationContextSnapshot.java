package com.aiclub.platform.dto;

import com.aiclub.platform.service.AssistantContextAssembler;

import java.util.List;

/**
 * Assistant 会话当前页面上下文的可持久化快照。
 * 后端内部 MCP 执行链路会复用它恢复项目、任务和建议信息。
 */
public record AssistantConversationContextSnapshot(
        String sceneCode,
        Long projectId,
        Long taskId,
        Long wikiSpaceId,
        Long wikiPageId,
        String roleName,
        List<AssistantReferenceSummary> references,
        List<String> suggestions,
        String contextMarkdown
) {

    public AssistantConversationContextSnapshot {
        references = references == null ? List.of() : List.copyOf(references);
        suggestions = suggestions == null ? List.of() : List.copyOf(suggestions);
        contextMarkdown = contextMarkdown == null ? "" : contextMarkdown.trim();
        roleName = roleName == null ? "" : roleName.trim();
        sceneCode = sceneCode == null ? "" : sceneCode.trim();
    }

    /**
     * 从上下文装配结果构造可持久化快照。
     */
    public static AssistantConversationContextSnapshot fromContext(AssistantContextAssembler.AssistantConversationContext context) {
        if (context == null) {
            return new AssistantConversationContextSnapshot("", null, null, null, null, "", List.of(), List.of(), "");
        }
        return new AssistantConversationContextSnapshot(
                context.sceneCode(),
                context.projectId(),
                context.taskId(),
                context.wikiSpaceId(),
                context.wikiPageId(),
                context.roleName(),
                context.references(),
                context.suggestions(),
                context.contextMarkdown()
        );
    }

    /**
     * 将持久化快照恢复为上下文装配器使用的上下文对象。
     */
    public AssistantContextAssembler.AssistantConversationContext toContext() {
        return new AssistantContextAssembler.AssistantConversationContext(
                sceneCode,
                projectId,
                taskId,
                wikiSpaceId,
                wikiPageId,
                roleName,
                references,
                suggestions,
                contextMarkdown
        );
    }
}
