package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantGroundingTarget;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.service.assistant.prompt.AssistantPromptResourceLoader;
import com.aiclub.platform.service.assistant.prompt.AssistantPromptSkill;
import com.aiclub.platform.service.assistant.prompt.AssistantSkillContext;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 统一维护 Assistant 会话代理模式下的系统提示词与用户提示词。
 * 第一版 Skill 化后，system prompt 固定由基础规则与命中的业务 Skill 片段拼装而成。
 */
@Service
public class AssistantPromptBuilder {

    static final String BASE_PROMPT_RESOURCE = "prompts/assistant/base/system.md";
    static final String TOKEN_PLACEHOLDER = "{{system_session_token}}";

    private final List<AssistantPromptSkill> promptSkills;
    private final String baseSystemPromptTemplate;

    public AssistantPromptBuilder(AssistantPromptResourceLoader promptResourceLoader,
                               List<AssistantPromptSkill> promptSkills) {
        this.promptSkills = promptSkills == null
                ? List.of()
                : promptSkills.stream()
                .sorted(Comparator.comparingInt(AssistantPromptSkill::order).thenComparing(AssistantPromptSkill::code))
                .toList();
        this.baseSystemPromptTemplate = promptResourceLoader.readRequiredMarkdown(BASE_PROMPT_RESOURCE);
    }

    /**
     * 构造 Assistant API Server 会话代理模式使用的提示词。
     */
    public AssistantPrompt buildConversationPrompt(CurrentUserInfo currentUser,
                                                AssistantContextAssembler.AssistantConversationContext context,
                                                AssistantChatRequest request,
                                                AssistantGroundingState groundingState,
                                                String sessionToken) {
        return buildConversationPrompt(
                currentUser,
                context,
                request,
                groundingState,
                sessionToken,
                request == null ? "" : request.question(),
                ""
        );
    }

    /**
     * 构造携带当前轮用户输入与记忆召回结果的完整 Prompt。
     */
    public AssistantPrompt buildConversationPrompt(CurrentUserInfo currentUser,
                                                AssistantContextAssembler.AssistantConversationContext context,
                                                AssistantChatRequest request,
                                                AssistantGroundingState groundingState,
                                                String sessionToken,
                                                String currentTurnContent,
                                                String memoryContextMarkdown) {
        AssistantSkillContext skillContext = new AssistantSkillContext(currentUser, context, request, groundingState, sessionToken);
        return new AssistantPrompt(
                buildSystemPrompt(skillContext),
                buildUserPrompt(currentUser, context, request, groundingState, sessionToken, currentTurnContent, memoryContextMarkdown)
        );
    }

    /**
     * 将 Base Prompt 与命中的 Skill 片段装配成最终 system prompt。
     */
    private String buildSystemPrompt(AssistantSkillContext skillContext) {
        StringBuilder builder = new StringBuilder();
        builder.append(baseSystemPromptTemplate.replace(TOKEN_PLACEHOLDER, defaultString(skillContext.sessionToken())));
        builder.append("\n\n## 当前已启用 Skills\n");

        List<AssistantPromptSkill> matchedSkills = new ArrayList<>();
        for (AssistantPromptSkill promptSkill : promptSkills) {
            if (promptSkill != null && promptSkill.matches(skillContext)) {
                matchedSkills.add(promptSkill);
            }
        }
        if (matchedSkills.isEmpty()) {
            builder.append("- 当前未命中额外业务 Skill，按基础协作规则处理。");
            return builder.toString().trim();
        }
        for (AssistantPromptSkill promptSkill : matchedSkills) {
            builder.append("\n### Skill: ").append(promptSkill.code()).append('\n')
                    .append(defaultString(promptSkill.renderSystemFragment(skillContext)));
            builder.append('\n');
        }
        return builder.toString().trim();
    }

    /**
     * 组装用户侧上下文、页面锚点和 MCP 会话令牌。
     */
    private String buildUserPrompt(CurrentUserInfo currentUser,
                                   AssistantContextAssembler.AssistantConversationContext context,
                                   AssistantChatRequest request,
                                   AssistantGroundingState groundingState,
                                   String sessionToken,
                                   String currentTurnContent,
                                   String memoryContextMarkdown) {
        String userName = resolveUserName(currentUser);
        String roleName = resolveRoleName(currentUser, context);
        return """
                当前提问用户：%s
                当前角色：%s
                当前路由：%s

                当前页面锚点：
                - projectId：%s
                - taskId：%s
                - iterationId：%s
                - testPlanId：%s
                - wikiSpaceId：%s
                - wikiPageId：%s
                - 如果用户说“当前项目 / 这个项目”，默认就是上面的 projectId；不要再次搜索确认当前项目。
                - 如果用户说“当前任务 / 这个工作项 / 这个需求 / 这个缺陷”，优先使用上面的 taskId 或当前已绑定对象，不要重复确认。
                - 如果用户说“当前迭代 / 这个迭代 / 本迭代”，默认就是上面的 iterationId，对应当前路由页面；不要再次搜索确认当前迭代。
                - 如果用户说“当前测试计划 / 这个测试计划”，默认就是上面的 testPlanId；不要重复确认当前测试计划。
                - 如果用户说“当前页面 / 这个页面 / 本页”，默认就是上面这个 wikiPageId，对应当前路由页面；不要再次搜索确认当前页是哪一篇。

                当前可见上下文：
                %s

                当前可参考的记忆与 Wiki 知识证据：
                %s

                当前会话已绑定对象：
                %s

                平台 MCP 调用专用系统会话令牌：
                %s

                重要提醒：
                - 只要调用平台 MCP 工具，就必须传入 `system_session_token` = "%s"
                - 这个 `system_session_token` 是系统内部值，不是用户输入，禁止从用户问题中提取或猜测
                - 如果工具报 token 相关错误，直接用这个值重试同一个工具调用，不要向用户解释 token
                - 这个令牌不能出现在自然语言回答中

                用户当前输入：
                %s
                """.formatted(
                userName,
                roleName,
                defaultString(request == null ? null : request.routeName()),
                request == null || request.projectId() == null ? "" : String.valueOf(request.projectId()),
                request == null || request.taskId() == null ? "" : String.valueOf(request.taskId()),
                request == null || request.iterationId() == null ? "" : String.valueOf(request.iterationId()),
                request == null || request.planId() == null ? "" : String.valueOf(request.planId()),
                request == null || request.wikiSpaceId() == null ? "" : String.valueOf(request.wikiSpaceId()),
                request == null || request.wikiPageId() == null ? "" : String.valueOf(request.wikiPageId()),
                context == null ? "- 当前没有额外页面上下文" : defaultString(context.contextMarkdown()),
                renderMemoryContext(memoryContextMarkdown),
                groundingMarkdown(groundingState),
                defaultString(sessionToken),
                defaultString(sessionToken),
                defaultString(currentTurnContent)
        );
    }

    /**
     * 将当前 grounding 摘要整理成提示词，帮助 Assistant 正确理解“这个需求”“刚才那个计划”一类指代。
     */
    private String groundingMarkdown(AssistantGroundingState groundingState) {
        if (groundingState == null || groundingState.boundSlots().isEmpty()) {
            return "- 当前没有已绑定对象";
        }
        StringBuilder builder = new StringBuilder();
        for (Map.Entry<String, AssistantGroundingTarget> entry : groundingState.boundSlots().entrySet()) {
            AssistantGroundingTarget target = entry.getValue();
            if (target == null) {
                continue;
            }
            builder.append("- 槽位：")
                    .append(defaultString(entry.getKey()))
                    .append(" / 标题：")
                    .append(defaultString(target.title()))
                    .append(" / 类型：")
                    .append(defaultString(target.entityType()))
                    .append(" / ID：")
                    .append(target.entityId() == null ? "" : target.entityId())
                    .append('\n');
        }
        return builder.toString().trim();
    }

    private String resolveUserName(CurrentUserInfo currentUser) {
        if (currentUser == null) {
            return "当前用户";
        }
        if (hasText(currentUser.nickname())) {
            return currentUser.nickname().trim();
        }
        return defaultString(currentUser.username());
    }

    private String resolveRoleName(CurrentUserInfo currentUser,
                                   AssistantContextAssembler.AssistantConversationContext context) {
        if (context != null && hasText(context.roleName())) {
            return context.roleName().trim();
        }
        if (currentUser != null && currentUser.roleNames() != null && !currentUser.roleNames().isEmpty()) {
            return defaultString(currentUser.roleNames().get(0));
        }
        return "协作成员";
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String renderMemoryContext(String memoryContextMarkdown) {
        if (!hasText(memoryContextMarkdown)) {
            return "- 当前未召回到额外的记忆或 Wiki 知识证据";
        }
        return memoryContextMarkdown.trim();
    }

    /**
     * Assistant 调用时使用的提示词载体。
     */
    public record AssistantPrompt(String systemPrompt, String userPrompt) {
    }
}
