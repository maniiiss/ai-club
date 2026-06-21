package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import org.springframework.stereotype.Service;

import java.util.function.Supplier;

/**
 * AI 功能积分消费门面。
 * 业务功能通过该服务包裹实际执行逻辑：先扣减积分，执行失败时自动退款，重复业务键不会重复扣费。
 */
@Service
public class CreditConsumptionService {

    private final CreditService creditService;

    public CreditConsumptionService(CreditService creditService) {
        this.creditService = creditService;
    }

    public <T> T consumeForFeature(Long userId,
                                   String featureCode,
                                   String businessKey,
                                   String reason,
                                   Supplier<T> supplier) {
        CreditFeatureConfigEntity featureConfig = creditService.requireEnabledFeatureConfig(featureCode);
        CreditService.CreditConsumptionReservation reservation = creditService.consume(userId, featureConfig, businessKey, reason);
        try {
            return supplier.get();
        } catch (RuntimeException exception) {
            if (reservation.chargedNow()) {
                creditService.refundConsumption(reservation.transaction(), "业务执行失败自动退回：" + exception.getMessage());
            }
            throw exception;
        }
    }
}
