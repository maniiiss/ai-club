package com.aiclub.platform.service;

import java.util.function.Consumer;

/**
 * 流式回答隐藏元数据过滤器。
 * 业务意图：在模型尚未结束输出时也不把内部标题/追问标记闪现到用户界面。
 */
public final class AssistantResponseStreamFilter {

    private final String markerPrefix;
    private final StringBuilder pending = new StringBuilder();
    private boolean metadataStarted;

    public AssistantResponseStreamFilter(String markerPrefix) {
        this.markerPrefix = markerPrefix == null ? "" : markerPrefix;
    }

    /**
     * 接收模型增量，仅向下游发出已确认不是元数据起点的正文。
     */
    public void accept(String chunk, Consumer<String> sink) {
        if (chunk == null || chunk.isEmpty() || metadataStarted) {
            return;
        }
        pending.append(chunk);
        int markerIndex = pending.indexOf(markerPrefix);
        if (markerIndex >= 0) {
            emit(pending.substring(0, markerIndex), sink);
            pending.delete(0, pending.length());
            metadataStarted = true;
            return;
        }
        int safeLength = Math.max(0, pending.length() - Math.max(1, markerPrefix.length() - 1));
        emit(pending.substring(0, safeLength), sink);
        pending.delete(0, safeLength);
    }

    /**
     * 模型输出结束时刷新仍待确认的正文；若已经进入元数据则丢弃剩余控制内容。
     */
    public void finish(Consumer<String> sink) {
        if (!metadataStarted) {
            emit(pending.toString(), sink);
        }
        pending.setLength(0);
    }

    private void emit(String value, Consumer<String> sink) {
        if (value != null && !value.isEmpty() && sink != null) {
            sink.accept(value);
        }
    }
}
