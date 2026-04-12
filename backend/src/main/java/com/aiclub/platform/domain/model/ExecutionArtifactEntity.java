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
 * 执行产物实体。
 * 第一版主要沉淀步骤输出、最终摘要以及是否已经回写到工作项评论。
 */
@Entity
@Table(name = "execution_artifact")
public class ExecutionArtifactEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属运行实例。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private ExecutionRunEntity run;

    /**
     * 对应步骤，为空时表示运行级最终产物。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "step_id")
    private ExecutionStepEntity step;

    /**
     * 产物类型。
     */
    @Column(name = "artifact_type", nullable = false, length = 50)
    private String artifactType;

    /**
     * 产物标题。
     */
    @Column(nullable = false, length = 200)
    private String title = "";

    /**
     * 外部引用地址。
     */
    @Column(name = "content_ref", length = 500)
    private String contentRef;

    /**
     * 文本型产物内容。
     */
    @Column(name = "content_text", columnDefinition = "TEXT")
    private String contentText;

    /**
     * 是否已回写到工作项评论。
     */
    @Column(name = "work_item_writeback_flag", nullable = false)
    private boolean workItemWritebackFlag;

    /**
     * 创建时间。
     */
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

    public String getArtifactType() {
        return artifactType;
    }

    public void setArtifactType(String artifactType) {
        this.artifactType = artifactType;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContentRef() {
        return contentRef;
    }

    public void setContentRef(String contentRef) {
        this.contentRef = contentRef;
    }

    public String getContentText() {
        return contentText;
    }

    public void setContentText(String contentText) {
        this.contentText = contentText;
    }

    public boolean isWorkItemWritebackFlag() {
        return workItemWritebackFlag;
    }

    public void setWorkItemWritebackFlag(boolean workItemWritebackFlag) {
        this.workItemWritebackFlag = workItemWritebackFlag;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
