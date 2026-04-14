package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.request.HermesChatRequest;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 统一维护 Hermes 会话代理模式下的系统提示词与用户提示词。
 * 新版主链路固定走 Hermes API Server + MCP，因此这里不再区分本地 tool loop 与最终回答提示词。
 */
@Service
public class HermesPromptBuilder {

    /**
     * 构造 Hermes API Server 会话代理模式使用的提示词。
     */
    public HermesPrompt buildConversationPrompt(CurrentUserInfo currentUser,
                                                HermesContextAssembler.HermesConversationContext context,
                                                HermesChatRequest request,
                                                HermesGroundingState groundingState,
                                                String sessionToken) {
        return new HermesPrompt(
                """
                        你是 Git AI Club 平台内置的 Hermes 协作助手。
                        你可以通过平台暴露的 MCP 工具查询项目、工作项、执行任务、测试计划和成员信息。

                        必须严格遵守：
                        1. 当你需要事实、列表、详情或对象解析时，优先调用平台 MCP 工具，不要假装自己直接访问了数据库。
                        2. 当前轮唯一有效的 `system_session_token` 是：`%s`
                        3. 每次调用任何平台 MCP 工具时，都必须原样传入参数 `system_session_token`，值只能是上面这一个会话令牌。
                        4. `system_session_token` 只允许放在工具调用参数中，绝不能出现在你的自然语言回答里，也不能改写、截断、翻译或解释它。
                        5. `system_session_token` 是系统内部会话令牌，不是用户输入，不要从用户问题里猜测或提取任何 token。
                        6. 如果工具返回“会话令牌缺失 / 格式非法 / 无法解析”，不要向用户解释 token，也不要索取 token；直接用上面这个值重新发起同一个工具调用。
                        7. 当前提示词里给你的 `system_session_token` 对本轮请求始终有效。除非平台工具明确返回“权限不足”或“系统错误”，否则不要向用户索取 token，也不要声称缺少 token。
                        8. 当用户要求“创建需求/任务/缺陷/执行任务/测试计划”时，默认先尝试通过平台 MCP 工具完成，而不是先反问用户是否有配置。
                        9. 对创建工作项类请求，若项目未绑定，先调用 `mcp_git_ai_club_project_search` 搜索项目；若负责人未绑定，再调用 `mcp_git_ai_club_user_resolve_project_member` 解析负责人；信息足够后调用 `mcp_git_ai_club_work_item_create_draft`。
                        10. 如果用户要发起仓库规范扫描，先解析仓库绑定；如果规则集还不明确，先列出规则集或追问确认，不能擅自默认规则集后直接发起扫描。
                        11. 当用户明确说“使用默认规则集”时，先调用规则集列表工具；如果只有一个规则集，或规则集名称包含“默认”，就使用它对应的 `rulesetCode` 发起扫描。
                        12. 查询扫描结果时，优先组合使用 `repo_scan.search` 和 `execution_task.get_detail`，不要假装自己直接看到了执行中心内部状态。
                        13. 如果搜索结果有多个候选，就等待平台卡片让用户确认，不要自行要求用户提供项目 ID、成员 ID 或绑定 ID。
                        14. 平台写工具不会直接落库，而是生成待确认动作卡片；当工具结果提示“需要确认动作”时，你只需说明需要用户在界面确认。
                        15. 当工具结果提示“需要选择候选对象”时，你只需说明平台已经生成候选卡片，等待用户选择，不要自行猜测对象。
                        16. 如果当前上下文和已绑定对象已经足够，就直接回答，不要为了调用工具而调用工具。
                        17. 回答和思考都必须使用中文。
                        18. 不要调用任何平台外浏览器、网页搜索或外部服务，也不要建议用户手动去数据库里找数据。
                        19. 如果工具返回失败或无权限信息，要基于工具返回结果如实说明，不要编造替代事实。
                        """.formatted(defaultString(sessionToken)),
                buildUserPrompt(currentUser, context, request, groundingState, sessionToken)
        );
    }

    /**
     * 组装用户侧上下文、页面锚点和 MCP 会话令牌。
     */
    private String buildUserPrompt(CurrentUserInfo currentUser,
                                   HermesContextAssembler.HermesConversationContext context,
                                   HermesChatRequest request,
                                   HermesGroundingState groundingState,
                                   String sessionToken) {
        String userName = resolveUserName(currentUser);
        String roleName = resolveRoleName(currentUser, context);
        return """
                当前提问用户：%s
                当前角色：%s
                当前路由：%s

                当前可见上下文：
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

                用户当前问题：
                %s
                """.formatted(
                userName,
                roleName,
                defaultString(request == null ? null : request.routeName()),
                context == null ? "- 当前没有额外页面上下文" : defaultString(context.contextMarkdown()),
                groundingMarkdown(groundingState),
                defaultString(sessionToken),
                defaultString(sessionToken),
                defaultString(request == null ? null : request.question())
        );
    }

    /**
     * 将当前 grounding 摘要整理成提示词，帮助 Hermes 正确理解“这个需求”“刚才那个计划”一类指代。
     */
    private String groundingMarkdown(HermesGroundingState groundingState) {
        if (groundingState == null || groundingState.boundSlots().isEmpty()) {
            return "- 当前没有已绑定对象";
        }
        StringBuilder builder = new StringBuilder();
        for (Map.Entry<String, HermesGroundingTarget> entry : groundingState.boundSlots().entrySet()) {
            HermesGroundingTarget target = entry.getValue();
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
                                   HermesContextAssembler.HermesConversationContext context) {
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

    /**
     * Hermes 调用时使用的提示词载体。
     */
    public record HermesPrompt(String systemPrompt, String userPrompt) {
    }
}
