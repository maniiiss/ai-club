package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.MemoryFactEdgeSummary;
import com.aiclub.platform.dto.MemoryFactEntityDetail;
import com.aiclub.platform.dto.MemoryFactFactsResponse;
import com.aiclub.platform.dto.MemoryFactGraphSummary;
import com.aiclub.platform.dto.MemoryFactNodeSummary;
import com.aiclub.platform.repository.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

/**
 * 记忆事实图服务。
 * 业务职责主要有三件事：
 * 1. 解析当前项目或 Wiki 空间应读取哪些 Hindsight bank；
 * 2. 将多个 bank 的图与事实聚合成一个稳定视图；
 * 3. 在 Hindsight 不可用时返回空图/空事实和 warnings，而不是直接把页面打成白屏。
 */
@Service
@Transactional(readOnly = true)
public class MemoryFactGraphService {

    private static final int GRAPH_LIMIT = 200;
    private static final int FACT_LIMIT = 12;
    private static final int TABLE_FACT_LIMIT = 200;

    private final ProjectRepository projectRepository;
    private final HindsightClientService hindsightClientService;
    private final HindsightMemoryFallbackService hindsightMemoryFallbackService;
    private final HindsightProperties hindsightProperties;
    private final WikiSpaceService wikiSpaceService;
    private final MemoryFactGraphAssembler assembler;
    private final ProjectDataPermissionService projectDataPermissionService;

    public MemoryFactGraphService(ProjectRepository projectRepository,
                                  HindsightClientService hindsightClientService,
                                  HindsightMemoryFallbackService hindsightMemoryFallbackService,
                                  HindsightProperties hindsightProperties,
                                  WikiSpaceService wikiSpaceService,
                                  MemoryFactGraphAssembler assembler,
                                  ProjectDataPermissionService projectDataPermissionService) {
        this.projectRepository = projectRepository;
        this.hindsightClientService = hindsightClientService;
        this.hindsightMemoryFallbackService = hindsightMemoryFallbackService;
        this.hindsightProperties = hindsightProperties;
        this.wikiSpaceService = wikiSpaceService;
        this.assembler = assembler;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    public MemoryFactGraphSummary getProjectGraph(Long projectId) {
        requireProject(projectId);
        return getScopedGraph(MemoryFactScope.project(projectId));
    }

    /**
     * 读取单个 Wiki 空间自己的记忆事实图，避免入口依赖项目筛选状态。
     */
    public MemoryFactGraphSummary getWikiSpaceGraph(Long spaceId) {
        requireWikiSpace(spaceId);
        return getScopedGraph(MemoryFactScope.wikiSpace(spaceId));
    }

    private MemoryFactGraphSummary getScopedGraph(MemoryFactScope scope) {
        List<String> warnings = new ArrayList<>();
        List<String> graphBanks = resolveGraphBanks(scope);
        List<MemoryFactGraphAssembler.BankGraphPayload> graphs = new ArrayList<>();

        for (String bankId : graphBanks) {
            try {
                graphs.add(new MemoryFactGraphAssembler.BankGraphPayload(
                        bankId,
                        hindsightClientService.fetchEntityGraph(bankId, GRAPH_LIMIT)
                ));
            } catch (RuntimeException exception) {
                HindsightClientService.MemoryEntityGraph fallbackGraph = tryFallbackGraph(bankId, warnings, exception);
                if (fallbackGraph != null) {
                    graphs.add(new MemoryFactGraphAssembler.BankGraphPayload(bankId, fallbackGraph));
                    continue;
                }
                warnings.add("读取 Hindsight 实体图失败（bank=" + bankId + "）：" + sanitizeWarning(exception));
            }
        }

        if (graphs.isEmpty() && graphBanks.isEmpty()) {
            warnings.add(scope.emptyBankWarning());
        }
        if (scope.projectScope() && hindsightProperties.hasMemoryFactSharedBankId()) {
            warnings.add("共享 bank 当前仅参与事实召回，不参与实体图骨架聚合。");
        }
        return assembler.toGraphSummary(scope.projectId(), graphBanks, graphs, warnings);
    }

    public MemoryFactFactsResponse getFacts(Long projectId,
                                            String entityId,
                                            String edgeId,
                                            String query,
                                            Integer limit) {
        requireProject(projectId);
        return getScopedFacts(MemoryFactScope.project(projectId), entityId, edgeId, query, limit);
    }

    /**
     * 在 Wiki 空间 bank 内召回事实证据，空间图谱不再要求选择关联项目。
     */
    public MemoryFactFactsResponse getWikiSpaceFacts(Long spaceId,
                                                     String entityId,
                                                     String edgeId,
                                                     String query,
                                                     Integer limit) {
        requireWikiSpace(spaceId);
        return getScopedFacts(MemoryFactScope.wikiSpace(spaceId), entityId, edgeId, query, limit);
    }

    private MemoryFactFactsResponse getScopedFacts(MemoryFactScope scope,
                                                   String entityId,
                                                   String edgeId,
                                                   String query,
                                                   Integer limit) {
        int selectorCount = countSelected(entityId, edgeId, query);
        if (selectorCount > 1) {
            throw new IllegalArgumentException("facts 接口最多只能提供 entityId、edgeId、query 其中之一");
        }
        boolean scopedTableRequest = selectorCount == 0;

        MemoryFactGraphSummary graph = getScopedGraph(scope);
        String resolvedQuery = defaultString(query);
        String scopeType = scopedTableRequest ? "SCOPE" : "QUERY";
        String scopeId = scopedTableRequest
                ? scope.projectScope() ? String.valueOf(scope.projectId()) : String.valueOf(scope.spaceId())
                : defaultString(query);
        if (!defaultString(entityId).isBlank()) {
            MemoryFactNodeSummary node = findNode(graph, entityId);
            resolvedQuery = node.label();
            scopeType = "ENTITY";
            scopeId = entityId;
        } else if (!defaultString(edgeId).isBlank()) {
            MemoryFactEdgeSummary edge = findEdge(graph, edgeId);
            MemoryFactNodeSummary source = findNode(graph, edge.sourceId());
            MemoryFactNodeSummary target = findNode(graph, edge.targetId());
            resolvedQuery = (source == null ? "" : source.label()) + " " + (target == null ? "" : target.label());
            if (!defaultString(edge.relationType()).isBlank()) {
                resolvedQuery = resolvedQuery + " " + edge.relationType();
            }
            scopeType = "EDGE";
            scopeId = edgeId;
        }

        List<HindsightClientService.MemoryWorldFact> facts = new ArrayList<>();
        List<String> warnings = new ArrayList<>(graph.warnings() == null ? List.of() : graph.warnings());
        int defaultLimit = scopedTableRequest ? TABLE_FACT_LIMIT : FACT_LIMIT;
        int maxLimit = scopedTableRequest ? TABLE_FACT_LIMIT : 30;
        int effectiveLimit = limit == null ? defaultLimit : Math.max(1, Math.min(limit, maxLimit));
        for (String bankId : resolveRecallBanks(scope)) {
            try {
                facts.addAll(hindsightClientService.recallWorldFacts(
                        bankId,
                        resolvedQuery,
                        scope.recallTags(),
                        effectiveLimit
                ));
            } catch (RuntimeException exception) {
                List<HindsightClientService.MemoryWorldFact> fallbackFacts = tryFallbackFacts(scope, bankId, entityId, edgeId, resolvedQuery, effectiveLimit, warnings, exception);
                if (!fallbackFacts.isEmpty()) {
                    facts.addAll(fallbackFacts);
                    continue;
                }
                warnings.add("读取 Hindsight 事实失败（bank=" + bankId + "）：" + sanitizeWarning(exception));
            }
        }
        if (scopedTableRequest && facts.isEmpty()) {
            facts = loadFallbackFacts(scope, entityId, edgeId, resolvedQuery, effectiveLimit);
        }
        if (facts.size() > effectiveLimit) {
            facts = facts.subList(0, effectiveLimit);
        }
        return assembler.toFactsResponse(scope.projectId(), scopeType, scopeId, resolvedQuery, facts, warnings);
    }

    public MemoryFactEntityDetail getEntityDetail(Long projectId, String entityId) {
        requireProject(projectId);
        return getScopedEntityDetail(MemoryFactScope.project(projectId), entityId);
    }

    /**
     * 读取 Wiki 空间图谱中的实体详情，详情与事实证据都限定在当前空间 bank 内。
     */
    public MemoryFactEntityDetail getWikiSpaceEntityDetail(Long spaceId, String entityId) {
        requireWikiSpace(spaceId);
        return getScopedEntityDetail(MemoryFactScope.wikiSpace(spaceId), entityId);
    }

    private MemoryFactEntityDetail getScopedEntityDetail(MemoryFactScope scope, String entityId) {
        MemoryFactGraphSummary graph = getScopedGraph(scope);
        MemoryFactNodeSummary node = findNode(graph, entityId);
        ScopedEntityId scopedEntityId = parseScopedEntityId(entityId);
        List<String> warnings = new ArrayList<>(graph.warnings() == null ? List.of() : graph.warnings());
        HindsightClientService.MemoryEntityDetail detail = null;
        if (shouldFetchEntityDetail(node)) {
            try {
                detail = hindsightClientService.getEntityDetail(scopedEntityId.bankId(), scopedEntityId.rawId());
            } catch (RuntimeException exception) {
                detail = tryFallbackEntityDetail(scopedEntityId, warnings, exception);
                if (detail == null) {
                    warnings.add("读取 Hindsight 实体详情失败：" + sanitizeWarning(exception));
                }
            }
        }
        MemoryFactFactsResponse factsResponse = getScopedFacts(scope, entityId, null, null, FACT_LIMIT);
        warnings.addAll(factsResponse.warnings());
        return assembler.toEntityDetail(scope.projectId(), entityId, node, detail, factsResponse.facts().stream()
                .map(item -> new HindsightClientService.MemoryWorldFact(
                        item.id(),
                        item.type(),
                        item.subject(),
                        item.predicate(),
                        item.object(),
                        item.summary(),
                        item.confidence(),
                        item.sourceType(),
                        item.createdAt(),
                        item.tags(),
                        parseMetadata(item.metadataJson())
                ))
                .toList(), deduplicateWarnings(warnings));
    }

    /**
     * 图骨架优先走项目 bank 与项目相关的 Wiki space bank。
     * 旧逻辑图谱依赖的 Wiki 投影方法只读复用，不在这里修改它的行为。
     */
    private List<String> resolveGraphBanks(MemoryFactScope scope) {
        LinkedHashSet<String> bankIds = new LinkedHashSet<>();
        if (scope.wikiSpaceScope()) {
            bankIds.add(hindsightProperties.wikiSpaceBankId(scope.spaceId()));
            return List.copyOf(bankIds);
        }
        Long projectId = scope.projectId();
        bankIds.add(hindsightProperties.memoryFactProjectBankId(projectId));
        WikiSpaceService.WikiProjectGraphProjection projection = wikiSpaceService.buildProjectGraphProjection(projectId);
        if (projection != null) {
            projection.spaces().stream()
                    .map(space -> space == null ? null : space.getId())
                    .filter(Objects::nonNull)
                    .map(hindsightProperties::wikiSpaceBankId)
                    .forEach(bankIds::add);
            projection.pages().stream()
                    .map(page -> page == null || page.getSpace() == null ? null : page.getSpace().getId())
                    .filter(Objects::nonNull)
                    .map(hindsightProperties::wikiSpaceBankId)
                    .forEach(bankIds::add);
        }
        return List.copyOf(bankIds);
    }

    /**
     * 事实召回除了图骨架使用的 bank，还会补充显式配置的共享 bank，
     * 通过 `project:{id}` 标签做最小范围过滤。
     */
    private List<String> resolveRecallBanks(MemoryFactScope scope) {
        LinkedHashSet<String> bankIds = new LinkedHashSet<>(resolveGraphBanks(scope));
        if (scope.projectScope() && hindsightProperties.hasMemoryFactSharedBankId()) {
            bankIds.add(hindsightProperties.memoryFactSharedBankId());
        }
        return List.copyOf(bankIds);
    }

    private MemoryFactNodeSummary findNode(MemoryFactGraphSummary graph, String nodeId) {
        return graph.nodes().stream()
                .filter(item -> Objects.equals(item.id(), nodeId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("记忆事实图节点不存在: " + nodeId));
    }

    private MemoryFactEdgeSummary findEdge(MemoryFactGraphSummary graph, String edgeId) {
        return graph.edges().stream()
                .filter(item -> Objects.equals(item.id(), edgeId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("记忆事实图关系不存在: " + edgeId));
    }

    private ProjectEntity requireProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            // 项目记忆事实图属于项目级知识视图，用户访问时要跟项目权限走；
            // 若由后台链路无登录态触发，则继续允许读取，避免内部聚合流程被权限拦截。
            projectDataPermissionService.requireProjectVisible(project, scope);
        }
        return project;
    }

    private void requireWikiSpace(Long spaceId) {
        wikiSpaceService.getSpaceDetail(spaceId);
    }

    private ScopedEntityId parseScopedEntityId(String scopedId) {
        String value = defaultString(scopedId);
        int separator = value.indexOf("::");
        if (separator <= 0 || separator >= value.length() - 2) {
            throw new IllegalArgumentException("实体 ID 格式不正确: " + scopedId);
        }
        return new ScopedEntityId(value.substring(0, separator), value.substring(separator + 2));
    }

    private int countSelected(String entityId, String edgeId, String query) {
        int count = 0;
        if (!defaultString(entityId).isBlank()) {
            count++;
        }
        if (!defaultString(edgeId).isBlank()) {
            count++;
        }
        if (!defaultString(query).isBlank()) {
            count++;
        }
        return count;
    }

    /**
     * Hindsight /graph 返回的是事实节点时，没有对应的实体详情 UUID，避免把事实 ID 误拿去查实体接口。
     */
    private boolean shouldFetchEntityDetail(MemoryFactNodeSummary node) {
        if (node == null) {
            return true;
        }
        String entityType = defaultString(node.entityType()).toUpperCase();
        return !Set.of("FACT", "WORLD", "EXPERIENCE", "OPINION", "MEMORY").contains(entityType);
    }

    private List<String> deduplicateWarnings(List<String> warnings) {
        Set<String> values = new LinkedHashSet<>();
        values.addAll(warnings == null ? List.of() : warnings);
        return List.copyOf(values);
    }

    private String sanitizeWarning(RuntimeException exception) {
        String message = exception == null ? "" : exception.getMessage();
        if (message == null || message.isBlank()) {
            return "未知错误";
        }
        return message.length() > 180 ? message.substring(0, 180) : message;
    }

    private HindsightClientService.MemoryEntityGraph tryFallbackGraph(String bankId,
                                                                      List<String> warnings,
                                                                      RuntimeException exception) {
        if (!hindsightMemoryFallbackService.isEnabled()) {
            return null;
        }
        try {
            HindsightClientService.MemoryEntityGraph graph = hindsightMemoryFallbackService.fetchEntityGraph(bankId, GRAPH_LIMIT);
            if (!graph.nodes().isEmpty() || !graph.edges().isEmpty()) {
                warnings.add("Hindsight HTTP 不可用，已回退到库内实体图快照（bank=" + bankId + "）");
            }
            return graph;
        } catch (RuntimeException fallbackException) {
            warnings.add("Hindsight HTTP 与库内快照都不可用（bank=" + bankId + "）：" + sanitizeWarning(fallbackException));
            return null;
        }
    }

    private HindsightClientService.MemoryEntityDetail tryFallbackEntityDetail(ScopedEntityId scopedEntityId,
                                                                              List<String> warnings,
                                                                              RuntimeException exception) {
        if (!hindsightMemoryFallbackService.isEnabled()) {
            return null;
        }
        try {
            HindsightClientService.MemoryEntityDetail detail = hindsightMemoryFallbackService.getEntityDetail(scopedEntityId.bankId(), scopedEntityId.rawId());
            warnings.add("Hindsight HTTP 不可用，实体详情已回退到库内快照");
            return detail;
        } catch (RuntimeException fallbackException) {
            warnings.add("Hindsight HTTP 与库内实体详情都不可用：" + sanitizeWarning(fallbackException));
            return null;
        }
    }

    private List<HindsightClientService.MemoryWorldFact> tryFallbackFacts(MemoryFactScope scope,
                                                                          String bankId,
                                                                          String entityId,
                                                                          String edgeId,
                                                                          String resolvedQuery,
                                                                          int limit,
                                                                          List<String> warnings,
                                                                          RuntimeException exception) {
        if (!hindsightMemoryFallbackService.isEnabled()) {
            return List.of();
        }
        try {
            List<HindsightClientService.MemoryWorldFact> facts = loadFallbackFacts(scope, entityId, edgeId, resolvedQuery, limit);
            if (!facts.isEmpty()) {
                warnings.add("Hindsight HTTP 不可用，事实证据已回退到库内快照");
            }
            return facts;
        } catch (RuntimeException fallbackException) {
            warnings.add("Hindsight HTTP 与库内事实快照都不可用（bank=" + bankId + "）：" + sanitizeWarning(fallbackException));
            return List.of();
        }
    }

    /**
     * 表格模式允许“当前作用域下的全部事实”直接回退到库内快照查询，
     * 这样即便 Hindsight recall 不接受空查询，也能保持与 Hindsight Table 接近的数据形态。
     */
    private List<HindsightClientService.MemoryWorldFact> loadFallbackFacts(MemoryFactScope scope,
                                                                           String entityId,
                                                                           String edgeId,
                                                                           String resolvedQuery,
                                                                           int limit) {
        if (!defaultString(entityId).isBlank()) {
            ScopedEntityId scoped = parseScopedEntityId(entityId);
            return hindsightMemoryFallbackService.loadFactsByEntity(scoped.bankId(), scoped.rawId(), limit);
        }
        if (!defaultString(edgeId).isBlank()) {
            MemoryFactGraphSummary graph = getScopedGraph(scope);
            MemoryFactEdgeSummary edge = findEdge(graph, edgeId);
            ScopedEntityId source = parseScopedEntityId(edge.sourceId());
            ScopedEntityId target = parseScopedEntityId(edge.targetId());
            return hindsightMemoryFallbackService.loadFactsByEdge(source.bankId(), source.rawId(), target.rawId(), limit);
        }
        return hindsightMemoryFallbackService.searchFacts(resolveGraphBanks(scope), resolvedQuery, limit);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private java.util.Map<String, Object> parseMetadata(String metadataJson) {
        if (defaultString(metadataJson).isBlank()) {
            return java.util.Map.of();
        }
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                    metadataJson,
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.LinkedHashMap<String, Object>>() {
                    }
            );
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            return java.util.Map.of();
        }
    }

    private record ScopedEntityId(String bankId, String rawId) {
    }

    private record MemoryFactScope(String type, Long projectId, Long spaceId) {

        private static MemoryFactScope project(Long projectId) {
            return new MemoryFactScope("PROJECT", projectId, null);
        }

        private static MemoryFactScope wikiSpace(Long spaceId) {
            return new MemoryFactScope("WIKI_SPACE", null, spaceId);
        }

        private boolean projectScope() {
            return "PROJECT".equals(type);
        }

        private boolean wikiSpaceScope() {
            return "WIKI_SPACE".equals(type);
        }

        private List<String> recallTags() {
            if (wikiSpaceScope()) {
                return List.of("space:" + spaceId);
            }
            return List.of("project:" + projectId);
        }

        private String emptyBankWarning() {
            return wikiSpaceScope()
                    ? "当前 Wiki 空间尚未解析到可用的记忆 bank。"
                    : "当前项目尚未解析到可用的记忆 bank。";
        }
    }
}
