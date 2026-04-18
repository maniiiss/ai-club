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
 * 执行步骤事件实体。
 * 用于持久化步骤运行中的状态、日志与产物事件，供 SSE 重连和排障复盘使用。
 */
@Entity
@Table(name = "execution_step_event")
public class ExecutionStepEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private ExecutionRunEntity run;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "step_id")
    private ExecutionStepEntity step;

    /**
     * 运行内单调递增的事件游标。
     * 前端断线后通过该字段继续追事件，不依赖数据库主键。
     */
    @Column(name = "sequence_no", nullable = false)
    private Long sequenceNo;

    /**
     * 事件类型，例如 stdout_chunk、step_finished。
     */
    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    /**
     * 文本流类别，例如 stdout/stderr/system。
     */
    @Column(name = "stream_kind", length = 20)
    private String streamKind;

    /**
     * 事件负载，JSON 文本格式。
     */
    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson = "{}";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ExecutionRunEntity getRun() {
        return run;
    }

    public void setRun(ExecutionRunEntity run) {
        this.run = run;
    }

    public ExecutionStepEntity getStep() {
        return step;
    }

    public void setStep(ExecutionStepEntity step) {
        this.step = step;
    }

    public Long getSequenceNo() {
        return sequenceNo;
    }

    public void setSequenceNo(Long sequenceNo) {
        this.sequenceNo = sequenceNo;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getStreamKind() {
        return streamKind;
    }

    public void setStreamKind(String streamKind) {
        this.streamKind = streamKind;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String payloadJson) {
        this.payloadJson = payloadJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
