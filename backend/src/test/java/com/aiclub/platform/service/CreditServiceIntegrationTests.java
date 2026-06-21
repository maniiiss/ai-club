package com.aiclub.platform.service;

import com.aiclub.platform.dto.CreditAccountSummary;
import com.aiclub.platform.dto.CreditTransactionSummary;
import com.aiclub.platform.dto.request.CreditAdjustmentRequest;
import com.aiclub.platform.dto.request.CreditFeatureConfigRequest;
import com.aiclub.platform.dto.request.CreditGlobalConfigRequest;
import com.aiclub.platform.dto.request.RegisterRequest;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 积分系统集成测试，覆盖注册赠送、后台调账、AI 功能扣减与失败退款等核心账务契约。
 */
@SpringBootTest
@Transactional
class CreditServiceIntegrationTests {

    @Autowired
    private AuthService authService;

    @Autowired
    private CreditService creditService;

    @Autowired
    private CreditConsumptionService creditConsumptionService;

    @Autowired
    private UserRepository userRepository;

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldGrantConfiguredCreditsWhenUserRegisters() {
        creditService.updateGlobalConfig(new CreditGlobalConfigRequest(88, true));

        authService.register(new RegisterRequest(
                "credit-register-user",
                "注册积分用户",
                "credit-register@example.com",
                "13800001111",
                "",
                "secret123"
        ));

        Long userId = userRepository.findByUsernameWithDetails("credit-register-user").orElseThrow().getId();
        CreditAccountSummary account = creditService.getAccount(userId);
        List<CreditTransactionSummary> transactions = creditService.pageAccountTransactions(userId, 1, 10).records();

        assertThat(account.balance()).isEqualTo(88);
        assertThat(transactions).hasSize(1);
        assertThat(transactions.get(0).transactionType()).isEqualTo("REGISTER_GRANT");
        assertThat(transactions.get(0).amount()).isEqualTo(88);
    }

    @Test
    void shouldAdjustUserCreditsAndWriteLedger() {
        Long userId = createRegisteredUser("credit-adjust-user");

        CreditAccountSummary afterIncrease = creditService.adjustAccount(userId, new CreditAdjustmentRequest(30, "人工充值"));
        CreditAccountSummary afterDecrease = creditService.adjustAccount(userId, new CreditAdjustmentRequest(-12, "人工扣减"));

        assertThat(afterIncrease.balance()).isEqualTo(30);
        assertThat(afterDecrease.balance()).isEqualTo(18);
        assertThat(creditService.pageAccountTransactions(userId, 1, 10).records())
                .extracting(CreditTransactionSummary::transactionType)
                .containsExactly("ADJUST_DECREASE", "ADJUST_INCREASE");
    }

    @Test
    void shouldRejectConsumptionWhenBalanceIsInsufficient() {
        Long userId = createRegisteredUser("credit-low-balance-user");
        creditService.saveFeatureConfig(new CreditFeatureConfigRequest("PUBLIC_AI_ASSISTANT", "公众端 AI 助手", 9, true));

        assertThatThrownBy(() -> creditConsumptionService.consumeForFeature(
                userId,
                "PUBLIC_AI_ASSISTANT",
                "case-001",
                "余额不足测试",
                () -> "unreachable"
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("积分余额不足");

        assertThat(creditService.getAccount(userId).balance()).isZero();
        assertThat(creditService.pageAccountTransactions(userId, 1, 10).records()).isEmpty();
    }

    @Test
    void shouldConsumeOnceForSameBusinessKey() {
        Long userId = createRegisteredUser("credit-idempotent-user");
        creditService.adjustAccount(userId, new CreditAdjustmentRequest(20, "初始余额"));
        creditService.saveFeatureConfig(new CreditFeatureConfigRequest("PUBLIC_AI_ASSISTANT", "公众端 AI 助手", 7, true));
        AtomicInteger calls = new AtomicInteger();

        String first = creditConsumptionService.consumeForFeature(
                userId,
                "PUBLIC_AI_ASSISTANT",
                "case-002",
                "幂等测试",
                () -> {
                    calls.incrementAndGet();
                    return "first";
                }
        );
        String second = creditConsumptionService.consumeForFeature(
                userId,
                "PUBLIC_AI_ASSISTANT",
                "case-002",
                "幂等测试",
                () -> {
                    calls.incrementAndGet();
                    return "second";
                }
        );

        assertThat(first).isEqualTo("first");
        assertThat(second).isEqualTo("second");
        assertThat(calls).hasValue(2);
        assertThat(creditService.getAccount(userId).balance()).isEqualTo(13);
        assertThat(creditService.pageAccountTransactions(userId, 1, 10).records())
                .filteredOn(transaction -> "CONSUME".equals(transaction.transactionType()))
                .hasSize(1);
    }

    @Test
    void shouldRefundCreditsWhenConsumedBusinessFails() {
        Long userId = createRegisteredUser("credit-refund-user");
        creditService.adjustAccount(userId, new CreditAdjustmentRequest(20, "初始余额"));
        creditService.saveFeatureConfig(new CreditFeatureConfigRequest("PUBLIC_AI_ASSISTANT", "公众端 AI 助手", 6, true));

        assertThatThrownBy(() -> creditConsumptionService.consumeForFeature(
                userId,
                "PUBLIC_AI_ASSISTANT",
                "case-003",
                "失败退款测试",
                () -> {
                    throw new IllegalStateException("AI 调用失败");
                }
        )).isInstanceOf(IllegalStateException.class)
                .hasMessage("AI 调用失败");

        assertThat(creditService.getAccount(userId).balance()).isEqualTo(20);
        assertThat(creditService.pageAccountTransactions(userId, 1, 10).records())
                .extracting(CreditTransactionSummary::transactionType)
                .containsExactly("REFUND", "CONSUME", "ADJUST_INCREASE");
    }

    @Test
    void shouldNotRefundExistingConsumptionWhenDuplicateBusinessFails() {
        Long userId = createRegisteredUser("credit-duplicate-failure-user");
        creditService.adjustAccount(userId, new CreditAdjustmentRequest(20, "初始余额"));
        creditService.saveFeatureConfig(new CreditFeatureConfigRequest("PUBLIC_AI_ASSISTANT", "公众端 AI 助手", 6, true));

        creditConsumptionService.consumeForFeature(
                userId,
                "PUBLIC_AI_ASSISTANT",
                "case-004",
                "幂等失败退款边界",
                () -> "ok"
        );

        assertThatThrownBy(() -> creditConsumptionService.consumeForFeature(
                userId,
                "PUBLIC_AI_ASSISTANT",
                "case-004",
                "幂等失败退款边界",
                () -> {
                    throw new IllegalStateException("重复请求失败");
                }
        )).isInstanceOf(IllegalStateException.class)
                .hasMessage("重复请求失败");

        assertThat(creditService.getAccount(userId).balance()).isEqualTo(14);
        assertThat(creditService.pageAccountTransactions(userId, 1, 10).records())
                .extracting(CreditTransactionSummary::transactionType)
                .containsExactly("CONSUME", "ADJUST_INCREASE");
    }

    @Test
    void shouldOnlyExposeCurrentUserCreditDataOnPublicApis() {
        Long currentUserId = createRegisteredUser("credit-current-user");
        Long otherUserId = createRegisteredUser("credit-other-user");
        creditService.adjustAccount(currentUserId, new CreditAdjustmentRequest(11, "当前用户余额"));
        creditService.adjustAccount(otherUserId, new CreditAdjustmentRequest(99, "其他用户余额"));
        AuthContextHolder.set(new AuthContext(currentUserId, "credit-current-user", "当前用户", Set.of(), Set.of()));

        CreditAccountSummary currentAccount = creditService.getCurrentAccount();
        List<CreditTransactionSummary> currentTransactions = creditService.pageCurrentAccountTransactions(1, 10).records();

        assertThat(currentAccount.userId()).isEqualTo(currentUserId);
        assertThat(currentAccount.balance()).isEqualTo(11);
        assertThat(currentTransactions).extracting(CreditTransactionSummary::userId).containsOnly(currentUserId);
    }

    private Long createRegisteredUser(String username) {
        authService.register(new RegisterRequest(
                username,
                username,
                username + "@example.com",
                "13800000000",
                "",
                "secret123"
        ));
        return userRepository.findByUsernameWithDetails(username).orElseThrow().getId();
    }
}
