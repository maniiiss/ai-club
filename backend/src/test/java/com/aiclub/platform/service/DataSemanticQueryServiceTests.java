package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataWorkbenchDataSourceEntity;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证语义查询的数据源版本和启用状态边界，避免配置变化后继续使用旧查询快照。 */
class DataSemanticQueryServiceTests {

    @Test
    void shouldOnlyInvalidateSourceSnapshotWhenConnectionSettingsChange() {
        assertThat(DataSemanticQueryService.sourceSettingsChanged(
                "jdbc:postgresql://db.example/app", "jdbc:postgresql://db.example/app",
                "reader", "reader", "secret", "secret", "public", "public"
        )).isFalse();

        assertThat(DataSemanticQueryService.sourceSettingsChanged(
                "jdbc:postgresql://db.example/app", "jdbc:postgresql://db.example/app",
                "reader", "reader", "secret", "rotated-secret", "public", "public"
        )).isTrue();
    }

    @Test
    void shouldRejectDisabledDataSourceForSemanticQuery() {
        DataWorkbenchDataSourceEntity source = new DataWorkbenchDataSourceEntity();
        source.setEnabled(false);

        assertThatThrownBy(() -> DataSemanticQueryService.requireEnabledSource(source))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("数据源已停用，无法执行语义查询");
    }
}
