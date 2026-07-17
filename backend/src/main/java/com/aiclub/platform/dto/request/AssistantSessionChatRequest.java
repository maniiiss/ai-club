package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 基于已存在会话发送 Assistant 问答时使用的请求体。
 */
public record AssistantSessionChatRequest(
        @NotBlank(message = "问题不能为空")
        @Size(max = 2000, message = "问题长度不能超过 2000 个字符")
        String question,
        /**
         * 当用户从候选卡片中确认对象后，前端会把选择结果一并带回。
         */
        @Valid
        AssistantSelectionRequest selection,
        /**
         * 调试模式仅用于前端展示内部规划轨迹，默认关闭。
         */
        Boolean debug,
        /**
         * 前端 Slash 命令菜单传入的结构化 Skill 唤起指令，例如 /需求、/wiki。
         */
        @Size(max = 40, message = "Slash 命令长度不能超过 40 个字符")
        String slashCommand,
        /** 外部 MCP 确认后的内部续答上下文，不作为用户问题展示或标题来源。 */
        @Size(max = 100000, message = "内部续答上下文不能超过 100000 个字符")
        String internalContext
) {
    /**
     * 兼容旧调用方：未提供 Slash 命令时不启用业务 Skill。
     */
    public AssistantSessionChatRequest(String question,
                                    AssistantSelectionRequest selection,
                                    Boolean debug) {
        this(question, selection, debug, null, null);
    }

    /** 兼容现有 Slash 调用方，未提供内部续答上下文时使用空值。 */
    public AssistantSessionChatRequest(String question,
                                    AssistantSelectionRequest selection,
                                    Boolean debug,
                                    String slashCommand) {
        this(question, selection, debug, slashCommand, null);
    }
}
