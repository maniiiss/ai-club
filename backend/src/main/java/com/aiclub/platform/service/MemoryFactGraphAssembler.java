package com.aiclub.platform.service;

import com.aiclub.platform.dto.MemoryFactEdgeSummary;
import com.aiclub.platform.dto.MemoryFactEntityDetail;
import com.aiclub.platform.dto.MemoryFactFactsResponse;
import com.aiclub.platform.dto.MemoryFactGraphSummary;
import com.aiclub.platform.dto.MemoryFactItem;
import com.aiclub.platform.dto.MemoryFactNodeSummary;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 记忆事实图组装器。
 * 这里负责把多个 bank 的 Hindsight 原始结果整理成平台稳定 DTO，
 * 保证前端不感知不同 bank 或不同 Hindsight 版本的字段差异。
 */
@Component
public class MemoryFactGraphAssembler {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ObjectMapper objectMapper;

    public MemoryFactGraphAssembler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public MemoryFactGraphSummary toGraphSummary(Long projectId,
                                                 List<String> bankIds,
                                                 List<BankGraphPayload> graphs,
                                                 List<String> warnings) {
        LinkedHashMap<String, MutableNode> nodeMap = new LinkedHashMap<>();
        LinkedHashMap<String, MutableEdge> edgeMap = new LinkedHashMap<>();

        for (BankGraphPayload payload : graphs) {
            for (HindsightClientService.MemoryEntityNode node : payload.graph().nodes()) {
                String nodeId = composeScopedId(payload.bankId(), node.id());
                MutableNode current = nodeMap.computeIfAbsent(nodeId, ignored -> new MutableNode(
                        nodeId,
                        resolveEntityType(node),
                        defaultString(node.label()),
                        resolveAliases(node.metadata()),
                        0,
                        Math.max(1, safeInt(node.mentionCount())),
                        metadataJson(buildNodeMetadata(payload.bankId(), node))
                ));
                current.factCount = Math.max(current.factCount, Math.max(1, safeInt(node.mentionCount())));
                current.aliases = mergeStringList(current.aliases, resolveAliases(node.metadata()));
            }

            for (HindsightClientService.MemoryEntityEdge edge : payload.graph().edges()) {
                String sourceId = composeScopedId(payload.bankId(), edge.sourceId());
                String targetId = composeScopedId(payload.bankId(), edge.targetId());
                if (!nodeMap.containsKey(sourceId) || !nodeMap.containsKey(targetId)) {
                    continue;
                }
                String edgeId = composeScopedId(payload.bankId(), defaultString(edge.id()).isBlank()
                        ? edge.sourceId() + "->" + edge.targetId()
                        : edge.id());
                MutableEdge current = edgeMap.computeIfAbsent(edgeId, ignored -> new MutableEdge(
                        edgeId,
                        sourceId,
                        targetId,
                        defaultString(edge.relationType()).isBlank() ? "CO_OCCURRENCE" : edge.relationType(),
                        edge.weight() == null ? 1.0d : edge.weight(),
                        List.of(),
                        metadataJson(buildEdgeMetadata(payload.bankId(), edge))
                ));
                current.weight = Math.max(current.weight, edge.weight() == null ? 1.0d : edge.weight());
                nodeMap.get(sourceId).degree++;
                nodeMap.get(targetId).degree++;
            }
        }

        List<MemoryFactNodeSummary> nodes = nodeMap.values().stream()
                .map(node -> new MemoryFactNodeSummary(
                        node.id,
                        node.entityType,
                        node.label,
                        List.copyOf(node.aliases),
                        node.degree,
                        node.factCount,
                        node.metadataJson
                ))
                .toList();
        List<MemoryFactEdgeSummary> edges = edgeMap.values().stream()
                .map(edge -> new MemoryFactEdgeSummary(
                        edge.id,
                        edge.sourceId,
                        edge.targetId,
                        edge.relationType,
                        edge.weight,
                        edge.factIds,
                        edge.metadataJson
                ))
                .toList();
        int factCount = nodes.stream().mapToInt(item -> item.factCount() == null ? 0 : item.factCount()).sum();
        String summaryBankId = bankIds == null || bankIds.isEmpty()
                ? ""
                : bankIds.size() == 1 ? bankIds.get(0) : "MULTI";
        return new MemoryFactGraphSummary(
                projectId,
                summaryBankId,
                TIME_FORMATTER.format(LocalDateTime.now()),
                nodes.size(),
                edges.size(),
                factCount,
                List.copyOf(warnings == null ? List.of() : warnings),
                nodes,
                edges
        );
    }

    public MemoryFactFactsResponse toFactsResponse(Long projectId,
                                                   String scopeType,
                                                   String scopeId,
                                                   String query,
                                                   List<HindsightClientService.MemoryWorldFact> facts,
                                                   List<String> warnings) {
        List<MemoryFactItem> items = facts.stream()
                .map(this::toFactItem)
                .toList();
        return new MemoryFactFactsResponse(
                projectId,
                defaultString(scopeType),
                defaultString(scopeId),
                defaultString(query),
                items.size(),
                List.copyOf(warnings == null ? List.of() : warnings),
                items
        );
    }

    public MemoryFactEntityDetail toEntityDetail(Long projectId,
                                                 String entityId,
                                                 MemoryFactNodeSummary node,
                                                 HindsightClientService.MemoryEntityDetail detail,
                                                 List<HindsightClientService.MemoryWorldFact> facts,
                                                 List<String> warnings) {
        List<String> observations = detail == null
                ? List.of()
                : detail.observations().stream()
                .map(HindsightClientService.MemoryObservation::text)
                .filter(value -> value != null && !value.isBlank())
                .toList();
        LinkedHashSet<String> aliases = new LinkedHashSet<>();
        if (node != null && node.aliases() != null) {
            aliases.addAll(node.aliases());
        }
        if (detail != null && detail.aliases() != null) {
            aliases.addAll(detail.aliases());
        }
        return new MemoryFactEntityDetail(
                projectId,
                entityId,
                detail != null && !defaultString(detail.canonicalName()).isBlank() ? detail.canonicalName() : node == null ? "" : node.label(),
                detail == null ? node == null ? "" : node.entityType() : resolveEntityType(detail.metadata()),
                List.copyOf(aliases),
                node == null ? 0 : safeInt(node.degree()),
                node == null ? detail == null ? 0 : safeInt(detail.mentionCount()) : safeInt(node.factCount()),
                observations,
                metadataJson(buildEntityDetailMetadata(detail, node)),
                List.copyOf(warnings == null ? List.of() : warnings),
                facts.stream().map(this::toFactItem).toList()
        );
    }

    public String composeScopedId(String bankId, String rawId) {
        return defaultString(bankId) + "::" + defaultString(rawId);
    }

    private MemoryFactItem toFactItem(HindsightClientService.MemoryWorldFact fact) {
        return new MemoryFactItem(
                defaultString(fact.id()),
                defaultString(fact.type()),
                defaultString(fact.subject()),
                defaultString(fact.predicate()),
                defaultString(fact.object()),
                defaultString(fact.summary()),
                fact.confidence(),
                defaultString(fact.sourceType()),
                defaultString(fact.createdAt()),
                List.copyOf(fact.tags() == null ? List.of() : fact.tags()),
                metadataJson(fact.metadata())
        );
    }

    private Map<String, Object> buildNodeMetadata(String bankId, HindsightClientService.MemoryEntityNode node) {
        LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("bankId", bankId);
        metadata.put("rawEntityId", node.id());
        metadata.put("mentionCount", node.mentionCount());
        metadata.put("color", defaultString(node.color()));
        metadata.put("sourceType", resolveSourceType(bankId));
        metadata.put("raw", node.metadata());
        return metadata;
    }

    private Map<String, Object> buildEdgeMetadata(String bankId, HindsightClientService.MemoryEntityEdge edge) {
        LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("bankId", bankId);
        metadata.put("rawEdgeId", edge.id());
        metadata.put("rawSourceId", edge.sourceId());
        metadata.put("rawTargetId", edge.targetId());
        metadata.put("lastSeenAt", defaultString(edge.lastSeenAt()));
        metadata.put("sourceType", resolveSourceType(bankId));
        metadata.put("raw", edge.metadata());
        return metadata;
    }

    private Map<String, Object> buildEntityDetailMetadata(HindsightClientService.MemoryEntityDetail detail,
                                                          MemoryFactNodeSummary node) {
        LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
        if (node != null) {
            metadata.put("graphNodeMetadata", parseMetadata(node.metadataJson()));
        }
        if (detail != null) {
            metadata.put("entityDetail", detail.metadata());
            metadata.put("firstSeenAt", defaultString(detail.firstSeenAt()));
            metadata.put("lastSeenAt", defaultString(detail.lastSeenAt()));
        }
        return metadata;
    }

    private List<String> resolveAliases(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return List.of();
        }
        Object aliases = metadata.get("aliases");
        if (aliases instanceof List<?> values) {
            return values.stream().map(String::valueOf).filter(value -> !value.isBlank()).toList();
        }
        Object nameVariants = metadata.get("nameVariants");
        if (nameVariants instanceof List<?> values) {
            return values.stream().map(String::valueOf).filter(value -> !value.isBlank()).toList();
        }
        Object snakeCase = metadata.get("name_variants");
        if (snakeCase instanceof List<?> values) {
            return values.stream().map(String::valueOf).filter(value -> !value.isBlank()).toList();
        }
        return List.of();
    }

    private String resolveEntityType(HindsightClientService.MemoryEntityNode node) {
        return resolveEntityType(node == null ? Map.of() : node.metadata());
    }

    private String resolveEntityType(Map<String, Object> metadata) {
        Object type = metadata == null ? null : metadata.get("type");
        if (type == null && metadata != null) {
            type = metadata.get("entityType");
        }
        if (type == null && metadata != null) {
            type = metadata.get("entity_type");
        }
        String value = defaultString(type == null ? "" : String.valueOf(type));
        return value.isBlank() ? "ENTITY" : value.toUpperCase();
    }

    private String resolveSourceType(String bankId) {
        String normalized = defaultString(bankId);
        if (normalized.contains(":wiki:")) {
            return "WIKI";
        }
        if (normalized.contains(":space:")) {
            return "WIKI_SPACE";
        }
        return "MEMORY";
    }

    private List<String> mergeStringList(List<String> left, List<String> right) {
        LinkedHashSet<String> values = new LinkedHashSet<>();
        values.addAll(left == null ? List.of() : left);
        values.addAll(right == null ? List.of() : right);
        return List.copyOf(values);
    }

    private Map<String, Object> parseMetadata(String metadataJson) {
        if (defaultString(metadataJson).isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(metadataJson, objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (JsonProcessingException exception) {
            return Map.of();
        }
    }

    private String metadataJson(Map<String, Object> data) {
        try {
            return objectMapper.writeValueAsString(data == null ? Map.of() : data);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    public record BankGraphPayload(String bankId, HindsightClientService.MemoryEntityGraph graph) {
    }

    private static final class MutableNode {
        private final String id;
        private final String entityType;
        private final String label;
        private List<String> aliases;
        private int degree;
        private int factCount;
        private final String metadataJson;

        private MutableNode(String id,
                            String entityType,
                            String label,
                            List<String> aliases,
                            int degree,
                            int factCount,
                            String metadataJson) {
            this.id = id;
            this.entityType = entityType;
            this.label = label;
            this.aliases = aliases == null ? new ArrayList<>() : new ArrayList<>(aliases);
            this.degree = degree;
            this.factCount = factCount;
            this.metadataJson = metadataJson;
        }
    }

    private static final class MutableEdge {
        private final String id;
        private final String sourceId;
        private final String targetId;
        private final String relationType;
        private double weight;
        private final List<String> factIds;
        private final String metadataJson;

        private MutableEdge(String id,
                            String sourceId,
                            String targetId,
                            String relationType,
                            double weight,
                            List<String> factIds,
                            String metadataJson) {
            this.id = id;
            this.sourceId = sourceId;
            this.targetId = targetId;
            this.relationType = relationType;
            this.weight = weight;
            this.factIds = factIds == null ? List.of() : List.copyOf(factIds);
            this.metadataJson = metadataJson;
        }
    }
}
