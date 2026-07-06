package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataChangeAuditEntity;
import com.aiclub.platform.domain.model.DataChangeRequestEntity;
import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import com.aiclub.platform.domain.model.DataWorkbenchFieldEntity;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeDsl;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangePreviewResult;
import com.aiclub.platform.repository.DataChangeAuditRepository;
import com.aiclub.platform.repository.DataChangeRequestRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * DataChange SQL 执行器。
 * 业务意图：SQL 永远由后端根据实体/字段白名单生成，并在执行事务中保存 before/after 快照。
 * v2 起实体在配置层就绑定平台项目，此处不再向业务表拼接项目隔离条件；项目一致性由 DataChangeService 提前校验。
 */
@Service
public class DataChangeSqlExecutor {

    private static final Pattern SQL_IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final DataChangeAuditRepository auditRepository;
    private final DataChangeRequestRepository requestRepository;
    private final DataWorkbenchMapper mapper;
    private final ObjectMapper objectMapper;

    public DataChangeSqlExecutor(NamedParameterJdbcTemplate jdbcTemplate,
                                 DataChangeAuditRepository auditRepository,
                                 DataChangeRequestRepository requestRepository,
                                 DataWorkbenchMapper mapper,
                                 ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditRepository = auditRepository;
        this.requestRepository = requestRepository;
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public DataChangePreviewResult preview(DataWorkbenchEntity entity, DataChangeDsl dsl) {
        PreparedChange prepared = prepare(entity, dsl);
        List<Map<String, Object>> rows = selectRows(entity, prepared.whereParams(), false);
        List<String> risks = new ArrayList<>(prepared.riskReasons());
        int affectedRows = rows.size();
        if (affectedRows == 0) {
            risks.add("定位条件未命中任何数据");
        }
        if (affectedRows > entity.getMaxAffectedRows()) {
            risks.add("预估影响 " + affectedRows + " 行，超过实体上限 " + entity.getMaxAffectedRows() + " 行");
        }
        boolean sensitive = prepared.setFields().stream().anyMatch(DataWorkbenchFieldEntity::isSensitive);
        boolean approvalRequired = sensitive || affectedRows != 1 || affectedRows > entity.getMaxAffectedRows();
        String riskLevel = approvalRequired ? (sensitive || affectedRows > entity.getMaxAffectedRows() ? "HIGH" : "MEDIUM") : "LOW";
        return new DataChangePreviewResult(
                dsl,
                mapper.toEntityItem(entity),
                prepared.sqlSummary(),
                affectedRows,
                riskLevel,
                risks,
                approvalRequired
        );
    }

    @Transactional
    public DataChangeRequestEntity execute(DataChangeRequestEntity request) {
        DataWorkbenchEntity entity = request.getEntity();
        DataChangeDsl dsl = mapper.parseDsl(request.getDslJson());
        PreparedChange prepared = prepare(entity, dsl);
        List<Map<String, Object>> beforeRows = selectRows(entity, prepared.whereParams(), true);
        if (beforeRows.isEmpty()) {
            throw new IllegalArgumentException("执行失败：定位条件未命中任何数据");
        }
        if (beforeRows.size() > entity.getMaxAffectedRows()) {
            throw new IllegalArgumentException("执行失败：影响行数超过实体上限");
        }

        MapSqlParameterSource updateParams = new MapSqlParameterSource();
        prepared.setParams().getValues().forEach(updateParams::addValue);
        prepared.whereParams().getValues().forEach(updateParams::addValue);
        int updated = jdbcTemplate.update(prepared.updateSql(), updateParams);
        List<Map<String, Object>> afterRows = selectRowsByIds(entity, primaryKeys(entity, beforeRows), true);
        Map<String, Map<String, Object>> afterById = afterRows.stream()
                .collect(Collectors.toMap(row -> stringValue(row.get(entity.getPrimaryKeyColumn())), row -> row, (left, right) -> left, LinkedHashMap::new));

        for (Map<String, Object> before : beforeRows) {
            String primaryKey = stringValue(before.get(entity.getPrimaryKeyColumn()));
            Map<String, Object> after = afterById.getOrDefault(primaryKey, Map.of());
            DataChangeAuditEntity audit = new DataChangeAuditEntity();
            audit.setRequest(request);
            audit.setProject(request.getProject());
            audit.setEntity(entity);
            audit.setPrimaryKeyValue(primaryKey);
            audit.setBeforeSnapshot(toJson(before));
            audit.setAfterSnapshot(toJson(after));
            audit.setSqlSummary(prepared.sqlSummary());
            auditRepository.save(audit);
        }
        request.setAffectedRows(updated);
        request.setExecutionStatus("EXECUTED");
        request.setExecutedAt(LocalDateTime.now());
        return requestRepository.save(request);
    }

    @Transactional
    public DataChangeRequestEntity rollback(DataChangeRequestEntity request) {
        DataWorkbenchEntity entity = request.getEntity();
        // 二重校验：审计快照上的 project_id 必须与实体当前绑定的平台项目一致，避免实体重新绑定后误回滚旧项目数据。
        Long entityProjectId = entity.getPlatformProject() == null ? null : entity.getPlatformProject().getId();
        List<DataChangeAuditEntity> audits = auditRepository.findAllByRequest_IdOrderByIdAsc(request.getId());
        if (audits.isEmpty()) {
            throw new IllegalArgumentException("没有可回滚的执行审计");
        }
        List<String> conflicts = new ArrayList<>();
        for (DataChangeAuditEntity audit : audits) {
            Long snapshotProjectId = audit.getProject() == null ? null : audit.getProject().getId();
            if (entityProjectId != null && snapshotProjectId != null && !entityProjectId.equals(snapshotProjectId)) {
                audit.setRollbackStatus("CONFLICT");
                audit.setRollbackConflictReason("实体绑定项目与审计快照不一致，拒绝回滚");
                conflicts.add("主键 " + audit.getPrimaryKeyValue() + " 项目归属变化");
                continue;
            }
            Map<String, Object> current = selectRowById(entity, audit.getPrimaryKeyValue());
            Map<String, Object> after = readMap(audit.getAfterSnapshot());
            if (!snapshotsEqual(current, after)) {
                audit.setRollbackStatus("CONFLICT");
                audit.setRollbackConflictReason("当前数据已被其他流程修改，拒绝覆盖");
                conflicts.add("主键 " + audit.getPrimaryKeyValue() + " 已变化");
                continue;
            }
            Map<String, Object> before = readMap(audit.getBeforeSnapshot());
            rollbackRow(entity, audit.getPrimaryKeyValue(), before);
            audit.setRollbackStatus("ROLLED_BACK");
            audit.setRolledBackAt(LocalDateTime.now());
        }
        if (conflicts.isEmpty()) {
            request.setRollbackStatus("ROLLED_BACK");
            request.setRolledBackAt(LocalDateTime.now());
        } else {
            request.setRollbackStatus("CONFLICT");
            request.setRollbackConflictReason(String.join("；", conflicts));
        }
        return requestRepository.save(request);
    }

    private PreparedChange prepare(DataWorkbenchEntity entity, DataChangeDsl dsl) {
        validateIdentifier(entity.getTableName());
        validateIdentifier(entity.getPrimaryKeyColumn());
        if (!"UPDATE".equalsIgnoreCase(dsl.operation())) {
            throw new IllegalArgumentException("DataChange v1 仅支持 UPDATE");
        }
        if (!entity.getEntityCode().equalsIgnoreCase(dsl.entityCode())) {
            throw new IllegalArgumentException("DSL 实体与当前实体配置不一致");
        }
        Map<String, DataWorkbenchFieldEntity> fieldsByCode = entity.getFields().stream()
                .filter(DataWorkbenchFieldEntity::isEnabled)
                .collect(Collectors.toMap(field -> field.getFieldCode().toLowerCase(Locale.ROOT), field -> field, (left, right) -> left));
        LinkedHashMap<String, Object> setParams = new LinkedHashMap<>();
        List<DataWorkbenchFieldEntity> setFields = new ArrayList<>();
        for (Map.Entry<String, Object> entry : dsl.set().entrySet()) {
            DataWorkbenchFieldEntity field = fieldsByCode.get(entry.getKey().toLowerCase(Locale.ROOT));
            if (field == null || !field.isUpdatable()) {
                throw new IllegalArgumentException("字段不允许修改: " + entry.getKey());
            }
            validateIdentifier(field.getColumnName());
            if (field.getColumnName().equalsIgnoreCase(entity.getPrimaryKeyColumn())) {
                throw new IllegalArgumentException("禁止修改主键列");
            }
            setFields.add(field);
            setParams.put(field.getColumnName(), convertValue(field, entry.getValue()));
        }
        if (setParams.isEmpty()) {
            throw new IllegalArgumentException("缺少要修改的字段");
        }

        MapSqlParameterSource whereParams = new MapSqlParameterSource();
        LinkedHashMap<String, Object> locatorParams = new LinkedHashMap<>();
        List<String> riskReasons = new ArrayList<>();
        for (Map.Entry<String, Object> entry : dsl.where().entrySet()) {
            DataWorkbenchFieldEntity field = fieldsByCode.get(entry.getKey().toLowerCase(Locale.ROOT));
            if (field == null || !field.isLocator()) {
                throw new IllegalArgumentException("字段不允许作为定位条件: " + entry.getKey());
            }
            validateIdentifier(field.getColumnName());
            locatorParams.put(field.getColumnName(), convertValue(field, entry.getValue()));
        }
        if (locatorParams.isEmpty()) {
            throw new IllegalArgumentException("缺少配置允许的定位字段条件");
        }
        locatorParams.forEach((column, value) -> whereParams.addValue("w_" + column, value));
        List<String> setFragments = setParams.keySet().stream()
                .map(column -> column + " = :s_" + column)
                .toList();
        MapSqlParameterSource setSqlParams = new MapSqlParameterSource();
        setParams.forEach((column, value) -> setSqlParams.addValue("s_" + column, value));
        List<String> whereFragments = new ArrayList<>();
        locatorParams.keySet().forEach(column -> whereFragments.add(column + " = :w_" + column));
        String updateSql = "UPDATE " + entity.getTableName() + " SET " + String.join(", ", setFragments)
                + " WHERE " + String.join(" AND ", whereFragments);
        String sqlSummary = updateSql.replaceAll(":[A-Za-z0-9_]+", "?");
        return new PreparedChange(updateSql, sqlSummary, setSqlParams, whereParams, setFields, riskReasons);
    }

    private List<Map<String, Object>> selectRows(DataWorkbenchEntity entity, MapSqlParameterSource whereParams, boolean forUpdate) {
        List<String> whereFragments = new ArrayList<>();
        whereParams.getValues().keySet().stream()
                .filter(key -> key.startsWith("w_"))
                .forEach(key -> whereFragments.add(key.substring(2) + " = :" + key));
        if (whereFragments.isEmpty()) {
            throw new IllegalArgumentException("缺少配置允许的定位字段条件");
        }
        String sql = "SELECT * FROM " + entity.getTableName() + " WHERE " + String.join(" AND ", whereFragments)
                + " ORDER BY " + entity.getPrimaryKeyColumn()
                + (forUpdate ? " FOR UPDATE" : "");
        return jdbcTemplate.queryForList(sql, whereParams);
    }

    private List<Map<String, Object>> selectRowsByIds(DataWorkbenchEntity entity, List<String> ids, boolean forUpdate) {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("ids", ids);
        String sql = "SELECT * FROM " + entity.getTableName()
                + " WHERE CAST(" + entity.getPrimaryKeyColumn() + " AS VARCHAR) IN (:ids)"
                + " ORDER BY " + entity.getPrimaryKeyColumn()
                + (forUpdate ? " FOR UPDATE" : "");
        return jdbcTemplate.queryForList(sql, params);
    }

    private Map<String, Object> selectRowById(DataWorkbenchEntity entity, String id) {
        List<Map<String, Object>> rows = selectRowsByIds(entity, List.of(id), true);
        return rows.isEmpty() ? Map.of() : rows.get(0);
    }

    private void rollbackRow(DataWorkbenchEntity entity, String primaryKeyValue, Map<String, Object> before) {
        LinkedHashMap<String, Object> setValues = new LinkedHashMap<>(before);
        setValues.remove(entity.getPrimaryKeyColumn());
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("primaryKeyValue", primaryKeyValue);
        List<String> setFragments = new ArrayList<>();
        setValues.forEach((column, value) -> {
            validateIdentifier(column);
            setFragments.add(column + " = :c_" + column);
            params.addValue("c_" + column, value);
        });
        String sql = "UPDATE " + entity.getTableName()
                + " SET " + String.join(", ", setFragments)
                + " WHERE CAST(" + entity.getPrimaryKeyColumn() + " AS VARCHAR) = :primaryKeyValue";
        jdbcTemplate.update(sql, params);
    }

    private Object convertValue(DataWorkbenchFieldEntity field, Object value) {
        if (value == null) {
            return null;
        }
        String type = field.getDataType() == null ? "STRING" : field.getDataType().toUpperCase(Locale.ROOT);
        String raw = String.valueOf(value).trim();
        return switch (type) {
            case "BOOLEAN", "BOOL" -> Boolean.TRUE.equals(value) || "true".equalsIgnoreCase(raw) || "是".equals(raw) || "1".equals(raw);
            case "INTEGER", "INT" -> Integer.parseInt(raw);
            case "LONG", "BIGINT" -> Long.parseLong(raw);
            default -> raw;
        };
    }

    private List<String> primaryKeys(DataWorkbenchEntity entity, List<Map<String, Object>> rows) {
        return rows.stream()
                .map(row -> stringValue(row.get(entity.getPrimaryKeyColumn())))
                .toList();
    }

    private boolean snapshotsEqual(Map<String, Object> current, Map<String, Object> expected) {
        if (current.size() != expected.size()) {
            return false;
        }
        for (Map.Entry<String, Object> entry : expected.entrySet()) {
            if (!Objects.equals(stringValue(current.get(entry.getKey())), stringValue(entry.getValue()))) {
                return false;
            }
        }
        return true;
    }

    private void validateIdentifier(String identifier) {
        if (identifier == null || !SQL_IDENTIFIER.matcher(identifier).matches()) {
            throw new IllegalArgumentException("非法 SQL 标识符: " + identifier);
        }
    }

    private Map<String, Object> readMap(String json) {
        try {
            return objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {
            });
        } catch (Exception exception) {
            throw new IllegalStateException("读取 DataChange 快照失败", exception);
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("写入 DataChange 快照失败", exception);
        }
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private record PreparedChange(
            String updateSql,
            String sqlSummary,
            MapSqlParameterSource setParams,
            MapSqlParameterSource whereParams,
            List<DataWorkbenchFieldEntity> setFields,
            List<String> riskReasons
    ) {
    }
}
