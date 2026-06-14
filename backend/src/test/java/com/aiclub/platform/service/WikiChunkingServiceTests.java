package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 Wiki 切块规则稳定可控，避免整页直接入向量导致检索粒度过粗。
 */
class WikiChunkingServiceTests {

    @Test
    void shouldSplitMarkdownByHeadingAndLength() {
        WikiChunkingService service = new WikiChunkingService();
        StringBuilder content = new StringBuilder();
        content.append("# 登录流程\n");
        content.append("A".repeat(900)).append('\n');
        content.append("## 风险说明\n");
        content.append("B".repeat(300));

        List<WikiChunkingService.WikiChunk> chunks = service.chunkMarkdown(
                "wiki-project",
                12L,
                3,
                "认证改造",
                "认证改造 / 登录流程",
                content.toString()
        );

        assertThat(chunks).hasSizeGreaterThanOrEqualTo(2);
        assertThat(chunks.get(0).chunkId()).startsWith("wiki-project:12:3:");
        assertThat(chunks.get(0).content()).contains("登录流程");
        assertThat(chunks).anyMatch(item -> item.sectionTitle().contains("风险说明"));
    }
}
