package com.aiclub.platform.service;

/**
 * 保留 Assistant 返回的原始 Markdown。
 * 业务意图：Markdown 交由前端标准渲染器解析，后端不猜测星号、列表、标题或表格的语义。
 */
public final class AssistantMarkdownFormatter {

    private AssistantMarkdownFormatter() {
    }

    /**
     * 只统一换行符，避免不同平台的换行影响传输和存储；其余内容完全保持原样。
     */
    public static String formatForDisplay(String content) {
        return content == null ? "" : content.replace("\r\n", "\n").replace('\r', '\n');
    }
}
