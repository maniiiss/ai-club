package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import com.aiclub.platform.domain.model.DataWorkbenchFieldEntity;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeDsl;
import com.aiclub.platform.repository.DataChangeAuditRepository;
import com.aiclub.platform.repository.DataChangeRequestRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * DataChange SQL 执行器单元测试。
 * 业务意图：覆盖字段白名单、定位条件、影响范围和审批风险这些生产数据修改前的核心防线。
 */
class DataChangeSqlExecutorTests {

    private NamedParameterJdbcTemplate jdbcTemplate;
    private DataChangeSqlExecutor executor;
    private DataWorkbenchEntity entity;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(NamedParameterJdbcTemplate.class);
        DataWorkbenchMapper mapper = new DataWorkbenchMapper(new ObjectMapper());
        executor = new DataChangeSqlExecutor(
                jdbcTemplate,
                mock(DataChangeAuditRepository.class),
                mock(DataChangeRequestRepository.class),
                mapper,
                new ObjectMapper()
        );
        entity = buildEntity(false);
    }

    /**
     * 验证未配置为可修改的字段会被直接拦截。
     */
    @Test
    void shouldRejectFieldOutsideUpdateWhitelist() {
        DataChangeDsl dsl = dsl(Map.of("projectCode", "XMBM001"), Map.of("projectCode", "HACK"));

        assertThatThrownBy(() -> executor.preview(entity, dsl))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("字段不允许修改");
    }

    /**
     * 验证缺少定位字段时不会生成范围过大的 UPDATE。
     */
    @Test
    void shouldRejectMissingLocatorCondition() {
        DataChangeDsl dsl = dsl(Map.of(), Map.of("qualificationRequired", true));

        assertThatThrownBy(() -> executor.preview(entity, dsl))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("缺少配置允许的定位字段条件");
    }

    /**
     * 验证超过实体阈值的预览会标记为高风险并要求审批。
     */
    @Test
    void shouldMarkHighRiskWhenAffectedRowsExceedLimit() {
        when(jdbcTemplate.queryForList(anyString(), any(MapSqlParameterSource.class)))
                .thenReturn(List.of(row(1L), row(2L)));

        var preview = executor.preview(entity, dsl(Map.of("projectCode", "XMBM001"), Map.of("qualificationRequired", true)));

        assertThat(preview.affectedRows()).isEqualTo(2);
        assertThat(preview.riskLevel()).isEqualTo("HIGH");
        assertThat(preview.approvalRequired()).isTrue();
        assertThat(preview.riskReasons()).anyMatch(reason -> reason.contains("超过实体上限"));
    }

    /**
     * 验证敏感字段即使只影响单行也会要求审批。
     */
    @Test
    void shouldRequireApprovalForSensitiveField() {
        entity = buildEntity(true);
        when(jdbcTemplate.queryForList(anyString(), any(MapSqlParameterSource.class)))
                .thenReturn(List.of(row(1L)));

        var preview = executor.preview(entity, dsl(Map.of("projectCode", "XMBM001"), Map.of("qualificationRequired", true)));

        assertThat(preview.affectedRows()).isEqualTo(1);
        assertThat(preview.riskLevel()).isEqualTo("HIGH");
        assertThat(preview.approvalRequired()).isTrue();
    }

    private DataWorkbenchEntity buildEntity(boolean sensitive) {
        DataWorkbenchEntity target = new DataWorkbenchEntity();
        target.setId(10L);
        target.setEntityCode("project");
        target.setEntityName("项目");
        target.setTableName("project_info");
        target.setPrimaryKeyColumn("id");
        // v2 起实体在配置层绑定平台项目，SQL 执行不再需要 projectIdColumn。
        target.setMaxAffectedRows(1);

        DataWorkbenchFieldEntity projectCode = field("projectCode", "项目编码", "project_code", false, true, false, 1);
        DataWorkbenchFieldEntity qualificationRequired = field("qualificationRequired", "是否资审", "qualification_required", true, false, sensitive, 2);
        projectCode.setEntity(target);
        qualificationRequired.setEntity(target);
        target.setFields(List.of(projectCode, qualificationRequired));
        return target;
    }

    private DataWorkbenchFieldEntity field(String code,
                                           String name,
                                           String column,
                                           boolean updatable,
                                           boolean locator,
                                           boolean sensitive,
                                           int sortOrder) {
        DataWorkbenchFieldEntity field = new DataWorkbenchFieldEntity();
        field.setFieldCode(code);
        field.setFieldName(name);
        field.setColumnName(column);
        field.setDataType("STRING");
        field.setSynonyms("");
        field.setUpdatable(updatable);
        field.setLocator(locator);
        field.setSensitive(sensitive);
        field.setEnabled(true);
        field.setSortOrder(sortOrder);
        return field;
    }

    private DataChangeDsl dsl(Map<String, Object> where, Map<String, Object> set) {
        return new DataChangeDsl("1", "UPDATE", "project", new LinkedHashMap<>(set), new LinkedHashMap<>(where));
    }

    private Map<String, Object> row(Long id) {
        return Map.of(
                "id", id,
                "project_id", 1L,
                "project_code", "XMBM001",
                "qualification_required", false
        );
    }
}
