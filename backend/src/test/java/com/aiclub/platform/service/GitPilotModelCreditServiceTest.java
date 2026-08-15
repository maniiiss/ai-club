package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 锁定 GitPilot CLI 模型调用单次 token 计费：模型开启计费才扣费、未开启返回 0、
 * AGENT_TOKEN 停用熔断、余额不足抛异常。
 */
@ExtendWith(MockitoExtension.class)
class GitPilotModelCreditServiceTest {

    @Mock
    private ModelPricingService modelPricingService;

    @Mock
    private CreditService creditService;

    private GitPilotModelCreditService buildService() {
        return new GitPilotModelCreditService(modelPricingService, creditService);
    }

    private CreditFeatureConfigEntity feature() {
        CreditFeatureConfigEntity feature = new CreditFeatureConfigEntity();
        feature.setFeatureCode(AgentCreditService.FEATURE_AGENT_TOKEN);
        return feature;
    }

    @Test
    void shouldChargeActualCostWhenModelBillingEnabled() {
        Long userId = 1L;
        Long modelConfigId = 10L;
        AiModelConfigEntity model = new AiModelConfigEntity();
        CreditFeatureConfigEntity feature = feature();

        when(modelPricingService.isTokenBillingEnabled(modelConfigId)).thenReturn(true);
        when(creditService.requireEnabledFeatureConfig(AgentCreditService.FEATURE_AGENT_TOKEN)).thenReturn(feature);
        when(modelPricingService.requireTokenBillingModel(modelConfigId)).thenReturn(model);
        when(modelPricingService.calculateCost(model, 120, 45, 30)).thenReturn(8);

        int cost = buildService().chargeForModelCall(userId, modelConfigId, "sess-1", 120, 45, 30);

        assertThat(cost).isEqualTo(8);
        verify(creditService).consume(eq(userId), eq(feature), eq(8), anyString(), eq("GitPilot CLI 模型调用"));
    }

    @Test
    void shouldReturnZeroWhenModelBillingDisabled() {
        when(modelPricingService.isTokenBillingEnabled(10L)).thenReturn(false);

        int cost = buildService().chargeForModelCall(1L, 10L, "sess-1", 100, 50, 0);

        assertThat(cost).isZero();
        verifyNoInteractions(creditService);
    }

    @Test
    void shouldReturnZeroWhenCostIsZero() {
        AiModelConfigEntity model = new AiModelConfigEntity();
        CreditFeatureConfigEntity feature = feature();

        when(modelPricingService.isTokenBillingEnabled(10L)).thenReturn(true);
        when(creditService.requireEnabledFeatureConfig(AgentCreditService.FEATURE_AGENT_TOKEN)).thenReturn(feature);
        when(modelPricingService.requireTokenBillingModel(10L)).thenReturn(model);
        when(modelPricingService.calculateCost(model, 0, 0, 0)).thenReturn(0);

        int cost = buildService().chargeForModelCall(1L, 10L, "sess-1", 0, 0, 0);

        assertThat(cost).isZero();
        verify(creditService, never()).consume(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt(), anyString(), anyString());
    }

    @Test
    void shouldPropagateInsufficientBalanceError() {
        AiModelConfigEntity model = new AiModelConfigEntity();
        CreditFeatureConfigEntity feature = feature();

        when(modelPricingService.isTokenBillingEnabled(10L)).thenReturn(true);
        when(creditService.requireEnabledFeatureConfig(AgentCreditService.FEATURE_AGENT_TOKEN)).thenReturn(feature);
        when(modelPricingService.requireTokenBillingModel(10L)).thenReturn(model);
        when(modelPricingService.calculateCost(model, 100, 50, 0)).thenReturn(5);
        when(creditService.consume(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyInt(), anyString(), anyString()))
                .thenThrow(new IllegalArgumentException("积分余额不足，请联系管理员充值"));

        assertThatThrownBy(() -> buildService().chargeForModelCall(1L, 10L, "sess-1", 100, 50, 0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("积分余额不足");
    }

    @Test
    void shouldPropagateWhenFeatureDisabled() {
        when(modelPricingService.isTokenBillingEnabled(10L)).thenReturn(true);
        when(creditService.requireEnabledFeatureConfig(AgentCreditService.FEATURE_AGENT_TOKEN))
                .thenThrow(new IllegalArgumentException("积分功能配置已停用: AGENT_TOKEN"));

        assertThatThrownBy(() -> buildService().chargeForModelCall(1L, 10L, "sess-1", 100, 50, 0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("已停用");
    }
}