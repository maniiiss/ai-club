package com.aiclub.platform.agentusage;

/**
 * 用于流式/异步调用过程中回写 token / 字符数 / cost 的句柄。
 *
 * <p>典型用法：调用前 {@code recorder.startManual(ctx)} 拿到 sink，
 * 调用过程中累计 {@code sink.setOutputChars(content.length())}；
 * 调用完成后 {@code recorder.commit(sink)} 或 {@code recorder.fail(sink, ex)}。
 */
public final class UsageSink {

    private Integer promptTokens;
    private Integer completionTokens;
    private Integer totalTokens;
    private Integer outputChars;
    private String correlationId;
    private Integer costCredits;

    public void setUsage(Integer promptTokens, Integer completionTokens, Integer totalTokens) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        if (totalTokens != null) {
            this.totalTokens = totalTokens;
        } else if (promptTokens != null || completionTokens != null) {
            this.totalTokens = (promptTokens == null ? 0 : promptTokens)
                    + (completionTokens == null ? 0 : completionTokens);
        }
    }

    public void setOutputChars(Integer outputChars) {
        this.outputChars = outputChars;
    }

    public void setCorrelationId(String correlationId) {
        this.correlationId = correlationId;
    }

    public void setCostCredits(Integer costCredits) {
        this.costCredits = costCredits;
    }

    public Integer getPromptTokens() { return promptTokens; }
    public Integer getCompletionTokens() { return completionTokens; }
    public Integer getTotalTokens() { return totalTokens; }
    public Integer getOutputChars() { return outputChars; }
    public String getCorrelationId() { return correlationId; }
    public Integer getCostCredits() { return costCredits; }
}