package com.aiclub.platform.agentusage;

/**
 * 智能体类型枚举。
 *
 * <p>所有新增的 AI Service 必须在此登记一个对应值，并通过
 * {@link AgentInvocationRecorder} 显式埋点。{@link #UNKNOWN_MODEL_CALL}
 * 仅作为 {@code ModelConfigService} 底层兜底分类使用，禁止作为正常打点目标。
 */
public enum AgentType {

    /** 需求 AI 助手 - 需求标准化。 */
    REQUIREMENT_AI_STANDARDIZE("需求标准化"),
    /** 需求 AI 助手 - 拆解子任务。 */
    REQUIREMENT_AI_BREAKDOWN("需求拆解"),
    /** 需求 AI 助手 - 生成测试用例。 */
    REQUIREMENT_AI_TEST_CASES("需求测试用例"),
    /** PRD 文档分析。 */
    PRD_ANALYZE("PRD 分析"),
    /** API 接口测试用例生成。 */
    API_TEST_CASE_AI("API 接口测试用例"),
    /** Hermes 流式对话。 */
    HERMES_CHAT("Hermes 对话"),
    /** Hermes 语音转写。 */
    HERMES_SPEECH_TRANSCRIBE("Hermes 语音转写"),
    /** 代码审核（MR 自动合并审查）。 */
    CODE_REVIEW("代码审核"),
    /** 仓库扫描。 */
    REPOSITORY_SCAN("仓库扫描"),
    /** 代码结构化。 */
    REPOSITORY_STRUCTURE("代码结构化"),
    /** 文档转 Markdown。 */
    DOCUMENT_MARKDOWN("文档 Markdown 化"),
    /** Hindsight 记忆 retain/recall。 */
    HINDSIGHT_MEMORY("Hindsight 记忆"),
    /** 项目知识图谱（GraphRAG）。 */
    KNOWLEDGE_GRAPH("知识图谱"),
    /** Wiki LightRAG 摄入/检索。 */
    WIKI_LIGHTRAG("Wiki LightRAG"),
    /** 模型对比测试。 */
    MODEL_BENCHMARK("模型对比测试"),
    /** Agent 管理页的手动测试入口。 */
    AGENT_TEST("Agent 手动测试"),
    /** 用户在智能体管理里自建的智能体。 */
    USER_DEFINED_AGENT("用户自定义智能体"),
    /**
     * 兜底分类：走 ModelConfigService 但未显式埋点的调用。
     *
     * <p>看板上对该类调用有显眼告警，需补埋点后归类到正式 {@code AgentType}。
     */
    UNKNOWN_MODEL_CALL("未分类模型调用");

    private final String displayName;

    AgentType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}