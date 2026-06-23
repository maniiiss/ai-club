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
 * 自动合并日志的"逐条审查问题反馈"。
 *
 * <p>每条记录对应分享页访问者对某条具体 AI 审查问题（issue）的一次评价：</p>
 * <ul>
 *     <li>{@code verdict} - 分析正确 (CORRECT) 还是分析错误 (INCORRECT)</li>
 *     <li>{@code reason}  - 可选理由文本，限制 2000 字符（由 service 层校验）</li>
 *     <li>{@code section} - issue 来自详情中的哪个区块（仅 NEWLY_RAISED / PENDING 两种可反馈区块）</li>
 *     <li>{@code submitter_fingerprint_hash} - 服务端对客户端指纹再做 SHA-256(fp + salt)
 *         后的结果，避免直接信任前端，并实现"同来源覆盖式反馈"</li>
 * </ul>
 *
 * <p>未来 LLM 复盘智能体将按 {@code issue_id} 聚合所有 {@code INCORRECT} 反馈，
 * 用于分析自动合并审查智能体的失败模式。</p>
 */
@Entity
@Table(name = "gitlab_auto_merge_log_issue_feedback")
public class GitlabAutoMergeLogIssueFeedbackEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 关联的自动合并日志。日志删除时反馈一并级联删除。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "log_id", nullable = false)
    private GitlabAutoMergeLogEntity log;

    /** 冗余项目 id，便于按项目维度做反馈聚合统计。 */
    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /** 冗余配置 id，便于按配置维度回顾智能体表现。 */
    @Column(name = "config_id")
    private Long configId;

    /** ReviewIssueItem.id，规则 = "i-" + SHA-256(issueSemanticKey).substring(0,16)。 */
    @Column(name = "issue_id", nullable = false, length = 64)
    private String issueId;

    /** 反馈提交时刻的 issue 文本快照，避免 issue 文本变化后反馈"失锚"。 */
    @Column(name = "issue_text_snapshot", nullable = false, columnDefinition = "TEXT")
    private String issueTextSnapshot;

    /** issue 所在区块：NEWLY_RAISED（本次新增问题） / PENDING（当前仍需处理问题）。 */
    @Column(name = "section", nullable = false, length = 32)
    private String section;

    /** 评价：CORRECT（分析正确） / INCORRECT（分析错误）。 */
    @Column(name = "verdict", nullable = false, length = 16)
    private String verdict;

    /** 可选理由，最长 2000 字符。 */
    @Column(name = "reason", columnDefinition = "TEXT")
    private String reason;

    /** 服务端对前端 fingerprint 再做 SHA-256(fp + salt) 后的 hash。 */
    @Column(name = "submitter_fingerprint_hash", nullable = false, length = 128)
    private String submitterFingerprintHash;

    /** 服务端对客户端 IP + salt 做 SHA-256 后的 hash，仅用于异常流量回溯。 */
    @Column(name = "submitter_ip_hash", length = 128)
    private String submitterIpHash;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    /** 反馈提交时刻日志本身的 result 快照（MERGED / AI_REJECTED / FAILED / SKIPPED 等）。 */
    @Column(name = "review_result_snapshot", length = 32)
    private String reviewResultSnapshot;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        this.updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public GitlabAutoMergeLogEntity getLog() {
        return log;
    }

    public void setLog(GitlabAutoMergeLogEntity log) {
        this.log = log;
    }

    public Long getProjectId() {
        return projectId;
    }

    public void setProjectId(Long projectId) {
        this.projectId = projectId;
    }

    public Long getConfigId() {
        return configId;
    }

    public void setConfigId(Long configId) {
        this.configId = configId;
    }

    public String getIssueId() {
        return issueId;
    }

    public void setIssueId(String issueId) {
        this.issueId = issueId;
    }

    public String getIssueTextSnapshot() {
        return issueTextSnapshot;
    }

    public void setIssueTextSnapshot(String issueTextSnapshot) {
        this.issueTextSnapshot = issueTextSnapshot;
    }

    public String getSection() {
        return section;
    }

    public void setSection(String section) {
        this.section = section;
    }

    public String getVerdict() {
        return verdict;
    }

    public void setVerdict(String verdict) {
        this.verdict = verdict;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getSubmitterFingerprintHash() {
        return submitterFingerprintHash;
    }

    public void setSubmitterFingerprintHash(String submitterFingerprintHash) {
        this.submitterFingerprintHash = submitterFingerprintHash;
    }

    public String getSubmitterIpHash() {
        return submitterIpHash;
    }

    public void setSubmitterIpHash(String submitterIpHash) {
        this.submitterIpHash = submitterIpHash;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getReviewResultSnapshot() {
        return reviewResultSnapshot;
    }

    public void setReviewResultSnapshot(String reviewResultSnapshot) {
        this.reviewResultSnapshot = reviewResultSnapshot;
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
}
