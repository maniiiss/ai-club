package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;

import java.util.Collection;

/**
 * 按需选工具的上下文输入。
 *
 * <p>业务意图：把本轮对话的业务信号（问题文本、slash 命令、路由、候选工具集、用户）
 * 收敛给 {@link PlatformToolSelector}，由其统一决定下发哪些平台工具给 Runtime，
 * 避免在调用方散落筛选逻辑。
 *
 * <p>{@code candidateToolCodes} 为 {@code null} 表示不限制候选范围（普通助手会话用全量可见工具）；
 * 非空时（聊天室为房间启用工具集）按需选择仅会在该候选集内生效，保证"按需 ⊂ 房间策略"。
 */
public record ToolSelectionContext(
        String question,
        String slashCommand,
        String routeName,
        Long projectId,
        Collection<String> candidateToolCodes,
        CurrentUserInfo currentUser
) {
    public ToolSelectionContext {
        question = question == null ? "" : question;
        slashCommand = slashCommand == null ? "" : slashCommand;
        routeName = routeName == null ? "" : routeName;
    }
}
