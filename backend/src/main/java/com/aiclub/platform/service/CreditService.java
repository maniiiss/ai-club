package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import com.aiclub.platform.domain.model.CreditGlobalConfigEntity;
import com.aiclub.platform.domain.model.UserCreditAccountEntity;
import com.aiclub.platform.domain.model.UserCreditTransactionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CreditAccountSummary;
import com.aiclub.platform.dto.CreditFeatureConfigSummary;
import com.aiclub.platform.dto.CreditGlobalConfigSummary;
import com.aiclub.platform.dto.CreditTransactionSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreditAdjustmentRequest;
import com.aiclub.platform.dto.request.CreditFeatureConfigRequest;
import com.aiclub.platform.dto.request.CreditGlobalConfigRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.CreditFeatureConfigRepository;
import com.aiclub.platform.repository.CreditGlobalConfigRepository;
import com.aiclub.platform.repository.UserCreditAccountRepository;
import com.aiclub.platform.repository.UserCreditTransactionRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;

/**
 * 积分账户应用服务。
 * 负责管理积分配置、用户开户、注册赠送、后台调账和流水查询，所有余额变化必须经过这里写入流水。
 */
@Service
@Transactional(readOnly = true)
public class CreditService {

    public static final String TYPE_REGISTER_GRANT = "REGISTER_GRANT";
    public static final String TYPE_ADJUST_INCREASE = "ADJUST_INCREASE";
    public static final String TYPE_ADJUST_DECREASE = "ADJUST_DECREASE";
    public static final String TYPE_CONSUME = "CONSUME";
    public static final String TYPE_REFUND = "REFUND";

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final long GLOBAL_CONFIG_ID = 1L;

    private final CreditGlobalConfigRepository creditGlobalConfigRepository;
    private final CreditFeatureConfigRepository creditFeatureConfigRepository;
    private final UserCreditAccountRepository userCreditAccountRepository;
    private final UserCreditTransactionRepository userCreditTransactionRepository;
    private final UserRepository userRepository;

    public CreditService(CreditGlobalConfigRepository creditGlobalConfigRepository,
                         CreditFeatureConfigRepository creditFeatureConfigRepository,
                         UserCreditAccountRepository userCreditAccountRepository,
                         UserCreditTransactionRepository userCreditTransactionRepository,
                         UserRepository userRepository) {
        this.creditGlobalConfigRepository = creditGlobalConfigRepository;
        this.creditFeatureConfigRepository = creditFeatureConfigRepository;
        this.userCreditAccountRepository = userCreditAccountRepository;
        this.userCreditTransactionRepository = userCreditTransactionRepository;
        this.userRepository = userRepository;
    }

    public CreditGlobalConfigSummary getGlobalConfig() {
        return toGlobalConfigSummary(requireGlobalConfig());
    }

    @Transactional
    public CreditGlobalConfigSummary updateGlobalConfig(CreditGlobalConfigRequest request) {
        CreditGlobalConfigEntity entity = requireGlobalConfig();
        entity.setRegisterGrantAmount(Math.max(0, request.registerGrantAmount()));
        entity.setRegisterGrantEnabled(Boolean.TRUE.equals(request.registerGrantEnabled()));
        entity.setUpdatedAt(LocalDateTime.now());
        return toGlobalConfigSummary(creditGlobalConfigRepository.save(entity));
    }

    public List<CreditFeatureConfigSummary> listFeatureConfigs() {
        return creditFeatureConfigRepository.findAllByOrderByIdAsc().stream()
                .map(this::toFeatureConfigSummary)
                .toList();
    }

    @Transactional
    public CreditFeatureConfigSummary saveFeatureConfig(CreditFeatureConfigRequest request) {
        String featureCode = normalizeFeatureCode(request.featureCode());
        CreditFeatureConfigEntity entity = creditFeatureConfigRepository.findByFeatureCodeIgnoreCase(featureCode)
                .orElseGet(CreditFeatureConfigEntity::new);
        if (entity.getId() != null && creditFeatureConfigRepository.existsByFeatureCodeIgnoreCaseAndIdNot(featureCode, entity.getId())) {
            throw new IllegalArgumentException("功能编码已存在");
        }
        entity.setFeatureCode(featureCode);
        entity.setFeatureName(requireText(request.featureName(), "功能名称不能为空"));
        entity.setCostAmount(requirePositiveAmount(request.costAmount(), "每次扣减积分必须大于 0"));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        entity.setUpdatedAt(LocalDateTime.now());
        return toFeatureConfigSummary(creditFeatureConfigRepository.save(entity));
    }

    public PageResponse<CreditAccountSummary> pageAccounts(int page, int size, String keyword) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.ASC, "id"));
        String normalizedKeyword = defaultString(keyword);
        if (normalizedKeyword.isBlank()) {
            return PageResponse.from(userCreditAccountRepository.findAll(pageable).map(this::toAccountSummary));
        }
        return PageResponse.from(userCreditAccountRepository.searchByUserKeyword(normalizedKeyword, pageable).map(this::toAccountSummary));
    }

    public CreditAccountSummary getAccount(Long userId) {
        return toAccountSummary(ensureAccount(userId));
    }

    public CreditAccountSummary getCurrentAccount() {
        return getAccount(currentUserId());
    }

    public PageResponse<CreditTransactionSummary> pageAccountTransactions(Long userId, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
        return PageResponse.from(userCreditTransactionRepository.findAllByUser_Id(userId, pageable).map(this::toTransactionSummary));
    }

    public PageResponse<CreditTransactionSummary> pageCurrentAccountTransactions(int page, int size) {
        return pageAccountTransactions(currentUserId(), page, size);
    }

    @Transactional
    public CreditAccountSummary adjustAccount(Long userId, CreditAdjustmentRequest request) {
        if (request.amount() == 0) {
            throw new IllegalArgumentException("调账积分不能为 0");
        }
        UserCreditAccountEntity account = ensureAccountForUpdate(userId);
        String type = request.amount() > 0 ? TYPE_ADJUST_INCREASE : TYPE_ADJUST_DECREASE;
        applyDelta(account, type, request.amount(), null, null, request.reason(), currentOperatorUserIdOrNull(), null);
        return toAccountSummary(account);
    }

    @Transactional
    public void grantRegisterCredits(Long userId) {
        CreditGlobalConfigEntity config = requireGlobalConfig();
        UserCreditAccountEntity account = ensureAccountForUpdate(userId);
        if (!config.isRegisterGrantEnabled() || config.getRegisterGrantAmount() <= 0) {
            return;
        }
        applyDelta(account, TYPE_REGISTER_GRANT, config.getRegisterGrantAmount(), null, null, "注册赠送积分", null, null);
    }

    @Transactional
    public CreditConsumptionReservation consume(Long userId, CreditFeatureConfigEntity featureConfig, String businessKey, String reason) {
        UserCreditTransactionEntity existing = findExistingConsumption(userId, featureConfig.getFeatureCode(), businessKey);
        if (existing != null) {
            return new CreditConsumptionReservation(existing, false);
        }
        UserCreditAccountEntity account = ensureAccountForUpdate(userId);
        int costAmount = featureConfig.getCostAmount();
        if (account.getBalance() < costAmount) {
            throw new IllegalArgumentException("积分余额不足，请联系管理员充值");
        }
        UserCreditTransactionEntity transaction = applyDelta(account, TYPE_CONSUME, -costAmount, featureConfig.getFeatureCode(), businessKey, reason, userId, null);
        return new CreditConsumptionReservation(transaction, true);
    }

    @Transactional
    public void refundConsumption(UserCreditTransactionEntity consumeTransaction, String reason) {
        if (consumeTransaction == null || !TYPE_CONSUME.equals(consumeTransaction.getTransactionType())) {
            return;
        }
        UserCreditAccountEntity account = ensureAccountForUpdate(consumeTransaction.getUser().getId());
        applyDelta(
                account,
                TYPE_REFUND,
                Math.abs(consumeTransaction.getAmount()),
                consumeTransaction.getFeatureCode(),
                consumeTransaction.getBusinessKey(),
                reason,
                consumeTransaction.getUser().getId(),
                consumeTransaction
        );
    }

    public CreditFeatureConfigEntity requireEnabledFeatureConfig(String featureCode) {
        String normalized = normalizeFeatureCode(featureCode);
        CreditFeatureConfigEntity entity = creditFeatureConfigRepository.findByFeatureCodeIgnoreCase(normalized)
                .orElseThrow(() -> new NoSuchElementException("积分功能配置不存在: " + normalized));
        if (!entity.isEnabled()) {
            throw new IllegalArgumentException("积分功能配置已停用: " + normalized);
        }
        return entity;
    }

    private UserCreditTransactionEntity findExistingConsumption(Long userId, String featureCode, String businessKey) {
        if (businessKey == null || businessKey.isBlank()) {
            return null;
        }
        return userCreditTransactionRepository.findFirstByUser_IdAndFeatureCodeIgnoreCaseAndBusinessKeyAndTransactionType(
                userId,
                featureCode,
                businessKey.trim(),
                TYPE_CONSUME
        ).orElse(null);
    }

    private UserCreditTransactionEntity applyDelta(UserCreditAccountEntity account,
                                                   String type,
                                                   int amount,
                                                   String featureCode,
                                                   String businessKey,
                                                   String reason,
                                                   Long operatorUserId,
                                                   UserCreditTransactionEntity relatedTransaction) {
        int nextBalance = account.getBalance() + amount;
        if (nextBalance < 0) {
            throw new IllegalArgumentException("积分余额不足，请联系管理员充值");
        }
        account.setBalance(nextBalance);
        if (TYPE_REGISTER_GRANT.equals(type) || TYPE_ADJUST_INCREASE.equals(type)) {
            account.setTotalGranted(account.getTotalGranted() + Math.max(amount, 0));
        } else if (TYPE_CONSUME.equals(type)) {
            account.setTotalConsumed(account.getTotalConsumed() + Math.abs(amount));
        } else if (TYPE_REFUND.equals(type)) {
            account.setTotalRefunded(account.getTotalRefunded() + Math.max(amount, 0));
        }
        account.setUpdatedAt(LocalDateTime.now());
        userCreditAccountRepository.save(account);

        UserCreditTransactionEntity transaction = new UserCreditTransactionEntity();
        transaction.setAccount(account);
        transaction.setUser(account.getUser());
        transaction.setTransactionType(type);
        transaction.setAmount(amount);
        transaction.setBalanceAfter(account.getBalance());
        transaction.setFeatureCode(blankToNull(featureCode));
        transaction.setBusinessKey(blankToNull(businessKey));
        transaction.setReason(defaultString(reason));
        transaction.setOperatorUserId(operatorUserId);
        transaction.setRelatedTransaction(relatedTransaction);
        return userCreditTransactionRepository.save(transaction);
    }

    private UserCreditAccountEntity ensureAccount(Long userId) {
        return userCreditAccountRepository.findByUser_Id(userId)
                .orElseGet(() -> createAccount(requireUser(userId)));
    }

    private UserCreditAccountEntity ensureAccountForUpdate(Long userId) {
        return userCreditAccountRepository.findByUserIdForUpdate(userId)
                .orElseGet(() -> createAccount(requireUser(userId)));
    }

    private UserCreditAccountEntity createAccount(UserEntity user) {
        UserCreditAccountEntity entity = new UserCreditAccountEntity();
        entity.setUser(user);
        return userCreditAccountRepository.save(entity);
    }

    private UserEntity requireUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("用户不存在: " + userId));
    }

    private CreditGlobalConfigEntity requireGlobalConfig() {
        return creditGlobalConfigRepository.findById(GLOBAL_CONFIG_ID)
                .orElseGet(() -> {
                    CreditGlobalConfigEntity entity = new CreditGlobalConfigEntity();
                    entity.setId(GLOBAL_CONFIG_ID);
                    return creditGlobalConfigRepository.save(entity);
                });
    }

    private Long currentUserId() {
        return AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
    }

    private Long currentOperatorUserIdOrNull() {
        return AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
    }

    private CreditGlobalConfigSummary toGlobalConfigSummary(CreditGlobalConfigEntity entity) {
        return new CreditGlobalConfigSummary(
                entity.getRegisterGrantAmount(),
                entity.isRegisterGrantEnabled(),
                formatTime(entity.getUpdatedAt())
        );
    }

    private CreditFeatureConfigSummary toFeatureConfigSummary(CreditFeatureConfigEntity entity) {
        return new CreditFeatureConfigSummary(
                entity.getId(),
                entity.getFeatureCode(),
                entity.getFeatureName(),
                entity.getCostAmount(),
                entity.isEnabled(),
                formatTime(entity.getUpdatedAt())
        );
    }

    private CreditAccountSummary toAccountSummary(UserCreditAccountEntity entity) {
        UserEntity user = entity.getUser();
        return new CreditAccountSummary(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                entity.getBalance(),
                entity.getTotalGranted(),
                entity.getTotalConsumed(),
                entity.getTotalRefunded(),
                formatTime(entity.getUpdatedAt())
        );
    }

    private CreditTransactionSummary toTransactionSummary(UserCreditTransactionEntity entity) {
        return new CreditTransactionSummary(
                entity.getId(),
                entity.getUser().getId(),
                entity.getUser().getUsername(),
                entity.getTransactionType(),
                entity.getAmount(),
                entity.getBalanceAfter(),
                defaultString(entity.getFeatureCode()),
                defaultString(entity.getBusinessKey()),
                defaultString(entity.getReason()),
                entity.getOperatorUserId(),
                entity.getRelatedTransaction() == null ? null : entity.getRelatedTransaction().getId(),
                formatTime(entity.getCreatedAt())
        );
    }

    private String normalizeFeatureCode(String value) {
        return requireText(value, "功能编码不能为空").toUpperCase(Locale.ROOT);
    }

    private int requirePositiveAmount(int value, String message) {
        if (value <= 0) {
            throw new IllegalArgumentException(message);
        }
        return value;
    }

    private String requireText(String value, String message) {
        String normalized = defaultString(value);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return normalized;
    }

    private String blankToNull(String value) {
        String normalized = defaultString(value);
        return normalized.isBlank() ? null : normalized;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    /**
     * 消费预留结果标记本次是否真实扣减，避免幂等命中旧流水后因后续业务失败误触发二次退款。
     */
    public record CreditConsumptionReservation(
            UserCreditTransactionEntity transaction,
            boolean chargedNow
    ) {
    }
}
