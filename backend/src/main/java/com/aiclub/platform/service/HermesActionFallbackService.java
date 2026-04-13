package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.HermesInternalToolExecuteRequest;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 当 Hermes API Server 因模型决策偏差无法正确发起平台工具调用时，
 * 后端使用固定的业务工作流进行兜底。
 * 当前仅覆盖“创建需求/任务/缺陷草稿”这一类高频平台操作。
 */
@Service
public class HermesActionFallbackService {

    private static final Pattern QUOTED_TITLE_PATTERN = Pattern.compile("[“\"]([^”\"]+)[”\"]");
    private static final Pattern ASSIGNEE_BY_CREATE_PATTERN = Pattern.compile("给([\\u4e00-\\u9fa5A-Za-z0-9_-]{2,20})创建");
    private static final Pattern ASSIGNEE_BY_OWNER_PATTERN = Pattern.compile("负责人[：:\\s]*([\\u4e00-\\u9fa5A-Za-z0-9_-]{2,20})");
    private static final Pattern PROJECT_PATTERN = Pattern.compile("([A-Za-z][A-Za-z0-9_-]{1,20})项目");

    private final HermesInternalToolExecutionService hermesInternalToolExecutionService;
    private final HermesConversationStateStore hermesConversationStateStore;

    public HermesActionFallbackService(HermesInternalToolExecutionService hermesInternalToolExecutionService,
                                       HermesConversationStateStore hermesConversationStateStore) {
        this.hermesInternalToolExecutionService = hermesInternalToolExecutionService;
        this.hermesConversationStateStore = hermesConversationStateStore;
    }

    /**
     * 判断当前问题是否适合走创建工作项草稿兜底。
     */
    public boolean shouldFallback(HermesChatRequest request, String modelContent) {
        if (request == null || request.question() == null || request.question().isBlank()) {
            return false;
        }
        String normalizedContent = modelContent == null ? "" : modelContent.toLowerCase(Locale.ROOT);
        return normalizedContent.contains("session_token")
                || normalizedContent.contains("system_session_token")
                || normalizedContent.contains("session token")
                || normalizedContent.contains("会话令牌")
                || normalizedContent.contains("session terminated")
                || normalizedContent.contains("当前会话已超时")
                || normalizedContent.contains("当前会话已终止")
                || normalizedContent.contains("平台工具")
                || normalizedContent.contains("mcp");
    }

    /**
     * 尝试执行固定创建需求工作流。
     * 返回 null 表示当前条件下不适合兜底，保留模型原始回答。
     */
    public HermesFallbackResult tryCreateWorkItemDraft(HermesConversationState state,
                                                       HermesChatRequest request) {
        if (state == null || request == null || state.currentRequest() == null) {
            return null;
        }
        String sessionToken = state.mcpSessionToken();
        if (sessionToken == null || sessionToken.isBlank()) {
            return null;
        }

        String projectKeyword = extractProjectKeyword(request.question());
        if (projectKeyword != null && !projectKeyword.isBlank()) {
            hermesInternalToolExecutionService.execute(new HermesInternalToolExecuteRequest(
                    sessionToken,
                    "project.search",
                    new LinkedHashMap<>() {{
                        put("keyword", projectKeyword);
                    }}
            ));
            HermesConversationState afterProjectSearch = loadState(state);
            if (!afterProjectSearch.selectionCards().isEmpty()) {
                return new HermesFallbackResult(
                        afterProjectSearch,
                        "我已经找到候选项目了，请先确认要在哪个项目下创建这个需求。"
                );
            }
            HermesGroundingTarget projectTarget = afterProjectSearch.groundingState().boundSlot("project");
            if (projectTarget == null || projectTarget.entityId() == null) {
                return new HermesFallbackResult(
                        afterProjectSearch,
                        "项目搜索没有找到 CRM 相关项目。请问你需要在哪个项目下创建这个需求？或者你可以提供项目名称，我来帮你确认。"
                );
            }

            String assigneeKeyword = extractAssigneeKeyword(request.question());
            if (assigneeKeyword != null && !assigneeKeyword.isBlank()) {
                hermesInternalToolExecutionService.execute(new HermesInternalToolExecuteRequest(
                        sessionToken,
                        "user.resolve_project_member",
                        new LinkedHashMap<>() {{
                            put("projectId", projectTarget.entityId());
                            put("keyword", assigneeKeyword);
                        }}
                ));
                HermesConversationState afterMemberResolve = loadState(afterProjectSearch);
                if (!afterMemberResolve.selectionCards().isEmpty()) {
                    return new HermesFallbackResult(
                            afterMemberResolve,
                            "我已经找到候选负责人了，请先确认要分配给哪位成员。"
                    );
                }

                HermesGroundingTarget memberTarget = afterMemberResolve.groundingState().boundSlot("member");
                LinkedHashMap<String, Object> createArguments = new LinkedHashMap<>();
                createArguments.put("projectId", projectTarget.entityId());
                createArguments.put("workItemType", "需求");
                createArguments.put("name", extractTitle(request.question(), projectKeyword));
                createArguments.put("content", buildDraftContent(request.question()));
                if (memberTarget != null && memberTarget.entityId() != null) {
                    createArguments.put("assigneeUserId", memberTarget.entityId());
                }

                var result = hermesInternalToolExecutionService.execute(new HermesInternalToolExecuteRequest(
                        sessionToken,
                        "work_item.create_draft",
                        createArguments
                ));
                HermesConversationState afterCreateDraft = loadState(afterMemberResolve);
                return new HermesFallbackResult(afterCreateDraft, result.message());
            }
        }
        return null;
    }

    private HermesConversationState loadState(HermesConversationState state) {
        return hermesConversationStateStore.load(state.scopeKey(), state.clientConversationId()).orElse(state);
    }

    private String extractProjectKeyword(String question) {
        if (question == null || question.isBlank()) {
            return "";
        }
        Matcher explicitProject = PROJECT_PATTERN.matcher(question);
        if (explicitProject.find()) {
            return explicitProject.group(1);
        }
        if (question.toUpperCase(Locale.ROOT).contains("CRM")) {
            return "CRM";
        }
        return "";
    }

    private String extractAssigneeKeyword(String question) {
        if (question == null || question.isBlank()) {
            return "";
        }
        Matcher byCreate = ASSIGNEE_BY_CREATE_PATTERN.matcher(question);
        if (byCreate.find()) {
            return byCreate.group(1);
        }
        Matcher byOwner = ASSIGNEE_BY_OWNER_PATTERN.matcher(question);
        if (byOwner.find()) {
            return byOwner.group(1);
        }
        return "";
    }

    private String extractTitle(String question, String projectKeyword) {
        if (question == null || question.isBlank()) {
            return "Hermes 创建的需求草稿";
        }
        Matcher quoted = QUOTED_TITLE_PATTERN.matcher(question);
        if (quoted.find()) {
            return quoted.group(1);
        }
        if (projectKeyword != null && !projectKeyword.isBlank() && question.contains(projectKeyword)) {
            return question.replace("帮我给", "")
                    .replace("创建一个", "")
                    .replace("的需求", "")
                    .trim();
        }
        return question.length() > 40 ? question.substring(0, 40) : question;
    }

    private String buildDraftContent(String question) {
        if (question == null || question.isBlank()) {
            return "";
        }
        return "根据用户请求自动整理的需求草稿：\n" + question.trim();
    }

    /**
     * 服务端兜底执行结果。
     */
    public record HermesFallbackResult(
            HermesConversationState state,
            String content
    ) {
    }
}
