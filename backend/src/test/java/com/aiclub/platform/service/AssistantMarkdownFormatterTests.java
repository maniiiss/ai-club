package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证 Assistant 展示文本只做换行归一化，不改写 Markdown 语义。 */
class AssistantMarkdownFormatterTests {

    @Test
    void shouldPreserveMarkdownMarkersAndOnlyNormalizeLineEndings() {
        String raw = "- **基本信息**\r\n\r\n普通 *斜体*、**加粗**、表格 | A | B |\r\n\r\n- *模型原文*";

        String formatted = AssistantMarkdownFormatter.formatForDisplay(raw);

        assertThat(formatted).isEqualTo("- **基本信息**\n\n普通 *斜体*、**加粗**、表格 | A | B |\n\n- *模型原文*");
    }

    @Test
    void shouldReturnEmptyTextForNull() {
        assertThat(AssistantMarkdownFormatter.formatForDisplay(null)).isEmpty();
    }
}
