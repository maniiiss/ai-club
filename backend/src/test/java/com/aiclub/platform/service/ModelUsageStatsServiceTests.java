package com.aiclub.platform.service;

import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelBreakdown;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelUsageQueryRequest;
import com.aiclub.platform.dto.ModelUsageStatsDtos.UserBreakdown;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 校验模型统计的模型维度与用户 Token 维度各自聚合，避免用户字段再次混入模型明细。
 */
@ExtendWith(MockitoExtension.class)
class ModelUsageStatsServiceTests {

    @Mock
    private EntityManager entityManager;

    @Mock
    private Query query;

    private ModelUsageStatsService service;

    @BeforeEach
    void setUp() throws Exception {
        service = new ModelUsageStatsService();
        Field field = ModelUsageStatsService.class.getDeclaredField("entityManager");
        field.setAccessible(true);
        field.set(service, entityManager);
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);
    }

    @Test
    void shouldMapModelBreakdownWithoutUserAggregationFields() {
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{
                "gpt-4o", "对话主模型", "OPENAI", 7L, 10L, 9L, 1L,
                100L, 20L, 120L, 30.5d, 50L, 10L, 0.1d
        }));

        List<ModelBreakdown> result = service.getByModel(request(null));

        assertThat(result).hasSize(1);
        ModelBreakdown row = result.get(0);
        assertThat(row.modelName()).isEqualTo("gpt-4o");
        assertThat(row.modelConfigName()).isEqualTo("对话主模型");
        assertThat(row.total()).isEqualTo(10L);
        assertThat(row.inputTokens()).isEqualTo(100L);
        assertThat(row.outputTokens()).isEqualTo(20L);
        assertThat(row.cachedTokens()).isEqualTo(10L);
        assertThat(row.cacheHitRate()).isEqualTo(0.1d);

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(entityManager).createNativeQuery(sqlCaptor.capture());
        assertThat(sqlCaptor.getValue()).contains("LEFT JOIN ai_model_config mc");
        assertThat(sqlCaptor.getValue()).contains("MAX(NULLIF(mc.name, '')) AS model_config_name");
        assertThat(sqlCaptor.getValue()).contains("agent_invocation_log.model_name");
    }

    @Test
    void shouldLeaveConfigurationNameNullForUnboundSystemModel() {
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{
                "system-model", null, "ASSISTANT", null, 1L, 1L, 0L,
                0L, 0L, 0L, 0d, 0L, 0L, null
        }));

        ModelBreakdown row = service.getByModel(request(null)).get(0);

        assertThat(row.modelName()).isEqualTo("system-model");
        assertThat(row.modelConfigName()).isNull();
        assertThat(row.modelConfigId()).isNull();
    }

    @Test
    void shouldAggregateUserTokenUsageByTotalTokensAndLimitToTopTwenty() {
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{
                101L, "alice", "Alice", 4L, 100L, 40L, 140L, 20L, 0.2d,
                LocalDateTime.of(2026, 8, 19, 10, 20, 30)
        }));

        List<UserBreakdown> result = service.getByUser(request(null));

        assertThat(result).hasSize(1);
        UserBreakdown row = result.get(0);
        assertThat(row.userId()).isEqualTo(101L);
        assertThat(row.username()).isEqualTo("alice");
        assertThat(row.nickname()).isEqualTo("Alice");
        assertThat(row.total()).isEqualTo(4L);
        assertThat(row.inputTokens()).isEqualTo(100L);
        assertThat(row.outputTokens()).isEqualTo(40L);
        assertThat(row.totalTokens()).isEqualTo(140L);
        assertThat(row.cachedTokens()).isEqualTo(20L);
        assertThat(row.cacheHitRate()).isEqualTo(0.2d);
        assertThat(row.lastInvokedAt()).isEqualTo("2026-08-19 10:20:30");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(entityManager).createNativeQuery(sqlCaptor.capture());
        assertThat(sqlCaptor.getValue()).contains("GROUP BY user_id");
        assertThat(sqlCaptor.getValue()).contains("ORDER BY total_tokens DESC, total DESC");
        assertThat(sqlCaptor.getValue()).contains("LIMIT 20");
        assertThat(sqlCaptor.getValue()).doesNotContain("unique_users", "unique_user_names");
    }

    @Test
    void shouldPreserveAnonymousUserAndNullTokenRate() {
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{
                null, null, null, 2L, 0L, 0L, 0L, 0L, null, null
        }));

        UserBreakdown row = service.getByUser(request(99)).get(0);

        assertThat(row.userId()).isNull();
        assertThat(row.username()).isNull();
        assertThat(row.nickname()).isNull();
        assertThat(row.totalTokens()).isZero();
        assertThat(row.cacheHitRate()).isNull();
        assertThat(row.lastInvokedAt()).isNull();
    }

    private static ModelUsageQueryRequest request(Integer limit) {
        return new ModelUsageQueryRequest(
                "2026-08-19 00:00:00",
                "2026-08-19 23:59:59",
                null,
                null,
                null,
                "day",
                limit);
    }
}
