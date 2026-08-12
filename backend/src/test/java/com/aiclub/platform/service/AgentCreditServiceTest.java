package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import com.aiclub.platform.domain.model.ExecutionCreditSettlementEntity;
import com.aiclub.platform.domain.model.UserCreditTransactionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.AgentTokenUsage;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.ExecutionCreditSettlementRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 AgentCreditService 终态结算的退差 / 补扣 / 触顶 / 幂等分支，以及预扣失败退款。
 */
class AgentCreditServiceTest {

    private final CreditService creditService = mock(CreditService.class);
    private final ModelPricingService modelPricingService = mock(ModelPricingService.class);
    private final ExecutionCreditSettlementRepository settlementRepository = mock(ExecutionCreditSettlementRepository.class);
    private final ExecutionTaskRepository executionTaskRepository = mock(ExecutionTaskRepository.class);
    private final AiModelConfigRepository aiModelConfigRepository = mock(AiModelConfigRepository.class);
    /** 补扣上限倍数 2.0。 */
    private final AgentCreditService agentCreditService = new AgentCreditService(
            creditService, modelPricingService, settlementRepository,
            executionTaskRepository, aiModelConfigRepository, 2.0);

    private AiModelConfigEntity pricingModel(Long id) {
        AiModelConfigEntity model = new AiModelConfigEntity();
        model.setId(id);
        model.setTokenBillingEnabled(Boolean.TRUE);
        model.setInputCreditPer1k(new BigDecimal("2"));
        model.setOutputCreditPer1k(new BigDecimal("6"));
        model.setCachedInputCreditPer1k(new BigDecimal("1"));
        return model;
    }

    private ExecutionCreditSettlementEntity newSettlement(String status, String chargeMode, int prepaid, Long userId) {
        ExecutionCreditSettlementEntity settlement = mock(ExecutionCreditSettlementEntity.class);
        UserCreditTransactionEntity tx = mock(UserCreditTransactionEntity.class);
        UserEntity user = mock(UserEntity.class);
        when(settlement.getStatus()).thenReturn(status);
        when(settlement.getChargeMode()).thenReturn(chargeMode);
        when(settlement.getPrepaidCredits()).thenReturn(prepaid);
        when(settlement.getConsumeTransaction()).thenReturn(tx);
        when(tx.getUser()).thenReturn(user);
        when(user.getId()).thenReturn(userId);
        return settlement;
    }

    @Test
    void settleAgentExecution_实际小于预扣_退差() {
        Long taskId = 1L;
        Long userId = 10L;
        Long modelId = 100L;
        ExecutionCreditSettlementEntity settlement = newSettlement("CHARGED", "TOKEN_BASED", 20, userId);
        when(settlementRepository.findByExecutionTaskIdForUpdate(taskId)).thenReturn(Optional.of(settlement));
        AiModelConfigEntity model = pricingModel(modelId);
        when(aiModelConfigRepository.findById(modelId)).thenReturn(Optional.of(model));
        when(modelPricingService.aggregateTaskTokenUsage(taskId))
                .thenReturn(List.of(new AgentTokenUsage(modelId, 1000L, 0L, 0L)));
        when(modelPricingService.calculateCost(eq(model), anyInt(), anyInt(), anyInt())).thenReturn(5);

        agentCreditService.settleAgentExecution(taskId);

        verify(creditService).refundConsumption(settlement.getConsumeTransaction(), 15, "智能体执行结算退差");
        verify(settlement).setStatus("SETTLED");
        verify(settlement).setActualCredits(5);
        verify(modelPricingService).applyCostToLogs(taskId);
    }

    @Test
    void settleAgentExecution_实际大于预扣未触顶_补扣() {
        Long taskId = 2L;
        Long userId = 10L;
        Long modelId = 100L;
        ExecutionCreditSettlementEntity settlement = newSettlement("CHARGED", "TOKEN_BASED", 20, userId);
        when(settlementRepository.findByExecutionTaskIdForUpdate(taskId)).thenReturn(Optional.of(settlement));
        AiModelConfigEntity model = pricingModel(modelId);
        when(aiModelConfigRepository.findById(modelId)).thenReturn(Optional.of(model));
        when(modelPricingService.aggregateTaskTokenUsage(taskId))
                .thenReturn(List.of(new AgentTokenUsage(modelId, 0L, 5000L, 0L)));
        when(modelPricingService.calculateCost(eq(model), anyInt(), anyInt(), anyInt())).thenReturn(30);
        CreditFeatureConfigEntity feature = new CreditFeatureConfigEntity();
        when(creditService.getFeatureConfig("AGENT_TOKEN")).thenReturn(feature);

        agentCreditService.settleAgentExecution(taskId);

        // 补扣 30-20=10，未超 cap(20*(2-1)=20)
        verify(creditService).consume(eq(userId), eq(feature), eq(10), anyString(), anyString());
        verify(settlement).setStatus("SETTLED");
        verify(settlement).setActualCredits(30);
    }

    @Test
    void settleAgentExecution_实际超预扣倍数_触顶补扣() {
        Long taskId = 3L;
        Long userId = 10L;
        Long modelId = 100L;
        ExecutionCreditSettlementEntity settlement = newSettlement("CHARGED", "TOKEN_BASED", 20, userId);
        when(settlementRepository.findByExecutionTaskIdForUpdate(taskId)).thenReturn(Optional.of(settlement));
        AiModelConfigEntity model = pricingModel(modelId);
        when(aiModelConfigRepository.findById(modelId)).thenReturn(Optional.of(model));
        when(modelPricingService.aggregateTaskTokenUsage(taskId))
                .thenReturn(List.of(new AgentTokenUsage(modelId, 0L, 5000L, 0L)));
        when(modelPricingService.calculateCost(eq(model), anyInt(), anyInt(), anyInt())).thenReturn(100);
        CreditFeatureConfigEntity feature = new CreditFeatureConfigEntity();
        when(creditService.getFeatureConfig("AGENT_TOKEN")).thenReturn(feature);

        agentCreditService.settleAgentExecution(taskId);

        // 应补 80，但 cap=20*(2-1)=20，截断为 20，标记 SETTLED_CAPPED
        verify(creditService).consume(eq(userId), eq(feature), eq(20), anyString(), anyString());
        verify(settlement).setStatus("SETTLED_CAPPED");
        verify(settlement).setActualCredits(100);
    }

    @Test
    void settleAgentExecution_已结算状态_幂等跳过() {
        Long taskId = 4L;
        ExecutionCreditSettlementEntity settlement = newSettlement("SETTLED", "TOKEN_BASED", 20, 10L);
        when(settlementRepository.findByExecutionTaskIdForUpdate(taskId)).thenReturn(Optional.of(settlement));

        agentCreditService.settleAgentExecution(taskId);

        verify(modelPricingService, never()).aggregateTaskTokenUsage(any());
        verify(creditService, never()).refundConsumption(any(), anyInt(), anyString());
        verify(creditService, never()).consume(any(), any(), anyInt(), anyString(), anyString());
    }

    @Test
    void settleAgentExecution_无结算记录_跳过() {
        Long taskId = 5L;
        when(settlementRepository.findByExecutionTaskIdForUpdate(taskId)).thenReturn(Optional.empty());

        agentCreditService.settleAgentExecution(taskId);

        verify(modelPricingService, never()).aggregateTaskTokenUsage(any());
    }

    @Test
    void settleAgentExecution_FIXED模式_交给技术设计结算不处理() {
        Long taskId = 6L;
        ExecutionCreditSettlementEntity settlement = newSettlement("CHARGED", "FIXED", 20, 10L);
        when(settlementRepository.findByExecutionTaskIdForUpdate(taskId)).thenReturn(Optional.of(settlement));

        agentCreditService.settleAgentExecution(taskId);

        verify(modelPricingService, never()).aggregateTaskTokenUsage(any());
        verify(creditService, never()).refundConsumption(any(), anyInt(), anyString());
    }

    @Test
    void chargeAndCreate_任务创建失败_自动退回预扣积分() {
        Long userId = 10L;
        Long modelId = 100L;
        com.aiclub.platform.domain.model.AgentEntity agent = mock(com.aiclub.platform.domain.model.AgentEntity.class);
        AiModelConfigEntity model = pricingModel(modelId);
        when(agent.getAiModelConfig()).thenReturn(model);
        when(agent.getBudgetTokens()).thenReturn(4000);
        when(modelPricingService.requireTokenBillingModel(modelId)).thenReturn(model);
        when(modelPricingService.estimatePreCharge(model, 4000)).thenReturn(20);
        CreditFeatureConfigEntity feature = new CreditFeatureConfigEntity();
        when(creditService.requireEnabledFeatureConfig("AGENT_TOKEN")).thenReturn(feature);
        UserCreditTransactionEntity tx = mock(UserCreditTransactionEntity.class);
        when(creditService.consume(eq(userId), eq(feature), eq(20), anyString(), anyString()))
                .thenReturn(new CreditService.CreditConsumptionReservation(tx, true));

        assertThatThrownBy(() -> agentCreditService.chargeAndCreate(userId, agent, () -> {
            throw new IllegalStateException("任务创建失败");
        })).isInstanceOf(IllegalStateException.class);

        verify(creditService).refundConsumption(tx, "智能体任务创建失败，自动退回积分");
        verify(settlementRepository, never()).save(any());
    }
}
