package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证库内快照检索的参数上限与记忆事实图 Table 模式保持一致，
 * 避免 Hindsight HTTP 不可用时被历史 30 条上限错误截断。
 */
@ExtendWith(MockitoExtension.class)
class HindsightMemoryFallbackServiceTests {

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    private HindsightMemoryFallbackService service;

    @BeforeEach
    void setUp() {
        service = new HindsightMemoryFallbackService(
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
                jdbcTemplate,
                new ObjectMapper()
        );
    }

    @Test
    void shouldAllowTableSnapshotFallbackToRequestTwoHundredFacts() {
        when(jdbcTemplate.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenReturn(List.of());

        service.searchFacts(List.of("git-ai-club:wiki:project:12"), "", "project:12", 200);

        ArgumentCaptor<MapSqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbcTemplate).query(anyString(), paramsCaptor.capture(), any(RowMapper.class));
        assertThat(paramsCaptor.getValue().getValue("limit")).isEqualTo(200);
        assertThat(paramsCaptor.getValue().getValue("requiredTag")).isEqualTo("project:12");
    }
}
