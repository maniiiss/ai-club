package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.WikiSpaceKnowledgeGraph;
import com.aiclub.platform.repository.WikiPageRepository;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖 Wiki 知识检索服务的混合排序与 Assistant 证据拼装，避免检索只剩纯向量替换。
 */
@ExtendWith(MockitoExtension.class)
class WikiKnowledgeSearchServiceTests {

    @Mock
    private QdrantClientService qdrantClientService;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private WikiPageRepository wikiPageRepository;

    @Mock
    private WikiPageV2Repository wikiPageV2Repository;

    @Test
    void shouldUseFixedEmbeddingConfigWhenModelIdNotConfigured() {
        WikiKnowledgeSearchService service = new WikiKnowledgeSearchService(
                new WikiKnowledgeProperties(
                        true,
                        "http://localhost:6333",
                        "",
                        20,
                        "wiki_project_chunks",
                        "wiki_space_chunks",
                        0L,
                        "http://embedding.local/v1",
                        "local-key",
                        "qwen3-embedding-4b",
                        "OPENAI",
                        12,
                        24,
                        "",
                        "",
                        "",
                        "openai-compatible",
                        15,
                        10,
                        0.78,
                        6,
                        256
                ),
                qdrantClientService,
                new WikiChunkingService(),
                modelConfigService,
                wikiPageRepository,
                wikiPageV2Repository,
                new ObjectMapper()
        );

        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("支付项目");
        WikiPageEntity page = new WikiPageEntity();
        page.setId(101L);
        page.setProject(project);
        page.setTitle("证书提醒");
        page.setSlug("cert-alert");
        page.setContent("证书提醒正文");
        page.setVisibilityScope(WikiPageService.VISIBILITY_PROJECT_MEMBERS);
        page.setCurrentVersionNumber(1);

        when(modelConfigService.generateEmbeddings(
                org.mockito.ArgumentMatchers.<ModelConfigService.ResolvedModelConfig>argThat(config ->
                        config.id() == null
                                && "Wiki 知识向量模型".equals(config.name())
                                && ModelConfigService.MODEL_TYPE_EMBEDDING.equals(config.modelType())
                                && ModelConfigService.PROVIDER_OPENAI.equals(config.provider())
                                && "http://embedding.local/v1".equals(config.apiBaseUrl())
                                && "qwen3-embedding-4b".equals(config.modelName())
                                && "local-key".equals(config.apiKey())),
                org.mockito.ArgumentMatchers.anyList()
        )).thenReturn(List.of(List.of(0.1d, 0.2d, 0.3d)));

        assertThat(service.isEnabled()).isTrue();

        service.indexProjectPage(page);

        verify(modelConfigService, never()).generateEmbeddings(eq(0L), org.mockito.ArgumentMatchers.anyList());
        verify(qdrantClientService).upsertPoints(eq("wiki_project_chunks"), org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void shouldPreferKeywordCandidateWhenRerankUnavailable() {
        WikiKnowledgeSearchService service = new WikiKnowledgeSearchService(
                new WikiKnowledgeProperties(
                        true,
                        "http://localhost:6333",
                        "",
                        20,
                        "wiki_project_chunks",
                        "wiki_space_chunks",
                        9L,
                        "",
                        "",
                        "",
                        "OPENAI",
                        12,
                        24,
                        "",
                        "",
                        "",
                        "openai-compatible",
                        15,
                        10,
                        0.78,
                        6,
                        256
                ),
                qdrantClientService,
                new WikiChunkingService(),
                modelConfigService,
                wikiPageRepository,
                wikiPageV2Repository,
                new ObjectMapper()
        );

        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("支付项目");
        WikiPageEntity keywordPage = new WikiPageEntity();
        keywordPage.setId(101L);
        keywordPage.setProject(project);
        keywordPage.setTitle("证书提醒");
        keywordPage.setSlug("cert-alert");
        keywordPage.setContent("证书提醒正文");
        keywordPage.setVisibilityScope(WikiPageService.VISIBILITY_PROJECT_MEMBERS);
        keywordPage.setUpdatedAt(LocalDateTime.now());
        WikiPageEntity vectorPage = new WikiPageEntity();
        vectorPage.setId(102L);
        vectorPage.setProject(project);
        vectorPage.setTitle("登录改造说明");
        vectorPage.setSlug("login-rework");
        vectorPage.setContent("这里提到了证书过期处理");
        vectorPage.setVisibilityScope(WikiPageService.VISIBILITY_PROJECT_MEMBERS);
        vectorPage.setUpdatedAt(LocalDateTime.now().minusMinutes(1));

        when(modelConfigService.generateEmbedding(9L, "证书提醒")).thenReturn(List.of(0.1d, 0.2d, 0.3d));
        when(qdrantClientService.search(eq("wiki_project_chunks"), eq(List.of(0.1d, 0.2d, 0.3d)), eq(Map.of("projectId", 12L)), anyInt()))
                .thenReturn(List.of(new QdrantClientService.QdrantSearchHit(
                        "chunk-102",
                        0.91d,
                        Map.of("pageId", 102L, "title", "登录改造说明", "plainText", "这里提到了证书过期处理")
                )));
        List<WikiKnowledgeSearchService.WikiRankedPageHit> hits = service.hybridSearchProjectPages(12L, "证书提醒", List.of(keywordPage, vectorPage), 10);

        assertThat(hits).hasSize(2);
        assertThat(hits.get(0).pageId()).isEqualTo(101L);
        assertThat(hits.get(0).snippet()).contains("关键词匹配");
        assertThat(hits.get(1).pageId()).isEqualTo(102L);
    }

    @Test
    void shouldBuildAssistantWikiEvidenceFromKnowledgeStore() {
        WikiKnowledgeSearchService service = new WikiKnowledgeSearchService(
                new WikiKnowledgeProperties(
                        true,
                        "http://localhost:6333",
                        "",
                        20,
                        "wiki_project_chunks",
                        "wiki_space_chunks",
                        9L,
                        "",
                        "",
                        "",
                        "OPENAI",
                        12,
                        24,
                        "",
                        "",
                        "",
                        "openai-compatible",
                        15,
                        10,
                        0.78,
                        6,
                        256
                ),
                qdrantClientService,
                new WikiChunkingService(),
                modelConfigService,
                wikiPageRepository,
                wikiPageV2Repository,
                new ObjectMapper()
        );

        when(modelConfigService.generateEmbedding(9L, "帮我总结当前页")).thenReturn(List.of(0.1d, 0.2d, 0.3d));
        when(qdrantClientService.search(eq("wiki_space_chunks"), eq(List.of(0.1d, 0.2d, 0.3d)), eq(Map.of("spaceId", 8L)), anyInt()))
                .thenReturn(List.of(
                        new QdrantClientService.QdrantSearchHit("chunk-1", 0.91d, Map.of("pageId", 15L, "title", "当前页", "plainText", "当前页正文")),
                        new QdrantClientService.QdrantSearchHit("chunk-2", 0.82d, Map.of("pageId", 16L, "title", "相关页", "plainText", "相关页里提到了登录限制"))
                ));

        String markdown = service.buildWikiEvidenceMarkdown(
                null,
                new AssistantContextAssembler.AssistantConversationContext("wiki-space-page", null, null, 8L, 15L, "知识管理员", List.of(), List.of(), "Wiki 页面上下文"),
                new com.aiclub.platform.dto.request.AssistantChatRequest("帮我总结当前页", "wiki-space-page", null, null, null, null, 8L, 15L, "client-1", null, false)
        );

        assertThat(markdown).contains("相关页里提到了登录限制");
        assertThat(markdown).contains("来源：Wiki 知识库");
        assertThat(markdown).doesNotContain("当前页正文");
    }

    @Test
    void shouldResolveEffectiveProjectForSpacePageIndex() {
        WikiKnowledgeSearchService service = createService();

        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("支付项目");
        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(9L);
        space.setName("知识空间");
        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(20L);
        directory.setName("产品目录");
        directory.setSpace(space);
        directory.setBoundProject(project);
        WikiPageV2Entity page = new WikiPageV2Entity();
        page.setId(201L);
        page.setSpace(space);
        page.setDirectory(directory);
        page.setTitle("空间发布说明");
        page.setSlug("space-release-note");
        page.setContent("空间正文");
        page.setCurrentVersionNumber(3);

        when(modelConfigService.generateEmbeddings(eq(9L), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(List.of(List.of(0.1d, 0.2d, 0.3d)));

        service.indexSpacePage(page);

        verify(qdrantClientService).upsertPoints(
                eq("wiki_space_chunks"),
                org.mockito.ArgumentMatchers.argThat(points -> {
                    if (points == null || points.isEmpty()) {
                        return false;
                    }
                    Map<String, Object> payload = points.get(0).payload();
                    return Long.valueOf(12L).equals(payload.get("projectId"))
                            && Long.valueOf(9L).equals(payload.get("spaceId"))
                            && Long.valueOf(201L).equals(payload.get("pageId"));
                })
        );
    }

    @Test
    void shouldIndexUnboundSpacePageWithoutNullPayloadFailure() {
        WikiKnowledgeSearchService service = createService();
        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(9L);
        space.setName("知识空间");
        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(20L);
        directory.setName("产品目录");
        directory.setSpace(space);
        WikiPageV2Entity page = new WikiPageV2Entity();
        page.setId(201L);
        page.setSpace(space);
        page.setDirectory(directory);
        page.setTitle("空间发布说明");
        page.setSlug("space-release-note");
        page.setContent("空间正文");
        page.setCurrentVersionNumber(3);

        when(modelConfigService.generateEmbeddings(eq(9L), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(List.of(List.of(0.1d, 0.2d, 0.3d)));

        service.indexSpacePage(page);

        verify(qdrantClientService).upsertPoints(
                eq("wiki_space_chunks"),
                org.mockito.ArgumentMatchers.argThat(points -> {
                    if (points == null || points.isEmpty()) {
                        return false;
                    }
                    Map<String, Object> payload = points.get(0).payload();
                    return !payload.containsKey("projectId")
                            && Long.valueOf(9L).equals(payload.get("spaceId"))
                            && Long.valueOf(201L).equals(payload.get("pageId"));
                })
        );
    }

    @Test
    void shouldDeleteExistingPageChunksBeforeUpsert() {
        WikiKnowledgeSearchService service = createService();
        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("支付项目");
        WikiPageEntity page = new WikiPageEntity();
        page.setId(101L);
        page.setProject(project);
        page.setTitle("证书提醒");
        page.setSlug("cert-alert");
        page.setContent("证书提醒正文");
        page.setVisibilityScope(WikiPageService.VISIBILITY_PROJECT_MEMBERS);
        page.setCurrentVersionNumber(4);

        when(modelConfigService.generateEmbeddings(eq(9L), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(List.of(List.of(0.1d, 0.2d, 0.3d)));

        service.indexProjectPage(page);

        verify(qdrantClientService).deletePointsByFilter("wiki_project_chunks", Map.of("projectId", 12L, "pageId", 101L));
        verify(qdrantClientService).upsertPoints(eq("wiki_project_chunks"), org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void shouldBuildSpaceKnowledgeGraphWithDirectoryAndSemanticEdges() {
        // 阈值 0.9、每节点最多 1 条语义边，便于断言裁剪逻辑。
        WikiKnowledgeSearchService service = createGraphService(0.9d, 1);

        // 页面 201 两个 chunk，质心方向与 202 几乎一致（应连语义边），与 203 正交（不应连）。
        when(qdrantClientService.scrollPoints(eq("wiki_space_chunks"), eq(Map.of("spaceId", 8L)), eq(true), anyInt()))
                .thenReturn(List.of(
                        scrollPoint("c-201-0", List.of(1.0d, 0.0d, 0.0d), 201L, "登录设计", "login", 30L),
                        scrollPoint("c-201-1", List.of(0.9d, 0.1d, 0.0d), 201L, "登录设计", "login", 30L),
                        scrollPoint("c-202-0", List.of(0.95d, 0.05d, 0.0d), 202L, "登录改造", "login-rework", 30L),
                        scrollPoint("c-203-0", List.of(0.0d, 0.0d, 1.0d), 203L, "部署手册", "deploy", 31L)
                ));

        WikiSpaceKnowledgeGraph graph = service.buildSpaceKnowledgeGraph(8L, "知识空间", Map.of(30L, "产品目录", 31L, "运维目录"));

        assertThat(graph.vectorEnabled()).isTrue();
        // 3 个页面节点 + 2 个目录节点。
        assertThat(graph.nodes().stream().filter(n -> "WIKI_PAGE".equals(n.nodeType()))).hasSize(3);
        assertThat(graph.nodes().stream().filter(n -> "WIKI_DIRECTORY".equals(n.nodeType()))).hasSize(2);
        // 页面 201 聚合了 2 个 chunk。
        assertThat(graph.nodes().stream()
                .filter(n -> "WIKI_PAGE".equals(n.nodeType()) && n.bizId().equals(201L))
                .findFirst().orElseThrow().chunkCount()).isEqualTo(2);
        // 目录归属边：每个页面一条，共 3 条。
        assertThat(graph.edges().stream().filter(e -> "BELONGS_TO_DIRECTORY".equals(e.edgeType()))).hasSize(3);
        // 语义边：只有 201↔202 超过阈值。
        List<WikiSpaceKnowledgeGraph.Edge> semanticEdges = graph.edges().stream()
                .filter(e -> "SEMANTIC_SIMILAR".equals(e.edgeType()))
                .toList();
        assertThat(semanticEdges).hasSize(1);
        assertThat(semanticEdges.get(0).similarity()).isGreaterThanOrEqualTo(0.9d);
    }

    @Test
    void shouldReturnDisabledGraphWhenVectorIndexOff() {
        // embeddingModelId=0 表示未配置 Embedding，图谱应降级为未启用且不调用 Qdrant。
        WikiKnowledgeSearchService service = new WikiKnowledgeSearchService(
                new WikiKnowledgeProperties(
                        true, "http://localhost:6333", "", 20,
                        "wiki_project_chunks", "wiki_space_chunks", 0L, "", "", "", "OPENAI", 12, 24,
                        "", "", "", "openai-compatible", 15, 10, 0.78, 6, 256
                ),
                qdrantClientService, new WikiChunkingService(), modelConfigService,
                wikiPageRepository, wikiPageV2Repository, new ObjectMapper()
        );

        WikiSpaceKnowledgeGraph graph = service.buildSpaceKnowledgeGraph(8L, "知识空间", Map.of());

        assertThat(graph.vectorEnabled()).isFalse();
        assertThat(graph.nodes()).isEmpty();
        assertThat(graph.edges()).isEmpty();
    }

    private QdrantClientService.QdrantScrollPoint scrollPoint(String id,
                                                              List<Double> vector,
                                                              Long pageId,
                                                              String title,
                                                              String slug,
                                                              Long directoryId) {
        return new QdrantClientService.QdrantScrollPoint(
                id,
                vector,
                Map.of("pageId", pageId, "title", title, "slug", slug, "directoryId", directoryId, "spaceId", 8L)
        );
    }

    private WikiKnowledgeSearchService createGraphService(double threshold, int maxEdgesPerNode) {
        return new WikiKnowledgeSearchService(
                new WikiKnowledgeProperties(
                        true, "http://localhost:6333", "", 20,
                        "wiki_project_chunks", "wiki_space_chunks", 9L, "", "", "", "OPENAI", 12, 24,
                        "", "", "", "openai-compatible", 15, 10, threshold, maxEdgesPerNode, 256
                ),
                qdrantClientService, new WikiChunkingService(), modelConfigService,
                wikiPageRepository, wikiPageV2Repository, new ObjectMapper()
        );
    }

    private WikiKnowledgeSearchService createService() {        return new WikiKnowledgeSearchService(
                new WikiKnowledgeProperties(
                        true,
                        "http://localhost:6333",
                        "",
                        20,
                        "wiki_project_chunks",
                        "wiki_space_chunks",
                        9L,
                        "",
                        "",
                        "",
                        "OPENAI",
                        12,
                        24,
                        "",
                        "",
                        "",
                        "openai-compatible",
                        15,
                        10,
                        0.78,
                        6,
                        256
                ),
                qdrantClientService,
                new WikiChunkingService(),
                modelConfigService,
                wikiPageRepository,
                wikiPageV2Repository,
                new ObjectMapper()
        );
    }
}
