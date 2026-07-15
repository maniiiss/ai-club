package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantConversationContextState;
import com.aiclub.platform.dto.AssistantConversationTurn;
import com.aiclub.platform.runtime.RuntimeContextProfile;
import com.aiclub.platform.runtime.CompactionStrategy;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 统一准备 GitPilot 发给 Runtime 的长对话上下文。
 * 业务意图：原始消息永久保留，Runtime 只接收预算内的摘要与最近消息。
 */
@Service
public class AssistantConversationContextService {

    @Autowired(required = false)
    private AssistantConversationContextMetrics metrics;

    private static final int SAFETY_MARGIN_PERCENT = 5;
    private static final int RECENT_TURN_LIMIT = 8;
    private static final int SUMMARY_ITEM_MAX_CHARS = 600;
    private static final Pattern BRANCH_PATTERN = Pattern.compile(
            "(?:分支|branch)\\s*[:：]?\\s*([A-Za-z0-9._/-]+)|([A-Za-z0-9._/-]+)\\s*(?:分支|branch)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PROJECT_CANDIDATE_PATTERN = Pattern.compile(
            "(?m)^\\s*\\d+[.、]\\s*([^\\n(（]+?)\\s*[（(]ID\\s*[:：]\\s*(\\d+)",
            Pattern.CASE_INSENSITIVE);

    public ContextPreparation prepare(List<AssistantConversationTurn> transcript,
                                      AssistantConversationContextState existingState,
                                      RuntimeContextProfile profile) {
        return prepare(transcript, existingState, profile, ContextBudget.empty());
    }

    /**
     * 按完整调用预算准备历史消息。
     * 业务意图：系统提示词、页面上下文、工具契约和本轮输入都属于模型窗口，不能只计算 transcript。
     */
    public ContextPreparation prepare(List<AssistantConversationTurn> transcript,
                                      AssistantConversationContextState existingState,
                                      RuntimeContextProfile profile,
                                      ContextBudget budget) {
        return prepare(transcript, existingState, profile, budget, false);
    }

    /**
     * 准备 Runtime 调用上下文，并按能力声明决定是否由 backend 负责压缩。
     * 业务意图：NATIVE_FIRST 且 Runtime 声明原生能力时保留完整消息，由 Runtime 在真正调用前裁剪。
     */
    public ContextPreparation prepare(List<AssistantConversationTurn> transcript,
                                      AssistantConversationContextState existingState,
                                      RuntimeContextProfile profile,
                                      ContextBudget budget,
                                      boolean nativeCompactionAvailable) {
        List<AssistantConversationTurn> source = transcript == null ? List.of() : List.copyOf(transcript);
        AssistantConversationContextState previous = existingState == null
                ? AssistantConversationContextState.empty() : existingState;
        RuntimeContextProfile effectiveProfile = profile == null ? RuntimeContextProfile.defaults() : profile;
        ContextBudget effectiveBudget = budget == null ? ContextBudget.empty() : budget;
        int fixedTokens = effectiveBudget.fixedTokens();
        int availableTokens = Math.max(512, effectiveProfile.contextWindowTokens()
                - effectiveProfile.maxOutputTokens()
                - fixedTokens
                - (effectiveProfile.contextWindowTokens() * SAFETY_MARGIN_PERCENT / 100)
                - effectiveBudget.currentInputTokens());
        int estimatedTokens = estimateTokens(source) + fixedTokens + effectiveBudget.currentInputTokens();
        int triggerTokens = Math.max(512, availableTokens * effectiveProfile.compactionThresholdPercent() / 100);
        if (metrics != null && source.stream().anyMatch(turn -> estimateTokens(turn == null ? "" : turn.content()) > availableTokens)) {
            metrics.recordOverflow(effectiveProfile);
        }
        boolean runtimeShouldCompact = effectiveProfile.compactionStrategy() == CompactionStrategy.NATIVE_FIRST
                && nativeCompactionAvailable;
        if (effectiveProfile.compactionStrategy() == CompactionStrategy.DISABLED || runtimeShouldCompact) {
            recordPrepared(effectiveProfile, estimatedTokens);
            return new ContextPreparation(source, withEstimate(previous, estimatedTokens));
        }
        if (estimatedTokens <= triggerTokens || source.size() <= RECENT_TURN_LIMIT) {
            recordPrepared(effectiveProfile, estimatedTokens);
            return new ContextPreparation(trimToBudget(source, availableTokens),
                    withEstimate(previous, estimatedTokens));
        }

        int splitIndex = Math.max(0, source.size() - RECENT_TURN_LIMIT);
        List<AssistantConversationTurn> oldTurns = source.subList(0, splitIndex);
        List<AssistantConversationTurn> recentTurns = source.subList(splitIndex, source.size());
        String summary = mergeSummary(previous.summary(), oldTurns);
        AssistantConversationContextState compacted = new AssistantConversationContextState(
                summary,
                previous.facts(),
                previous.pendingClarification(),
                estimateTokens(summary) + estimateTokens(recentTurns),
                previous.summaryThroughMessageIndex() + oldTurns.size(),
                previous.version() + 1
        );
        recordPrepared(effectiveProfile, compacted.estimatedTokens());
        if (metrics != null) {
            metrics.recordCompaction(effectiveProfile);
            if (!nativeCompactionAvailable || effectiveProfile.compactionStrategy() == CompactionStrategy.BACKEND_FALLBACK) {
                metrics.recordFallback(effectiveProfile);
            }
        }
        return new ContextPreparation(trimToBudget(recentTurns, availableTokens), compacted);
    }

    private void recordPrepared(RuntimeContextProfile profile, int estimatedTokens) {
        if (metrics != null) {
            metrics.recordPrepared(profile, estimatedTokens);
        }
    }

    public String renderSummary(AssistantConversationContextState state) {
        if (state == null || state.summary().isBlank()) {
            return "";
        }
        StringBuilder builder = new StringBuilder("### 历史对话摘要\n").append(state.summary());
        if (!state.pendingClarification().isBlank()) {
            builder.append("\n\n### 当前待确认问题\n").append(state.pendingClarification());
        }
        if (!state.facts().isEmpty()) {
            builder.append("\n\n### 已确认对话事实\n").append(state.facts());
        }
        return builder.toString();
    }

    /**
     * 从本轮用户输入和助手追问中提取轻量结构化事实。
     * 业务意图：普通“deploy 分支”“CRM 项目”确认不能只依赖模型自行回忆。
     */
    public AssistantConversationContextState updateAfterTurn(AssistantConversationContextState previous,
                                                               String userContent,
                                                               String assistantContent,
                                                               Long currentProjectId,
                                                               String currentProjectName) {
        AssistantConversationContextState state = previous == null
                ? AssistantConversationContextState.empty() : previous;
        LinkedHashMap<String, Object> facts = new LinkedHashMap<>(state.facts());
        if (currentProjectId != null) {
            facts.put("projectId", currentProjectId);
            if (currentProjectName != null && !currentProjectName.isBlank()) facts.put("projectName", currentProjectName.trim());
        }
        Matcher branchMatcher = BRANCH_PATTERN.matcher(userContent == null ? "" : userContent);
        if (branchMatcher.find()) {
            facts.put("branch", branchMatcher.group(1) == null ? branchMatcher.group(2) : branchMatcher.group(1));
        }
        List<Map<String, Object>> candidates = extractProjectCandidates(assistantContent);
        if (!candidates.isEmpty()) facts.put("projectCandidates", candidates);
        String pending = resolvePendingClarification(assistantContent);
        return new AssistantConversationContextState(
                state.summary(), facts, pending, state.estimatedTokens(), state.summaryThroughMessageIndex(), state.version());
    }

    private List<Map<String, Object>> extractProjectCandidates(String content) {
        if (content == null || content.isBlank()) return List.of();
        Matcher matcher = PROJECT_CANDIDATE_PATTERN.matcher(content);
        List<Map<String, Object>> candidates = new ArrayList<>();
        while (matcher.find() && candidates.size() < 20) {
            candidates.add(Map.of("type", "project", "id", Long.parseLong(matcher.group(2)), "name", matcher.group(1).trim()));
        }
        return candidates;
    }

    private String resolvePendingClarification(String assistantContent) {
        if (assistantContent == null || assistantContent.isBlank()) return "";
        if (assistantContent.contains("哪个项目") || assistantContent.contains("哪一个项目")
                || assistantContent.contains("选择项目") || assistantContent.contains("确认项目")) {
            return limit(assistantContent);
        }
        if (assistantContent.contains("哪个分支") || assistantContent.contains("哪一个分支")
                || assistantContent.contains("选择分支") || assistantContent.contains("确认分支")) {
            return limit(assistantContent);
        }
        if (assistantContent.contains("哪个仓库") || assistantContent.contains("哪一个仓库")
                || assistantContent.contains("选择仓库") || assistantContent.contains("确认仓库")) {
            return limit(assistantContent);
        }
        return "";
    }

    private String limit(String value) {
        String normalized = value.trim();
        return normalized.length() > 800 ? normalized.substring(0, 800) + "…" : normalized;
    }

    private AssistantConversationContextState withEstimate(AssistantConversationContextState state, int estimatedTokens) {
        return new AssistantConversationContextState(
                state.summary(), state.facts(), state.pendingClarification(), estimatedTokens,
                state.summaryThroughMessageIndex(), state.version());
    }

    private String mergeSummary(String previous, List<AssistantConversationTurn> oldTurns) {
        StringBuilder builder = new StringBuilder();
        if (previous != null && !previous.isBlank()) {
            builder.append(previous.trim()).append('\n');
        }
        for (AssistantConversationTurn turn : oldTurns) {
            if (turn == null || turn.content() == null || turn.content().isBlank()) continue;
            String content = turn.content().trim();
            if (content.length() > SUMMARY_ITEM_MAX_CHARS) {
                content = content.substring(0, SUMMARY_ITEM_MAX_CHARS) + "…";
            }
            builder.append("- ").append("user".equalsIgnoreCase(turn.role()) ? "用户：" : "助手：")
                    .append(content).append('\n');
        }
        return builder.toString().trim();
    }

    private List<AssistantConversationTurn> trimToBudget(List<AssistantConversationTurn> transcript, int availableTokens) {
        if (transcript == null || transcript.isEmpty()) return List.of();
        int total = 0;
        List<AssistantConversationTurn> selected = new ArrayList<>();
        for (int index = transcript.size() - 1; index >= 0; index--) {
            AssistantConversationTurn turn = transcript.get(index);
            int turnTokens = estimateTokens(turn == null ? "" : turn.content());
            if (!selected.isEmpty() && total + turnTokens > availableTokens) break;
            selected.add(0, turn);
            total += turnTokens;
        }
        return List.copyOf(selected);
    }

    private int estimateTokens(List<AssistantConversationTurn> turns) {
        if (turns == null) return 0;
        return turns.stream().mapToInt(turn -> estimateTokens(turn == null ? "" : turn.content())).sum();
    }

    private int estimateTokens(String content) {
        if (content == null || content.isBlank()) return 0;
        return Math.max(1, (content.length() + 3) / 4);
    }

    public record ContextPreparation(
            List<AssistantConversationTurn> outboundTranscript,
            AssistantConversationContextState state
    ) {
        public ContextPreparation {
            outboundTranscript = outboundTranscript == null ? List.of() : List.copyOf(outboundTranscript);
            state = state == null ? AssistantConversationContextState.empty() : state;
        }
    }

    /** 一次 Runtime 调用中除历史消息外的固定 token 预算组成。 */
    public record ContextBudget(
            String systemPrompt,
            int toolContractTokens,
            String pageContext,
            String currentInput
    ) {
        public ContextBudget {
            systemPrompt = systemPrompt == null ? "" : systemPrompt;
            toolContractTokens = Math.max(0, toolContractTokens);
            pageContext = pageContext == null ? "" : pageContext;
            currentInput = currentInput == null ? "" : currentInput;
        }

        public int fixedTokens() {
            return estimate(systemPrompt) + toolContractTokens + estimate(pageContext);
        }

        public int currentInputTokens() {
            return estimate(currentInput);
        }

        public static ContextBudget empty() {
            return new ContextBudget("", 0, "", "");
        }

        private static int estimate(String value) {
            return value == null || value.isBlank() ? 0 : Math.max(1, (value.length() + 3) / 4);
        }
    }
}
