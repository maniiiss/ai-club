package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.repository.AgentInvocationLogRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 验证 ModelPricingService 的 token->积分换算、缓存折扣兜底、预扣估算与模型计费校验。
 */
class ModelPricingServiceTest {

    private final AiModelConfigRepository aiModelConfigRepository = mock(AiModelConfigRepository.class);
    private final AgentInvocationLogRepository agentInvocationLogRepository = mock(AgentInvocationLogRepository.class);
    /** 默认预算 token 数与构造器注入值一致。 */
    private final ModelPricingService service =
            new ModelPricingService(aiModelConfigRepository, agentInvocationLogRepository, 4000);

    private AiModelConfigEntity model(BigDecimal in, BigDecimal out, BigDecimal cached) {
        AiModelConfigEntity m = new AiModelConfigEntity();
        m.setId(1L);
        m.setInputCreditPer1k(in);
        m.setOutputCreditPer1k(out);
        m.setCachedInputCreditPer1k(cached);
        m.setTokenBillingEnabled(Boolean.TRUE);
        return m;
    }

    @Test
    void calculateCost_基本换算_向上取整() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), new BigDecimal("1"));
        // (1000*2 + 500*6 + 200*1) / 1000 = 5.2 -> ceil 6
        assertEquals(6, service.calculateCost(m, 1000, 500, 200));
    }

    @Test
    void calculateCost_缓存单价为空按输入半价兜底() {
        AiModelConfigEntity explicit = model(new BigDecimal("2"), new BigDecimal("6"), new BigDecimal("1"));
        AiModelConfigEntity fallback = model(new BigDecimal("2"), new BigDecimal("6"), null);
        // 显式 1.0 与兜底 2*0.5=1.0 结果一致
        int withExplicit = service.calculateCost(explicit, 1000, 500, 600);
        int withFallback = service.calculateCost(fallback, 1000, 500, 600);
        assertEquals(withExplicit, withFallback);
    }

    @Test
    void calculateCost_token为null按0() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), new BigDecimal("1"));
        assertEquals(0, service.calculateCost(m, null, null, null));
    }

    @Test
    void calculateCost_不足1向上取整为1() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), new BigDecimal("1"));
        // 100*2/1000 = 0.2 -> ceil 1
        assertEquals(1, service.calculateCost(m, 100, 0, 0));
    }

    @Test
    void estimatePreCharge_按输出单价预估() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), new BigDecimal("1"));
        // 4000*6/1000 = 24
        assertEquals(24, service.estimatePreCharge(m, 4000));
    }

    @Test
    void estimatePreCharge_budget为空用默认值() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), new BigDecimal("1"));
        assertEquals(24, service.estimatePreCharge(m, null));
    }

    @Test
    void estimatePreCharge_budget非正用默认值() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), new BigDecimal("1"));
        assertEquals(24, service.estimatePreCharge(m, 0));
    }

    @Test
    void estimatePreCharge_结果最小为1() {
        AiModelConfigEntity m = model(new BigDecimal("0.0001"), new BigDecimal("0.0001"), null);
        // 4000*0.0001/1000 = 0.0004 -> ceil 0 -> max(0,1)=1
        assertEquals(1, service.estimatePreCharge(m, 4000));
    }

    @Test
    void requireTokenBillingModel_未启用抛异常() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), null);
        m.setTokenBillingEnabled(Boolean.FALSE);
        when(aiModelConfigRepository.findById(1L)).thenReturn(Optional.of(m));
        assertThrows(IllegalStateException.class, () -> service.requireTokenBillingModel(1L));
    }

    @Test
    void requireTokenBillingModel_输入单价缺失抛异常() {
        AiModelConfigEntity m = model(null, new BigDecimal("6"), null);
        when(aiModelConfigRepository.findById(1L)).thenReturn(Optional.of(m));
        assertThrows(IllegalStateException.class, () -> service.requireTokenBillingModel(1L));
    }

    @Test
    void requireTokenBillingModel_模型不存在抛NoSuchElement() {
        when(aiModelConfigRepository.findById(99L)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> service.requireTokenBillingModel(99L));
    }

    @Test
    void requireTokenBillingModel_正常返回模型() {
        AiModelConfigEntity m = model(new BigDecimal("2"), new BigDecimal("6"), null);
        when(aiModelConfigRepository.findById(1L)).thenReturn(Optional.of(m));
        AiModelConfigEntity result = service.requireTokenBillingModel(1L);
        assertEquals(1L, result.getId());
    }
}
