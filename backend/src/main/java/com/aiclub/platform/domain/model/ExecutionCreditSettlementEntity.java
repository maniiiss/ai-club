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
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
