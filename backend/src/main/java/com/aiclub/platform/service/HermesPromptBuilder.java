package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.request.HermesChatRequest;
import org.springframework.stereotype.Service;

/**
 * 统一维护 Hermes 的系统提示词与用户提示词拼装逻辑。
 */
@Service
public class HermesPromptBuilder {

    /**
     * 基于当前用户、角色和业务上下文生成对 Hermes 的最终输入。
     */
    public HermesPrompt build(CurrentUserInfo currentUser,
                              HermesContextAssembler.HermesConversationContext context,
                              HermesChatRequest request) {
        String roleName = context.roleName() == null || context.roleName().isBlank() ? "协作成员" : context.roleName().trim();
        String userName = currentUser == null ? "当前用户"
                : (currentUser.nickname() != null && !currentUser.nickname().isBlank() ? currentUser.nickname().trim() : currentUser.username().trim());

        String systemPrompt = """
                你是 Git AI Club 平台内置的 Hermes 协作助手。
                你的职责是基于平台提供的项目、任务、通知和评论摘要，帮助用户快速理解上下文、识别风险并给出下一步建议。

                回答规则：
                1. 仅基于当前输入中的上下文作答，不要臆造平台里不存在的数据。
                2. 如果上下文不足以支撑结论，要直接说明“当前上下文不足”，并提示用户去查看哪些对象。
                3. 回答必须使用中文，优先先给结论，再给依据，再给下一步建议。
                4. 回答风格需要感知用户角色：项目经理更关注进度与风险，产品更关注需求背景与决策，开发更关注任务背景与变更影响，总监更关注整体健康度与关键阻塞。
                5. 不要输出权限之外的数据，不要假装已经读取到未提供的完整数据库。
                """;

        String userPrompt = """
                当前提问用户：%s
                当前角色：%s
                当前路由：%s

                以下是平台整理后的可见上下文：
                %s

                用户问题：
                %s
                """.formatted(
                userName,
                roleName,
                request.routeName().trim(),
                context.contextMarkdown(),
                request.question().trim()
        );
        return new HermesPrompt(systemPrompt, userPrompt);
    }

    /**
     * Hermes 调用所需的提示词载体。
     */
    public record HermesPrompt(String systemPrompt, String userPrompt) {
    }
}
