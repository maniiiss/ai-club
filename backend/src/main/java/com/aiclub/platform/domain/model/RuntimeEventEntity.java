package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** Runtime 统一事件的幂等存储，避免 Pi 断线重连或重复回调造成事件重复。 */
@Entity
@Table(name = "runtime_event")
public class RuntimeEventEntity {

    @Id
    @Column(name = "event_key", length = 220)
    private String eventKey;

    @Column(name = "run_id", nullable = false, length = 120)
    private String runId;

    @Column(name = "session_id", nullable = false, length = 120)
    private String sessionId;

    @Column(nullable = false)
    private Long sequence;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson = "{}";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() { createdAt = LocalDateTime.now(); }

    public String getEventKey() { return eventKey; }
    public void setEventKey(String eventKey) { this.eventKey = eventKey; }
    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public Long getSequence() { return sequence; }
    public void setSequence(Long sequence) { this.sequence = sequence; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getPayloadJson() { return payloadJson; }
    public void setPayloadJson(String payloadJson) { this.payloadJson = payloadJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
