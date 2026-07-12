package com.aiclub.platform.domain.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 工作项一次业务更新的主记录。
 * 业务意图：把一次保存动作聚合为一个时间线节点，再由明细承载多个字段或关联变化。
 */
@Entity
@Table(name = "task_update_record")
public class TaskUpdateRecordEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private TaskEntity task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "operator_user_id")
    private UserEntity operatorUser;

    @Column(name = "operator_name_snapshot", nullable = false, length = 100)
    private String operatorNameSnapshot = "";

    @Column(nullable = false, length = 20)
    private String source;

    @Column(name = "action_type", nullable = false, length = 30)
    private String actionType;

    @Column(nullable = false, length = 500)
    private String summary = "";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "record", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TaskUpdateRecordDetailEntity> details = new ArrayList<>();

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public void addDetail(TaskUpdateRecordDetailEntity detail) {
        details.add(detail);
        detail.setRecord(this);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public TaskEntity getTask() { return task; }
    public void setTask(TaskEntity task) { this.task = task; }
    public UserEntity getOperatorUser() { return operatorUser; }
    public void setOperatorUser(UserEntity operatorUser) { this.operatorUser = operatorUser; }
    public String getOperatorNameSnapshot() { return operatorNameSnapshot; }
    public void setOperatorNameSnapshot(String operatorNameSnapshot) { this.operatorNameSnapshot = operatorNameSnapshot; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public List<TaskUpdateRecordDetailEntity> getDetails() { return details; }
    public void setDetails(List<TaskUpdateRecordDetailEntity> details) { this.details = details; }
}
