package com.aiclub.platform.domain.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** 不可变发布快照；只有 DRAFT 版本允许编辑。 */
@Entity
@Table(name = "execution_orchestration_version")
public class ExecutionOrchestrationVersionEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "profile_id", nullable = false) private ExecutionOrchestrationProfileEntity profile;
    @Column(name = "version_no", nullable = false) private Integer versionNo;
    @Column(nullable = false, length = 20) private String status = "DRAFT";
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "source_version_id") private ExecutionOrchestrationVersionEntity sourceVersion;
    @Version @Column(nullable = false) private Long revision = 0L;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "created_by_user_id") private UserEntity createdByUser;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "published_by_user_id") private UserEntity publishedByUser;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;
    @Column(name = "published_at") private LocalDateTime publishedAt;
    @PrePersist void onCreate(){createdAt=updatedAt=LocalDateTime.now();}
    @PreUpdate void onUpdate(){updatedAt=LocalDateTime.now();}
    public Long getId(){return id;} public void setId(Long id){this.id=id;}
    public ExecutionOrchestrationProfileEntity getProfile(){return profile;} public void setProfile(ExecutionOrchestrationProfileEntity v){profile=v;}
    public Integer getVersionNo(){return versionNo;} public void setVersionNo(Integer v){versionNo=v;}
    public String getStatus(){return status;} public void setStatus(String v){status=v;}
    public ExecutionOrchestrationVersionEntity getSourceVersion(){return sourceVersion;} public void setSourceVersion(ExecutionOrchestrationVersionEntity v){sourceVersion=v;}
    public Long getRevision(){return revision;} public void setRevision(Long v){revision=v;}
    public UserEntity getCreatedByUser(){return createdByUser;} public void setCreatedByUser(UserEntity v){createdByUser=v;}
    public UserEntity getPublishedByUser(){return publishedByUser;} public void setPublishedByUser(UserEntity v){publishedByUser=v;}
    public LocalDateTime getCreatedAt(){return createdAt;} public LocalDateTime getPublishedAt(){return publishedAt;} public void setPublishedAt(LocalDateTime v){publishedAt=v;}
    public LocalDateTime getUpdatedAt(){return updatedAt;} public void setUpdatedAt(LocalDateTime v){updatedAt=v;}
}
