package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

/**
 * 工作项更新记录的字段或动作明细。
 * 业务意图：历史值使用文本快照保存，不依赖当前关联对象仍然存在。
 */
@Entity
@Table(name = "task_update_record_detail")
public class TaskUpdateRecordDetailEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "record_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private TaskUpdateRecordEntity record;

    @Column(name = "field_code", nullable = false, length = 100)
    private String fieldCode;

    @Column(name = "field_name", nullable = false, length = 120)
    private String fieldName = "";

    @Column(name = "detail_type", nullable = false, length = 30)
    private String detailType = "FIELD";

    @Column(name = "old_value", columnDefinition = "TEXT")
    private String oldValue;

    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue;

    @Column(name = "related_object_id")
    private Long relatedObjectId;

    @Column(name = "related_object_name_snapshot", length = 255)
    private String relatedObjectNameSnapshot;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public TaskUpdateRecordEntity getRecord() { return record; }
    public void setRecord(TaskUpdateRecordEntity record) { this.record = record; }
    public String getFieldCode() { return fieldCode; }
    public void setFieldCode(String fieldCode) { this.fieldCode = fieldCode; }
    public String getFieldName() { return fieldName; }
    public void setFieldName(String fieldName) { this.fieldName = fieldName; }
    public String getDetailType() { return detailType; }
    public void setDetailType(String detailType) { this.detailType = detailType; }
    public String getOldValue() { return oldValue; }
    public void setOldValue(String oldValue) { this.oldValue = oldValue; }
    public String getNewValue() { return newValue; }
    public void setNewValue(String newValue) { this.newValue = newValue; }
    public Long getRelatedObjectId() { return relatedObjectId; }
    public void setRelatedObjectId(Long relatedObjectId) { this.relatedObjectId = relatedObjectId; }
    public String getRelatedObjectNameSnapshot() { return relatedObjectNameSnapshot; }
    public void setRelatedObjectNameSnapshot(String relatedObjectNameSnapshot) { this.relatedObjectNameSnapshot = relatedObjectNameSnapshot; }
}
