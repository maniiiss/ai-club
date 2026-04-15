package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.HermesInternalToolExecuteRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
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
    private static final Pattern REPOSITORY_PATH_PATTERN = Pattern.compile("([A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+){1,4})");
    private static final Pattern PROJECT_OF_REPOSITORY_PATTERN = Pattern.compile("([\\u4e00-\\u9fa5A-Za-z0-9][\\u4e00-\\u9fa5A-Za-z0-9 _-]{1,40})\\s*的\\s*([A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+){1,4})");
    private static final Pattern BRANCH_PATTERN = Pattern.compile("(?:分支|branch)[：:\\s]*([A-Za-z0-9._/-]+)", Pattern.CASE_INSENSITIVE);

    private final HermesInternalToolExecutionService hermesInternalToolExecutionService;
    private final HermesConversationStateStore hermesConversationStateStore;
    private final ObjectMapper objectMapper;
    private final RepositoryScanRulesetService repositoryScanRulesetService;

    public HermesActionFallbackService(HermesInternalToolExecutionService hermesInternalToolExecutionService,
                                       HermesConversationStateStore hermesConversationStateStore,
                                       ObjectMapper objectMapper,
                                       RepositoryScanRulesetService repositoryScanRulesetService) {
        this.hermesInternalToolExecutionService = hermesInternalToolExecutionService;
        this.hermesConversationStateStore = hermesConversationStateStore;
        this.objectMapper = objectMapper;
        this.repositoryScanRulesetService = repositoryScanRulesetService;
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
                || normalizedContent.contains("mcp")
                || normalizedContent.contains("execution_task_create")
                || normalizedContent.contains("workitemid")
                || normalizedContent.contains("工作项id");
    }

    /**
     * 尝试执行固定的仓库扫描创建流程。
     * 当模型误把“代码扫描”理解成普通执行任务创建时，由平台直接改走仓库扫描专用工具链。
     */
    public HermesFallbackResult tryStartRepositoryScan(HermesConversationState state,
                                                       HermesChatRequest request) {
        if (state == null || request == null || state.currentRequest() == null) {
            return null;
        }
        if (!isRepositoryScanIntent(request.question())) {
            return null;
        }
        String sessionToken = state.mcpSessionToken();
        if (sessionToken == null || sessionToken.isBlank()) {
            return null;
        }

        String repositoryKeyword = extractRepositoryKeyword(request.question());
        if (repositoryKeyword.isBlank()) {
            return null;
        }

        HermesConversationState workingState = state;
        Long scopedProjectId = null;
        String explicitProjectKeyword = extractRepositoryProjectKeyword(request.question(), repositoryKeyword);
        if (!explicitProjectKeyword.isBlank()) {
            hermesInternalToolExecutionService.execute(new HermesInternalToolExecuteRequest(
                    sessionToken,
                    "project.search",
                    new LinkedHashMap<>() {{
                        put("keyword", explicitProjectKeyword);
                    }}
            ));
            HermesConversationState afterProjectSearch = loadState(state);
            if (!afterProjectSearch.selectionCards().isEmpty()) {
                return new HermesFallbackResult(
                        afterProjectSearch,
                        "我已经找到候选项目了，请先确认要在哪个项目下发起仓库扫描。"
                );
            }
            HermesGroundingTarget searchedProjectTarget = afterProjectSearch.groundingState() == null
                    ? null
                    : afterProjectSearch.groundingState().boundSlot("project");
            if (searchedProjectTarget != null && searchedProjectTarget.entityId() != null) {
                scopedProjectId = searchedProjectTarget.entityId();
            }
            workingState = afterProjectSearch;
        } else {
            HermesGroundingTarget projectTarget = state.groundingState() == null ? null : state.groundingState().boundSlot("project");
            if (projectTarget != null && projectTarget.entityId() != null) {
                scopedProjectId = projectTarget.entityId();
            }
        }

        HermesConversationState afterBindingSearch = searchRepositoryBinding(sessionToken, workingState, repositoryKeyword, scopedProjectId);
        if (!afterBindingSearch.selectionCards().isEmpty()) {
            return new HermesFallbackResult(
                    afterBindingSearch,
                    "我已经找到候选仓库绑定了，请先确认要扫描哪一个仓库。"
            );
        }

        HermesGroundingTarget bindingTarget = afterBindingSearch.groundingState() == null
                ? null
                : afterBindingSearch.groundingState().boundSlot("gitlabBinding");
        if ((bindingTarget == null || bindingTarget.entityId() == null) && scopedProjectId != null) {
            afterBindingSearch = searchRepositoryBinding(sessionToken, afterBindingSearch, repositoryKeyword, null);
            if (!afterBindingSearch.selectionCards().isEmpty()) {
                return new HermesFallbackResult(
                        afterBindingSearch,
                        "我已经找到候选仓库绑定了，请先确认要扫描哪一个仓库。"
                );
            }
            bindingTarget = afterBindingSearch.groundingState() == null
                    ? null
                    : afterBindingSearch.groundingState().boundSlot("gitlabBinding");
        }
        if (bindingTarget == null || bindingTarget.entityId() == null) {
            return new HermesFallbackResult(
                    afterBindingSearch,
                    "没有找到该仓库对应的 GitLab 绑定，请先确认仓库已经绑定到目标项目。"
            );
        }

        String rulesetCode = resolveRepositoryScanRulesetCode(sessionToken, request.question());
        if (rulesetCode.isBlank()) {
            return new HermesFallbackResult(
                    afterBindingSearch,
                    "我已经定位到仓库了，但还需要先确认规则集。你可以直接告诉我规则集名称，或让我列出可用规则集。"
            );
        }

        LinkedHashMap<String, Object> scanArguments = new LinkedHashMap<>();
        scanArguments.put("bindingId", bindingTarget.entityId());
        scanArguments.put("rulesetCode", rulesetCode);
        String branch = extractBranch(request.question());
        if (!branch.isBlank()) {
            scanArguments.put("branch", branch);
        }
        var result = hermesInternalToolExecutionService.execute(new HermesInternalToolExecuteRequest(
                sessionToken,
                "repo_scan.start",
                scanArguments
        ));
        HermesConversationState afterScanStart = loadState(afterBindingSearch);
        return new HermesFallbackResult(afterScanStart, result.message());
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
        if (isRepositoryScanIntent(request.question())) {
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
     * 判断当前问题是否明显在描述“仓库代码扫描”意图。
     */
    private boolean isRepositoryScanIntent(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        String normalized = question.toLowerCase(Locale.ROOT);
        return (normalized.contains("代码扫描")
                || normalized.contains("仓库扫描")
                || normalized.contains("code scan")
                || normalized.contains("scan"))
                && (normalized.contains("/") || normalized.contains("仓库") || normalized.contains("repo"));
    }

    /**
     * 从用户问题中尽量提取仓库路径，优先使用 GitLab 常见的 group/project 或多级路径格式。
     */
    private String extractRepositoryKeyword(String question) {
        if (question == null || question.isBlank()) {
            return "";
        }
        Matcher matcher = REPOSITORY_PATH_PATTERN.matcher(question);
        while (matcher.find()) {
            String candidate = matcher.group(1);
            if (candidate != null && candidate.contains("/")) {
                return candidate.trim();
            }
        }
        return "";
    }

    /**
     * 从“某项目的某仓库”语句中抽取显式项目名，避免错误沿用当前页面上下文中的项目范围。
     */
    private String extractRepositoryProjectKeyword(String question, String repositoryKeyword) {
        if (question == null || question.isBlank() || repositoryKeyword == null || repositoryKeyword.isBlank()) {
            return "";
        }
        Matcher matcher = PROJECT_OF_REPOSITORY_PATTERN.matcher(question);
        while (matcher.find()) {
            String projectKeyword = matcher.group(1);
            String repositoryPath = matcher.group(2);
            if (repositoryKeyword.equalsIgnoreCase(defaultString(repositoryPath))) {
                return defaultString(projectKeyword);
            }
        }
        return "";
    }

    /**
     * 从自然语言中抽取可选分支信息；未提供时沿用绑定默认分支。
     */
    private String extractBranch(String question) {
        if (question == null || question.isBlank()) {
            return "";
        }
        Matcher matcher = BRANCH_PATTERN.matcher(question);
        return matcher.find() ? matcher.group(1).trim() : "";
    }

    /**
     * 解析用户期望的规则集。
     * 当前默认支持“默认规则集”语义自动映射到规则集列表中的默认项。
     */
    private String resolveRepositoryScanRulesetCode(String sessionToken, String question) {
        if (question == null || question.isBlank()) {
            return "";
        }
        String normalized = question.toLowerCase(Locale.ROOT);
        if (normalized.contains("默认规则集") || normalized.contains("默认扫描规则") || normalized.contains("默认")) {
            try {
                return repositoryScanRulesetService.requireDefaultRuleset().getCode();
            } catch (Exception ignored) {
                return "";
            }
        }
        return "";
    }

    /**
     * 统一执行一次仓库绑定搜索；当 projectId 为空时走全局搜索。
     */
    private HermesConversationState searchRepositoryBinding(String sessionToken,
                                                            HermesConversationState baseState,
                                                            String repositoryKeyword,
                                                            Long projectId) {
        LinkedHashMap<String, Object> bindingArguments = new LinkedHashMap<>();
        bindingArguments.put("keyword", repositoryKeyword);
        if (projectId != null) {
            bindingArguments.put("projectId", projectId);
        }
        hermesInternalToolExecutionService.execute(new HermesInternalToolExecuteRequest(
                sessionToken,
                "gitlab_binding.search",
                bindingArguments
        ));
        return loadState(baseState);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
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
