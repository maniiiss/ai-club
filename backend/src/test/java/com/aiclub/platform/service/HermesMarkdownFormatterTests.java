package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证 Hermes 最终展示文本的 Markdown 语法边界修复。 */
class HermesMarkdownFormatterTests {

    @Test
    void shouldFormatMalformedStrongAndOrderedListBoundariesFromHermesResponse() {
        String raw = """
                - **目标迭代：**20260429（ID:1）

                建议你在当前页面上手动操作：
                1.进入缺陷 **#454BW2**的详情页2.在迭代/归属字段中选择 **20260429**
                3.保存即可完成分配
                """;

        String formatted = HermesMarkdownFormatter.formatForDisplay(raw);

        assertThat(formatted).contains("- **目标迭代：** 20260429（ID:1）");
        assertThat(formatted).contains("1. 进入缺陷 **#454BW2** 的详情页\n2. 在迭代/归属字段中选择 **20260429**");
        assertThat(formatted).contains("\n3. 保存即可完成分配");
    }
}
