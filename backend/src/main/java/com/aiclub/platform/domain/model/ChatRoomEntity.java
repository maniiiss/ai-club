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
 * 多人聊天室房间。
 * 业务意图：房间是群聊历史的主边界，项目房间复用项目权限，全局房间通过成员表控制可见范围。
 */
@Entity
@Table(name = "chat_room")
public class ChatRoomEntity {

    /** 房间主键 ID。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 房间标题，用于列表和聊天页头部展示。 */
    @Column(nullable = false, length = 120)
    private String title = "";

    /** 可选绑定项目；为空时表示全局邀请制房间。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private ProjectEntity project;

    /** 房间创建人；全局房间只有创建人可以维护成员。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "creator_user_id", nullable = false)
    private UserEntity creatorUser;

    /** 可见类型：PROJECT 或 GLOBAL_INVITE。 */
    @Column(name = "visibility_type", nullable = false, length = 30)
    private String visibilityType = "GLOBAL_INVITE";

    /** 最近消息预览，避免列表页额外扫描消息表。 */
    @Column(name = "latest_preview", nullable = false, length = 500)
    private String latestPreview = "";

    /** 房间滚动摘要，供 @Hermes 理解整房间历史。 */
    @Column(name = "history_summary", nullable = false, columnDefinition = "TEXT")
    private String historySummary = "";

    /** 是否归档；归档房间不在默认列表显示。 */
    @Column(nullable = false)
    private boolean archived = false;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** 最近消息时间，用于列表排序。 */
    @Column(name = "last_message_at")
    private LocalDateTime lastMessageAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public UserEntity getCreatorUser() {
        return creatorUser;
    }

    public void setCreatorUser(UserEntity creatorUser) {
        this.creatorUser = creatorUser;
    }

    public String getVisibilityType() {
        return visibilityType;
    }

    public void setVisibilityType(String visibilityType) {
        this.visibilityType = visibilityType;
    }

    public String getLatestPreview() {
        return latestPreview;
    }

    public void setLatestPreview(String latestPreview) {
        this.latestPreview = latestPreview;
    }

    public String getHistorySummary() {
        return historySummary;
    }

    public void setHistorySummary(String historySummary) {
        this.historySummary = historySummary;
    }

    public boolean isArchived() {
        return archived;
    }

    public void setArchived(boolean archived) {
        this.archived = archived;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public LocalDateTime getLastMessageAt() {
        return lastMessageAt;
    }

    public void setLastMessageAt(LocalDateTime lastMessageAt) {
        this.lastMessageAt = lastMessageAt;
    }
}
