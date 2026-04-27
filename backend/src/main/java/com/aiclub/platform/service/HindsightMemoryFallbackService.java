package com.aiclub.platform.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Hindsight 数据库回退读取服务。
 * 只读查询 entities、entity_cooccurrences、memory_units 等表，为记忆事实图提供本地快照回退。
 */
@Service
public class HindsightMemoryFallbackService {

    private final HindsightProperties hindsightProperties;
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public HindsightMemoryFallbackService(HindsightProperties hindsightProperties,
                                          @Qualifier("hindsightMemoryJdbcTemplate") NamedParameterJdbcTemplate jdbcTemplate,
                                          ObjectMapper objectMapper) {
        this.hindsightProperties = hindsightProperties;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public boolean isEnabled() {
        return hindsightProperties.isMemoryFactDatabaseFallbackEnabled();
    }

    public HindsightClientService.MemoryEntityGraph fetchEntityGraph(String bankId, int limit) {
        if (!isEnabled()) {
            return new HindsightClientService.MemoryEntityGraph(List.of(), List.of());
        }
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("bankId", bankId)
                .addValue("limit", Math.max(1, Math.min(limit, 500)));
        List<HindsightClientService.MemoryEntityNode> nodes = jdbcTemplate.query(
                """
                select e.id::text as entity_id,
                       e.canonical_name,
                       e.mention_count,
                       e.metadata,
                       e.first_seen,
                       e.last_seen
                from entities e
                where e.bank_id = :bankId
                order by e.mention_count desc, e.canonical_name asc
                limit :limit
                """,
                params,
                (rs, rowNum) -> new HindsightClientService.MemoryEntityNode(
                        rs.getString("entity_id"),
                        defaultString(rs.getString("canonical_name")),
                        rs.getInt("mention_count"),
                        "",
                        mergeMetadata(
                                jsonMap(rs.getString("metadata")),
                                Map.of(
                                        "type", resolveEntityType(rs.getString("metadata")),
                                        "firstSeen", formatTime(rs.getTimestamp("first_seen")),
                                        "lastSeen", formatTime(rs.getTimestamp("last_seen"))
                                )
                        )
                )
        );
        List<HindsightClientService.MemoryEntityEdge> edges = jdbcTemplate.query(
                """
                select ec.entity_id_1::text as source_id,
                       ec.entity_id_2::text as target_id,
                       ec.cooccurrence_count,
                       ec.last_cooccurred
                from entity_cooccurrences ec
                join entities e1 on e1.id = ec.entity_id_1
                join entities e2 on e2.id = ec.entity_id_2
                where e1.bank_id = :bankId
                  and e2.bank_id = :bankId
                order by ec.cooccurrence_count desc, ec.last_cooccurred desc
                limit :limit
                """,
                params,
                (rs, rowNum) -> new HindsightClientService.MemoryEntityEdge(
                        rs.getString("source_id") + "-" + rs.getString("target_id"),
                        rs.getString("source_id"),
                        rs.getString("target_id"),
                        "co_occurrence",
                        rs.getDouble("cooccurrence_count"),
                        formatTime(rs.getTimestamp("last_cooccurred")),
                        Map.of(
                                "cooccurrenceCount", rs.getInt("cooccurrence_count"),
                                "sourceType", resolveSourceType(bankId)
                        )
                )
        );
        return new HindsightClientService.MemoryEntityGraph(nodes, edges);
    }

    public HindsightClientService.MemoryEntityDetail getEntityDetail(String bankId, String entityId) {
        if (!isEnabled()) {
            throw new IllegalStateException("Hindsight 数据库回退未启用");
        }
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("bankId", bankId)
                .addValue("entityId", UUID.fromString(entityId));
        return jdbcTemplate.queryForObject(
                """
                select e.id::text as entity_id,
                       e.canonical_name,
                       e.mention_count,
                       e.metadata,
                       e.first_seen,
                       e.last_seen
                from entities e
                where e.bank_id = :bankId
                  and e.id = :entityId
                """,
                params,
                (rs, rowNum) -> new HindsightClientService.MemoryEntityDetail(
                        rs.getString("entity_id"),
                        defaultString(rs.getString("canonical_name")),
                        rs.getInt("mention_count"),
                        resolveAliases(rs.getString("metadata")),
                        formatTime(rs.getTimestamp("first_seen")),
                        formatTime(rs.getTimestamp("last_seen")),
                        jsonMap(rs.getString("metadata")),
                        loadObservations(bankId, entityId)
                )
        );
    }

    public List<HindsightClientService.MemoryWorldFact> loadFactsByEntity(String bankId, String entityId, int limit) {
        if (!isEnabled()) {
            return List.of();
        }
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("bankId", bankId)
                .addValue("entityId", UUID.fromString(entityId))
                .addValue("limit", Math.max(1, Math.min(limit, 30)));
        return jdbcTemplate.query(
                """
                select mu.id::text as memory_id,
                       mu.text,
                       mu.fact_type,
                       mu.context,
                       mu.tags,
                       mu.metadata,
                       mu.document_id,
                       coalesce(mu.event_date, mu.mentioned_at, mu.created_at) as created_at
                from memory_units mu
                join unit_entities ue on ue.unit_id = mu.id
                where mu.bank_id = :bankId
                  and ue.entity_id = :entityId
                order by coalesce(mu.event_date, mu.mentioned_at, mu.created_at) desc, mu.created_at desc
                limit :limit
                """,
                params,
                (rs, rowNum) -> toFact(bankId, rs)
        );
    }

    public List<HindsightClientService.MemoryWorldFact> loadFactsByEdge(String bankId,
                                                                        String sourceEntityId,
                                                                        String targetEntityId,
                                                                        int limit) {
        if (!isEnabled()) {
            return List.of();
        }
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("bankId", bankId)
                .addValue("sourceEntityId", UUID.fromString(sourceEntityId))
                .addValue("targetEntityId", UUID.fromString(targetEntityId))
                .addValue("limit", Math.max(1, Math.min(limit, 30)));
        return jdbcTemplate.query(
                """
                select distinct mu.id::text as memory_id,
                       mu.text,
                       mu.fact_type,
                       mu.context,
                       mu.tags,
                       mu.metadata,
                       mu.document_id,
                       coalesce(mu.event_date, mu.mentioned_at, mu.created_at) as created_at
                from memory_units mu
                join unit_entities ue1 on ue1.unit_id = mu.id and ue1.entity_id = :sourceEntityId
                join unit_entities ue2 on ue2.unit_id = mu.id and ue2.entity_id = :targetEntityId
                where mu.bank_id = :bankId
                order by created_at desc, mu.id desc
                limit :limit
                """,
                params,
                (rs, rowNum) -> toFact(bankId, rs)
        );
    }

    public List<HindsightClientService.MemoryWorldFact> searchFacts(List<String> bankIds, String query, int limit) {
        return searchFacts(bankIds, query, "", limit);
    }

    /**
     * Table 模式在共享 bank 或多空间 bank 下需要按 project/space tag 做范围收敛，
     * 否则空查询回退会把同库中其他作用域的事实也一起带出来。
     */
    public List<HindsightClientService.MemoryWorldFact> searchFacts(List<String> bankIds,
                                                                    String query,
                                                                    String requiredTag,
                                                                    int limit) {
        if (!isEnabled() || bankIds == null || bankIds.isEmpty()) {
            return List.of();
        }
        // Table 模式一次会加载最多 200 条事实，库内回退上限要与前端作用域清单保持一致，
        // 否则 Hindsight HTTP 不可用时会被错误截断到 30 条。
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("bankIds", bankIds)
                .addValue("pattern", "%" + defaultString(query) + "%")
                .addValue("requiredTag", defaultString(requiredTag))
                .addValue("limit", Math.max(1, Math.min(limit, 200)));
        return jdbcTemplate.query(
                """
                select mu.id::text as memory_id,
                       mu.bank_id,
                       mu.text,
                       mu.fact_type,
                       mu.context,
                       mu.tags,
                       mu.metadata,
                       mu.document_id,
                       coalesce(mu.event_date, mu.mentioned_at, mu.created_at) as created_at
                from memory_units mu
                where mu.bank_id in (:bankIds)
                  and (:requiredTag = '' or :requiredTag = any(mu.tags))
                  and (
                    :pattern = '%%'
                    or mu.text ilike :pattern
                    or coalesce(mu.context, '') ilike :pattern
                    or coalesce(mu.document_id, '') ilike :pattern
                    or array_to_string(mu.tags, ',') ilike :pattern
                  )
                order by created_at desc, mu.id desc
                limit :limit
                """,
                params,
                (rs, rowNum) -> toFact(rs.getString("bank_id"), rs)
        );
    }

    private List<HindsightClientService.MemoryObservation> loadObservations(String bankId, String entityId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("bankId", bankId)
                .addValue("entityId", UUID.fromString(entityId))
                .addValue("limit", 10);
        return jdbcTemplate.query(
                """
                select mu.text,
                       coalesce(mu.event_date, mu.mentioned_at, mu.created_at) as created_at,
                       mu.metadata
                from memory_units mu
                join unit_entities ue on ue.unit_id = mu.id
                where mu.bank_id = :bankId
                  and ue.entity_id = :entityId
                order by created_at desc, mu.id desc
                limit :limit
                """,
                params,
                (rs, rowNum) -> new HindsightClientService.MemoryObservation(
                        defaultString(rs.getString("text")),
                        formatTime(rs.getTimestamp("created_at")),
                        jsonMap(rs.getString("metadata"))
                )
        );
    }

    private HindsightClientService.MemoryWorldFact toFact(String bankId, ResultSet rs) throws SQLException {
        return new HindsightClientService.MemoryWorldFact(
                rs.getString("memory_id"),
                defaultString(rs.getString("fact_type")).isBlank() ? "world" : rs.getString("fact_type"),
                "",
                defaultString(rs.getString("context")),
                "",
                defaultString(rs.getString("text")),
                null,
                resolveSourceType(bankId),
                formatTime(rs.getTimestamp("created_at")),
                sqlArrayToList(rs.getArray("tags")),
                mergeMetadata(
                        jsonMap(rs.getString("metadata")),
                        Map.of(
                                "bankId", bankId,
                                "documentId", defaultString(rs.getString("document_id"))
                        )
                )
        );
    }

    private Map<String, Object> mergeMetadata(Map<String, Object> left, Map<String, Object> right) {
        LinkedHashMap<String, Object> merged = new LinkedHashMap<>();
        merged.putAll(left == null ? Map.of() : left);
        merged.putAll(right == null ? Map.of() : right);
        return merged;
    }

    private List<String> resolveAliases(String metadataJson) {
        Map<String, Object> metadata = jsonMap(metadataJson);
        List<String> aliases = new ArrayList<>();
        appendAliasValues(aliases, metadata.get("aliases"));
        appendAliasValues(aliases, metadata.get("nameVariants"));
        appendAliasValues(aliases, metadata.get("name_variants"));
        return List.copyOf(new LinkedHashSet<>(aliases));
    }

    private void appendAliasValues(List<String> aliases, Object value) {
        if (value instanceof List<?> items) {
            for (Object item : items) {
                String text = defaultString(String.valueOf(item));
                if (!text.isBlank()) {
                    aliases.add(text);
                }
            }
        }
    }

    private Map<String, Object> jsonMap(String value) {
        if (value == null || value.isBlank() || "{}".equals(value)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(value, new TypeReference<LinkedHashMap<String, Object>>() {
            });
        } catch (JsonProcessingException exception) {
            return Map.of();
        }
    }

    private List<String> sqlArrayToList(Array array) {
        if (array == null) {
            return List.of();
        }
        try {
            Object raw = array.getArray();
            if (raw instanceof Object[] values) {
                LinkedHashSet<String> tags = new LinkedHashSet<>();
                for (Object item : values) {
                    String value = defaultString(String.valueOf(item));
                    if (!value.isBlank()) {
                        tags.add(value);
                    }
                }
                return List.copyOf(tags);
            }
        } catch (SQLException ignored) {
            // 回退为空即可。
        }
        return List.of();
    }

    private String formatTime(Timestamp timestamp) {
        if (timestamp == null) {
            return "";
        }
        return timestamp.toInstant().atOffset(OffsetDateTime.now().getOffset()).toString();
    }

    private String resolveEntityType(String metadataJson) {
        Map<String, Object> metadata = jsonMap(metadataJson);
        Object type = metadata.get("type");
        if (type == null) {
            type = metadata.get("entityType");
        }
        if (type == null) {
            type = metadata.get("entity_type");
        }
        String value = defaultString(type == null ? "" : String.valueOf(type));
        return value.isBlank() ? "ENTITY" : value.toUpperCase();
    }

    private String resolveSourceType(String bankId) {
        String normalized = defaultString(bankId);
        if (normalized.contains(":wiki:space:")) {
            return "WIKI_SPACE";
        }
        if (normalized.contains(":wiki:project:")) {
            return "WIKI";
        }
        return "MEMORY";
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
