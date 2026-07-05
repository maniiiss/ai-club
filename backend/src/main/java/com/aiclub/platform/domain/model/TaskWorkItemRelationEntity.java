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
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 工作项之间的业务关系。
 * CHILD 表示父工作项到子工作项，RELATED 表示两个工作项之间的普通追踪关联。
 */
@Entity
@Table(name = "task_work_item_relation")
public class TaskWorkItemRelationEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_task_id", nullable = false)
    private TaskEntity sourceTask;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "target_task_id", nullable = false)
    private TaskEntity targetTask;

    @Column(name = "relation_type", nullable = false, length = 30)
    private String relationType;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public TaskEntity getSourceTask() {
        return sourceTask;
    }

    public void setSourceTask(TaskEntity sourceTask) {
        this.sourceTask = sourceTask;
    }

    public TaskEntity getTargetTask() {
        return targetTask;
    }

    public void setTargetTask(TaskEntity targetTask) {
        this.targetTask = targetTask;
    }

    public String getRelationType() {
        return relationType;
    }

    public void setRelationType(String relationType) {
        this.relationType = relationType;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
