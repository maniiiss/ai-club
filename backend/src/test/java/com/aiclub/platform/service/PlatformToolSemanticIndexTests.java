package com.aiclub.platform.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * PlatformToolSemanticIndex 向量检索与降级单测。
 * 重点验证 embedding 未配置时 isEnabled 返回 false 且 search 静默返回空，不抛异常。
 */
class PlatformToolSemanticIndexTests {

    private QdrantClientService qdrantClientService;
    private ModelConfigService modelConfigService;
    private WikiKnowledgeProperties wikiProperties;
    private PlatformToolRegistry platformToolRegistry;
    private PlatformToolSemanticIndex index;

    @BeforeEach
    void setUp() {
        qdrantClientService = Mockito.mock(QdrantClientService.class);
        modelConfigService = Mockito.mock(ModelConfigService.class);
        wikiProperties = Mockito.mock(WikiKnowledgeProperties.class);
        platformToolRegistry = Mockito.mock(PlatformToolRegistry.class);
        index = new PlatformToolSemanticIndex(qdrantClientService, modelConfigService, wikiProperties, platformToolRegistry);
    }

    @Test
    void disabledWhenEmbeddingNotConfigured() {
        when(wikiProperties.hasEmbeddingConfig()).thenReturn(false);
        assertThat(index.isEnabled()).isFalse();
    }

    @Test
    void searchReturnsEmptyWhenDisabled() {
        when(wikiProperties.hasEmbeddingConfig()).thenReturn(false);
        assertThat(index.search("如何查询项目", 5)).isEmpty();
    }

    @Test
    void searchReturnsEmptyWhenQuestionBlank() {
        when(wikiProperties.hasEmbeddingConfig()).thenReturn(true);
        assertThat(index.search("", 5)).isEmpty();
        assertThat(index.search("   ", 5)).isEmpty();
        assertThat(index.search(null, 5)).isEmpty();
    }

    @Test
    void searchReturnsEmptyWhenIndexNotReady() {
        // embedding 已配置但索引构建失败（platformToolRegistry 返回空），search 应降级为空而非抛异常。
        when(wikiProperties.hasEmbeddingConfig()).thenReturn(true);
        when(platformToolRegistry.listDefinitions()).thenReturn(java.util.List.of());
        assertThat(index.search("如何查询项目", 5)).isEmpty();
    }
}
