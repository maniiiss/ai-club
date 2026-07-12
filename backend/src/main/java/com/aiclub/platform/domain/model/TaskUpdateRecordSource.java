package com.aiclub.platform.domain.model;

/**
 * 工作项更新来源。
 * 业务意图：让用户区分人工编辑、系统同步和 AI 回写，避免不同来源的变更混在一起难以审计。
 */
public enum TaskUpdateRecordSource {
    MANUAL,
    SYSTEM,
    AI
}
