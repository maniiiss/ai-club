package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import com.aiclub.platform.domain.model.DataWorkbenchFieldEntity;
import com.aiclub.platform.repository.DataWorkbenchEntityRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * DataChange DSL 解析服务单元测试。
 * 业务意图：验证首期规则解析可以把常见中文变更诉求归一化为受控 DSL。
 */
class DataChangeDslServiceTests {

    /**
     * 验证中文自然语言能解析出修改字段与定位字段（v2 起 DSL 不再注入 projectId）。
     */
    @Test
    void shouldResolveChineseTextToUpdateDsl() {
        DataWorkbenchEntityRepository repository = mock(DataWorkbenchEntityRepository.class);
        DataWorkbenchEntity entity = buildEntity();
        when(repository.findWithFieldsByPlatformProjectIdAndEntityCode(9L, "project")).thenReturn(Optional.of(entity));
        DataChangeDslService service = new DataChangeDslService(repository);

        var dsl = service.resolveDsl(
                9L,
                "第五师医共体强基工程建设项目（施工）需要修改【是否资审】为「是」 项目编码为XMBM202606180004",
                "project",
                null
        );

        assertThat(dsl.operation()).isEqualTo("UPDATE");
        assertThat(dsl.entityCode()).isEqualTo("project");
        assertThat(dsl.set()).containsEntry("qualificationRequired", true);
        assertThat(dsl.where()).containsEntry("projectCode", "XMBM202606180004");
        // 平台项目隔离改由实体绑定和服务层校验负责，DSL 内不再注入 projectId。
        assertThat(dsl.where()).doesNotContainKey("projectId");
    }

    private DataWorkbenchEntity buildEntity() {
        DataWorkbenchEntity entity = new DataWorkbenchEntity();
        entity.setEntityCode("project");
        entity.setEntityName("项目");
        entity.setFields(List.of(
                field("qualificationRequired", "是否资审", "qualification_required", "资审", true, false),
                field("projectCode", "项目编码", "project_code", "项目编号", false, true)
        ));
        return entity;
    }

    private DataWorkbenchFieldEntity field(String code,
                                           String name,
                                           String column,
                                           String synonyms,
                                           boolean updatable,
                                           boolean locator) {
        DataWorkbenchFieldEntity field = new DataWorkbenchFieldEntity();
        field.setFieldCode(code);
        field.setFieldName(name);
        field.setColumnName(column);
        field.setSynonyms(synonyms);
        field.setDataType("STRING");
        field.setUpdatable(updatable);
        field.setLocator(locator);
        field.setEnabled(true);
        field.setSortOrder(0);
        return field;
    }
}
