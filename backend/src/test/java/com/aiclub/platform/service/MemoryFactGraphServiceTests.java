package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.MemoryFactEntityDetail;
import com.aiclub.platform.dto.MemoryFactFactsResponse;
import com.aiclub.platform.dto.MemoryFactGraphSummary;
import com.aiclub.platform.dto.WikiSpaceDetail;
import com.aiclub.platform.repository.ProjectRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 记忆事实图服务测试。
 * 重点覆盖 bank 解析、warnings 降级和 scoped entity id 解析，不把行为耦合到 Hindsight 真实在线环境。
 */
@ExtendWith(MockitoExtension.class)
class MemoryFactGraphServiceTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private HindsightClientService hindsightClientService;

    @Mock
    private HindsightMemoryFallbackService hindsightMemoryFallbackService;

    @Mock
    private WikiSpaceService wikiSpaceService;

    private MemoryFactGraphService serviceWithoutSharedBank;
    private MemoryFactGraphService serviceWithSharedBank;

    @BeforeEach
    void setUp() {
        MemoryFactGraphAssembler assembler = new MemoryFactGraphAssembler(new ObjectMapper());
        serviceWithoutSharedBank = new MemoryFactGraphService(
                projectRepository,
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties(
                        "http://localhost:18888",
                        "",
                        "git-ai-club",
                        "mid",
                        30,
                        "",
                        "",
                        "/v1/default/banks/{bankId}/graph",
                        "/v1/default/banks/{bankId}/entities/{entityId}",
                        "/v1/default/banks/{bankId}/memories/recall",
                        true,
                        "jdbc:postgresql://localhost:5432/hindsight",
                        "aiclub",
                        "aiclub123"
                ),
                wikiSpaceService,
                assembler
        );
        serviceWithSharedBank = new MemoryFactGraphService(
                projectRepository,
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties(
                        "http://localhost:18888",
                        "",
                        "git-ai-club",
                        "mid",
                        30,
                        "",
                        "{bankPrefix}:memory:shared",
                        "/v1/default/banks/{bankId}/graph",
                        "/v1/default/banks/{bankId}/entities/{entityId}",
                        "/v1/default/banks/{bankId}/memories/recall",
                        true,
                        "jdbc:postgresql://localhost:5432/hindsight",
                        "aiclub",
                        "aiclub123"
                ),
                wikiSpaceService,
                assembler
        );
        lenient().when(projectRepository.findById(12L)).thenReturn(Optional.of(project(12L)));
    }

    @Test
    void shouldMergeProjectAndWikiSpaceBanksIntoOneGraph() {
        when(wikiSpaceService.buildProjectGraphProjection(12L)).thenReturn(new WikiSpaceService.WikiProjectGraphProjection(
                List.of(space(9L)),
                List.of(),
                List.of()
        ));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:project:12", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(
                        new HindsightClientService.MemoryEntityNode("Paris", "Paris", 4, "blue", Map.of("type", "LOCATION")),
                        new HindsightClientService.MemoryEntityNode("Berlin", "Berlin", 3, "blue", Map.of("type", "LOCATION"))
                ),
                List.of(
                        new HindsightClientService.MemoryEntityEdge("edge-1", "Paris", "Berlin", "co_occurrence", 4.0d, "2026-04-24T09:00:00Z", Map.of())
                )
        ));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:space:9", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(
                        new HindsightClientService.MemoryEntityNode("ReleaseNotes", "Release Notes", 2, "orange", Map.of("type", "DOCUMENT"))
                ),
                List.of()
        ));

        MemoryFactGraphSummary summary = serviceWithoutSharedBank.getProjectGraph(12L);

        assertThat(summary.bankId()).isEqualTo("MULTI");
        assertThat(summary.nodeCount()).isEqualTo(3);
        assertThat(summary.edgeCount()).isEqualTo(1);
        assertThat(summary.factCount()).isEqualTo(9);
        assertThat(summary.warnings()).isEmpty();
        assertThat(summary.nodes()).extracting(item -> item.id())
                .contains("git-ai-club:wiki:project:12::Paris", "git-ai-club:wiki:space:9::ReleaseNotes");
    }

    @Test
    void shouldReturnWarningsAndEmptyGraphWhenHindsightGraphFails() {
        when(wikiSpaceService.buildProjectGraphProjection(12L)).thenReturn(new WikiSpaceService.WikiProjectGraphProjection(
                List.of(),
                List.of(),
                List.of()
        ));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:project:12", 200))
                .thenThrow(new IllegalStateException("连接失败"));

        MemoryFactGraphSummary summary = serviceWithoutSharedBank.getProjectGraph(12L);

        assertThat(summary.nodeCount()).isZero();
        assertThat(summary.edgeCount()).isZero();
        assertThat(summary.warnings()).isNotEmpty();
        assertThat(summary.warnings().get(0)).contains("读取 Hindsight 实体图失败");
    }

    @Test
    void shouldFallbackToDatabaseSnapshotWhenHindsightGraphIsUnavailable() {
        when(hindsightMemoryFallbackService.isEnabled()).thenReturn(true);
        when(wikiSpaceService.buildProjectGraphProjection(12L)).thenReturn(new WikiSpaceService.WikiProjectGraphProjection(
                List.of(),
                List.of(),
                List.of()
        ));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:project:12", 200))
                .thenThrow(new IllegalStateException("Hindsight 服务未正常就绪"));
        when(hindsightMemoryFallbackService.fetchEntityGraph("git-ai-club:wiki:project:12", 200))
                .thenReturn(new HindsightClientService.MemoryEntityGraph(
                        List.of(new HindsightClientService.MemoryEntityNode("entity-1", "数据库回退实体", 2, "", Map.of("type", "ENTITY"))),
                        List.of()
                ));

        MemoryFactGraphSummary summary = serviceWithoutSharedBank.getProjectGraph(12L);

        assertThat(summary.nodeCount()).isEqualTo(1);
        assertThat(summary.nodes().get(0).label()).isEqualTo("数据库回退实体");
        assertThat(summary.warnings()).anyMatch(item -> item.contains("已回退到库内实体图快照"));
    }

    @Test
    void shouldRecallFactsFromProjectAndSharedBanksWithProjectTags() {
        when(wikiSpaceService.buildProjectGraphProjection(12L)).thenReturn(new WikiSpaceService.WikiProjectGraphProjection(
                List.of(),
                List.of(),
                List.of()
        ));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:project:12", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(new HindsightClientService.MemoryEntityNode("Paris", "Paris", 4, "blue", Map.of("type", "LOCATION"))),
                List.of()
        ));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:wiki:project:12"), eq("Paris"), eq(List.of("project:12")), anyInt()))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-1", "world", "Paris", "mentions", "France", "Paris summary", 0.9d, "HINDSIGHT_RECALL",
                        "2026-04-24T09:00:00Z", List.of("project:12"), Map.of()
                )));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:memory:shared"), eq("Paris"), eq(List.of("project:12")), anyInt()))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-2", "world", "Paris", "related", "Travel", "Shared bank summary", 0.8d, "HINDSIGHT_RECALL",
                        "2026-04-24T10:00:00Z", List.of("project:12"), Map.of()
                )));

        MemoryFactFactsResponse facts = serviceWithSharedBank.getFacts(12L, "git-ai-club:wiki:project:12::Paris", null, null, 10);

        assertThat(facts.factCount()).isEqualTo(2);
        assertThat(facts.facts()).extracting(item -> item.id()).containsExactly("fact-1", "fact-2");
        assertThat(facts.warnings()).anyMatch(item -> item.contains("共享 bank 当前仅参与事实召回"));
        verify(hindsightClientService).recallWorldFacts("git-ai-club:wiki:project:12", "Paris", List.of("project:12"), 10);
        verify(hindsightClientService).recallWorldFacts("git-ai-club:memory:shared", "Paris", List.of("project:12"), 10);
    }

    @Test
    void shouldReadWikiSpaceGraphFromItsOwnBank() {
        when(wikiSpaceService.getSpaceDetail(9L)).thenReturn(spaceDetail(9L));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:space:9", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(new HindsightClientService.MemoryEntityNode("SpacePage", "空间页面", 3, "orange", Map.of("type", "DOCUMENT"))),
                List.of()
        ));

        MemoryFactGraphSummary summary = serviceWithoutSharedBank.getWikiSpaceGraph(9L);

        assertThat(summary.projectId()).isNull();
        assertThat(summary.bankId()).isEqualTo("git-ai-club:wiki:space:9");
        assertThat(summary.nodeCount()).isEqualTo(1);
        assertThat(summary.nodes()).extracting(item -> item.id()).containsExactly("git-ai-club:wiki:space:9::SpacePage");
        assertThat(summary.warnings()).isEmpty();
    }

    @Test
    void shouldRecallWikiSpaceFactsWithSpaceTag() {
        when(wikiSpaceService.getSpaceDetail(9L)).thenReturn(spaceDetail(9L));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:space:9", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(new HindsightClientService.MemoryEntityNode("SpacePage", "空间页面", 3, "orange", Map.of("type", "DOCUMENT"))),
                List.of()
        ));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:wiki:space:9"), eq("空间页面"), eq(List.of("space:9")), anyInt()))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-space-1", "world", "空间页面", "mentions", "空间事实", "空间级事实", 0.9d, "HINDSIGHT_RECALL",
                        "2026-04-24T09:00:00Z", List.of("space:9"), Map.of()
                )));

        MemoryFactFactsResponse facts = serviceWithSharedBank.getWikiSpaceFacts(9L, "git-ai-club:wiki:space:9::SpacePage", null, null, 10);

        assertThat(facts.projectId()).isNull();
        assertThat(facts.factCount()).isEqualTo(1);
        assertThat(facts.facts()).extracting(item -> item.id()).containsExactly("fact-space-1");
        assertThat(facts.warnings()).noneMatch(item -> item.contains("共享 bank 当前仅参与事实召回"));
        verify(hindsightClientService).recallWorldFacts("git-ai-club:wiki:space:9", "空间页面", List.of("space:9"), 10);
    }

    @Test
    void shouldNotFetchEntityDetailForFactGraphNode() {
        when(wikiSpaceService.getSpaceDetail(9L)).thenReturn(spaceDetail(9L));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:space:9", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(new HindsightClientService.MemoryEntityNode("fact-1", "空间事实", 1, "#42a5f5", Map.of(
                        "type", "FACT",
                        "text", "空间事实来自 Hindsight 图节点"
                ))),
                List.of()
        ));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:wiki:space:9"), eq("空间事实"), eq(List.of("space:9")), anyInt()))
                .thenReturn(List.of());

        MemoryFactEntityDetail detail = serviceWithoutSharedBank.getWikiSpaceEntityDetail(9L, "git-ai-club:wiki:space:9::fact-1");

        assertThat(detail.entityType()).isEqualTo("FACT");
        assertThat(detail.observations()).containsExactly("空间事实来自 Hindsight 图节点");
        assertThat(detail.warnings()).noneMatch(item -> item.contains("实体详情"));
        verify(hindsightClientService, never()).getEntityDetail("git-ai-club:wiki:space:9", "fact-1");
    }

    @Test
    void shouldLoadEntityDetailFromScopedEntityId() {
        when(wikiSpaceService.buildProjectGraphProjection(12L)).thenReturn(new WikiSpaceService.WikiProjectGraphProjection(
                List.of(),
                List.of(),
                List.of()
        ));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:project:12", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(new HindsightClientService.MemoryEntityNode("Paris", "Paris", 4, "blue", Map.of("type", "LOCATION"))),
                List.of()
        ));
        when(hindsightClientService.getEntityDetail("git-ai-club:wiki:project:12", "Paris")).thenReturn(
                new HindsightClientService.MemoryEntityDetail(
                        "Paris",
                        "Paris",
                        4,
                        List.of("巴黎"),
                        "2026-04-01T10:00:00Z",
                        "2026-04-24T10:00:00Z",
                        Map.of("type", "LOCATION"),
                        List.of(new HindsightClientService.MemoryObservation("Paris is the capital of France.", "2026-04-24T10:00:00Z", Map.of()))
                )
        );
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:wiki:project:12"), eq("Paris"), eq(List.of("project:12")), anyInt()))
                .thenReturn(List.of());

        MemoryFactEntityDetail detail = serviceWithoutSharedBank.getEntityDetail(12L, "git-ai-club:wiki:project:12::Paris");

        assertThat(detail.entityId()).isEqualTo("git-ai-club:wiki:project:12::Paris");
        assertThat(detail.label()).isEqualTo("Paris");
        assertThat(detail.aliases()).contains("巴黎");
        assertThat(detail.observations()).contains("Paris is the capital of France.");
    }

    @Test
    void shouldFallbackFactsToDatabaseSnapshotWhenHindsightRecallFails() {
        when(hindsightMemoryFallbackService.isEnabled()).thenReturn(true);
        when(wikiSpaceService.buildProjectGraphProjection(12L)).thenReturn(new WikiSpaceService.WikiProjectGraphProjection(
                List.of(),
                List.of(),
                List.of()
        ));
        when(hindsightClientService.fetchEntityGraph("git-ai-club:wiki:project:12", 200)).thenReturn(new HindsightClientService.MemoryEntityGraph(
                List.of(new HindsightClientService.MemoryEntityNode("entity-1", "数据库回退实体", 4, "", Map.of("type", "ENTITY"))),
                List.of()
        ));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:wiki:project:12"), eq("数据库回退实体"), eq(List.of("project:12")), anyInt()))
                .thenThrow(new IllegalStateException("Hindsight 服务未正常就绪"));
        when(hindsightMemoryFallbackService.loadFactsByEntity("git-ai-club:wiki:project:12", "entity-1", 10))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-db-1", "world", "", "context", "", "数据库回退事实", null, "WIKI",
                        "2026-04-24T10:00:00Z", List.of("project:12"), Map.of()
                )));

        MemoryFactFactsResponse response = serviceWithoutSharedBank.getFacts(12L, "git-ai-club:wiki:project:12::entity-1", null, null, 10);

        assertThat(response.factCount()).isEqualTo(1);
        assertThat(response.facts().get(0).summary()).isEqualTo("数据库回退事实");
        assertThat(response.warnings()).anyMatch(item -> item.contains("事实证据已回退到库内快照"));
    }

    private ProjectEntity project(Long id) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        project.setName("测试项目");
        return project;
    }

    private WikiSpaceEntity space(Long id) {
        WikiSpaceEntity entity = new WikiSpaceEntity();
        entity.setId(id);
        entity.setName("空间-" + id);
        return entity;
    }

    private WikiSpaceDetail spaceDetail(Long id) {
        return new WikiSpaceDetail(
                id,
                "空间-" + id,
                "",
                WikiSpaceService.READ_SCOPE_ALL_LOGGED_IN,
                null,
                null,
                WikiSpaceService.MEMBER_SOURCE_MANUAL,
                WikiSpaceService.ROLE_VIEWER,
                "测试用户",
                0,
                0,
                0,
                false,
                "",
                ""
        );
    }
}
