package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantResponseMetadata;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 GitPilot 回答元数据的解析和流式过滤契约。
 */
class AssistantResponseMetadataTests {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldExtractTitleAndAnswerAwareFollowUpsWithoutLeakingMarker() {
        AssistantResponseMetadata metadata = AssistantResponseMetadata.parse(
                "项目当前有两个阻塞项。\n\n<!-- gitpilot-meta: {\"title\":\"项目阻塞分析\",\"followUps\":[\"查看阻塞负责人\",\"按优先级排序阻塞项\"]} -->",
                objectMapper
        );

        assertThat(metadata.content()).isEqualTo("项目当前有两个阻塞项。");
        assertThat(metadata.title()).isEqualTo("项目阻塞分析");
        assertThat(metadata.suggestions()).containsExactly("查看阻塞负责人", "按优先级排序阻塞项");
        assertThat(metadata.content()).doesNotContain("gitpilot-meta");
    }

    @Test
    void shouldFallbackToPlainAnswerWhenMetadataIsMissingOrInvalid() {
        AssistantResponseMetadata metadata = AssistantResponseMetadata.parse("普通回答内容", objectMapper);
        AssistantResponseMetadata invalid = AssistantResponseMetadata.parse(
                "普通回答内容\n<!-- gitpilot-meta: {invalid} -->",
                objectMapper
        );

        assertThat(metadata.content()).isEqualTo("普通回答内容");
        assertThat(metadata.title()).isEmpty();
        assertThat(metadata.suggestions()).isEmpty();
        assertThat(invalid.content()).isEqualTo("普通回答内容");
    }

    @Test
    void shouldSuppressHiddenMetadataDuringStreaming() {
        List<String> visibleChunks = new ArrayList<>();
        AssistantResponseStreamFilter filter = new AssistantResponseStreamFilter(AssistantResponseMetadata.markerPrefix());

        filter.accept("正文回答\n<!-- gitpilot-", visibleChunks::add);
        filter.accept("meta: {\"title\":\"标题\"} -->", visibleChunks::add);
        filter.finish(visibleChunks::add);

        assertThat(String.join("", visibleChunks)).isEqualTo("正文回答\n");
    }
}
