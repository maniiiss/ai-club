package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.RepositoryScanRulesetEntity;
import com.aiclub.platform.dto.RepositoryScanRulesetSummary;
import com.aiclub.platform.dto.request.RepositoryScanRulesetRequest;
import com.aiclub.platform.dto.request.RepositoryScanRulesetValidationRequest;
import com.aiclub.platform.repository.RepositoryScanRulesetRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证仓库扫描规则集服务的关键约束逻辑。
 */
@ExtendWith(MockitoExtension.class)
class RepositoryScanRulesetServiceTests {

    @Mock
    private RepositoryScanRulesetRepository repositoryScanRulesetRepository;

    @InjectMocks
    private RepositoryScanRulesetService repositoryScanRulesetService;

    /**
     * 创建默认规则集后，应自动清除其他默认项，保证系统默认唯一。
     */
    @Test
    void shouldClearOtherDefaultsAfterCreatingDefaultRuleset() {
        when(repositoryScanRulesetRepository.findByCodeIgnoreCase("team-custom")).thenReturn(Optional.empty());
        when(repositoryScanRulesetRepository.save(any(RepositoryScanRulesetEntity.class))).thenAnswer(invocation -> {
            RepositoryScanRulesetEntity entity = invocation.getArgument(0);
            entity.setId(9L);
            return entity;
        });

        repositoryScanRulesetService.createRuleset(new RepositoryScanRulesetRequest(
                "team-custom",
                "团队扩展规则",
                "说明",
                "SEMGREP",
                true,
                true,
                "rules:\n  - id: team.custom\n"
        ));

        verify(repositoryScanRulesetRepository).clearDefaultSelectedExcept(9L);
    }

    /**
     * 当前唯一默认规则集不允许直接禁用，避免系统失去默认值。
     */
    @Test
    void shouldRejectDisablingOnlyDefaultRuleset() {
        RepositoryScanRulesetEntity current = buildEntity();
        when(repositoryScanRulesetRepository.findById(1L)).thenReturn(Optional.of(current));
        when(repositoryScanRulesetRepository.countByDefaultSelectedTrue()).thenReturn(1L);

        assertThatThrownBy(() -> repositoryScanRulesetService.updateRuleset(1L, new RepositoryScanRulesetRequest(
                "team-default",
                "团队默认规则集",
                "说明",
                "SEMGREP",
                false,
                true,
                "rules:\n  - id: team.default\n"
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("不能禁用当前唯一默认规则集，请先设置其他默认规则集");
    }

    /**
     * 启用规则集摘要应包含默认标记和引擎类型，供前端扫描弹窗直接使用。
     */
    @Test
    void shouldExposeEnabledRulesetSummaryWithDefaultFlag() {
        when(repositoryScanRulesetRepository.findAllByEnabledTrueOrderByDefaultSelectedDescIdAsc()).thenReturn(List.of(buildEntity()));

        List<RepositoryScanRulesetSummary> rulesets = repositoryScanRulesetService.listEnabledRulesets();

        assertThat(rulesets).hasSize(1);
        assertThat(rulesets.get(0).code()).isEqualTo("team-default");
        assertThat(rulesets.get(0).engineType()).isEqualTo("SEMGREP");
        assertThat(rulesets.get(0).defaultSelected()).isTrue();
    }

    /**
     * 规则内容存在 YAML 语法错误时，应返回明确的解析失败提示。
     */
    @Test
    void shouldRejectInvalidYamlSyntaxWhenValidatingRuleset() {
        assertThatThrownBy(() -> repositoryScanRulesetService.validateRuleset(new RepositoryScanRulesetValidationRequest(
                "SEMGREP",
                "rules:\n  - id: team.default\n    message: test\n    languages: [java\n"
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("YAML 解析失败");
    }

    private RepositoryScanRulesetEntity buildEntity() {
        RepositoryScanRulesetEntity entity = new RepositoryScanRulesetEntity();
        entity.setId(1L);
        entity.setCode("team-default");
        entity.setName("团队默认规则集");
        entity.setDescription("说明");
        entity.setEngineType("SEMGREP");
        entity.setEnabled(true);
        entity.setDefaultSelected(true);
        entity.setDefinitionContent("rules:\n  - id: team.default\n");
        return entity;
    }
}
