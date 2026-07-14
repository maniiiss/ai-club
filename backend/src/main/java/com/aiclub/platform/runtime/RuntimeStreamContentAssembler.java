package com.aiclub.platform.runtime;

/**
 * 将 Runtime 的文本和思考事件聚合为前端可展示的增量内容。
 *
 * 业务意图：Assistant 两套前端已经支持可折叠的 {@code <think>} 块，
 * Runtime 之间只需传输 THINKING 事件，不需要重复实现展示层状态机。
 */
public final class RuntimeStreamContentAssembler {

    private boolean thinkingOpen;

    /** 接收一个 Runtime 事件并返回需要追加到展示文本的内容。 */
    public String accept(RuntimeStreamEvent event) {
        if (event == null) {
            return "";
        }
        if (event.is("THINKING_START")) {
            if (thinkingOpen) {
                return "";
            }
            thinkingOpen = true;
            return "<think>";
        }
        if (event.is("THINKING_DELTA")) {
            String delta = event.thinkingDelta();
            if (delta.isEmpty()) {
                return "";
            }
            if (!thinkingOpen) {
                thinkingOpen = true;
                return "<think>" + delta;
            }
            return delta;
        }
        if (event.is("THINKING_END")) {
            if (!thinkingOpen) {
                return "";
            }
            thinkingOpen = false;
            return "</think>";
        }
        if (event.is("TEXT_DELTA")) {
            String delta = event.textDelta();
            if (delta.isEmpty()) {
                return "";
            }
            if (!thinkingOpen) {
                return delta;
            }
            thinkingOpen = false;
            return "</think>" + delta;
        }
        return "";
    }

    /** 流结束时兜底闭合未收到 THINKING_END 的思考块。 */
    public String finish() {
        if (!thinkingOpen) {
            return "";
        }
        thinkingOpen = false;
        return "</think>";
    }
}
