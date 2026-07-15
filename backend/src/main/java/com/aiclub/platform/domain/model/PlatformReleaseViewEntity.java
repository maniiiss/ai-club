package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * 用户版本发布展示记录。
 * 业务意图：将“关闭弹窗也算展示一次”的产品规则持久化到服务端，跨设备保持一致。
 */
@Entity
@Table(name = "platform_release_view", uniqueConstraints = {
        @UniqueConstraint(name = "uk_platform_release_view_release_user", columnNames = {"release_id", "user_id"})
})
public class PlatformReleaseViewEntity {

    /** 展示记录主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 被展示的版本发布 ID。 */
    @Column(name = "release_id", nullable = false)
    private Long releaseId;

    /** 看到版本发布的用户 ID。 */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 首次展示时间。 */
    @Column(name = "viewed_at", nullable = false)
    private LocalDateTime viewedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getReleaseId() { return releaseId; }
    public void setReleaseId(Long releaseId) { this.releaseId = releaseId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public LocalDateTime getViewedAt() { return viewedAt; }
    public void setViewedAt(LocalDateTime viewedAt) { this.viewedAt = viewedAt; }
}
