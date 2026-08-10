package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 执行任务积分结算记录，以执行任务唯一约束保证异步终态只能退款一次。
 */
@Entity
@Table(name = "execution_credit_settlement")
public class ExecutionCreditSettlementEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "execution_task_id", nullable = false, unique = true)
    private ExecutionTaskEntity executionTask;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consume_transaction_id", nullable = false)
    private UserCreditTransactionEntity consumeTransaction;

    @Column(name = "feature_code", nullable = false, length = 80)
    private String featureCode;

    @Column(nullable = false, length = 20)
    private String status = "CHARGED";

    /**
     * 计费模式：FIXED 固定积分（技术设计）/ TOKEN_BASED 按 token 计费（智能体）。
     */
    @Column(name = "charge_mode", nullable = false, length = 20)
    private String chargeMode = "FIXED";

    /**
     * TOKEN_BASED 模式计费模型配置 ID。
     */
    @Column(name = "model_config_id")
    private Long modelConfigId;

    /**
     * 预扣积分数（TOKEN_BASED 专用）。
     */
    @Column(name = "prepaid_credits")
    private Integer prepaidCredits;

    /**
     * 实际应扣积分数，终态填（TOKEN_BASED 专用）。
     */
    @Column(name = "actual_credits")
    private Integer actualCredits;

    /**
     * 结算调整流水 ID（退差 REFUND / 补扣 CONSUME）。
     */
    @Column(name = "adjust_transaction_id")
    private Long adjustTransactionId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ExecutionTaskEntity getExecutionTask() { return executionTask; }
    public void setExecutionTask(ExecutionTaskEntity executionTask) { this.executionTask = executionTask; }
    public UserCreditTransactionEntity getConsumeTransaction() { return consumeTransaction; }
    public void setConsumeTransaction(UserCreditTransactionEntity consumeTransaction) { this.consumeTransaction = consumeTransaction; }
    public String getFeatureCode() { return featureCode; }
    public void setFeatureCode(String featureCode) { this.featureCode = featureCode; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getChargeMode() { return chargeMode; }
    public void setChargeMode(String chargeMode) { this.chargeMode = chargeMode; }
    public Long getModelConfigId() { return modelConfigId; }
    public void setModelConfigId(Long modelConfigId) { this.modelConfigId = modelConfigId; }
    public Integer getPrepaidCredits() { return prepaidCredits; }
    public void setPrepaidCredits(Integer prepaidCredits) { this.prepaidCredits = prepaidCredits; }
    public Integer getActualCredits() { return actualCredits; }
    public void setActualCredits(Integer actualCredits) { this.actualCredits = actualCredits; }
    public Long getAdjustTransactionId() { return adjustTransactionId; }
    public void setAdjustTransactionId(Long adjustTransactionId) { this.adjustTransactionId = adjustTransactionId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
