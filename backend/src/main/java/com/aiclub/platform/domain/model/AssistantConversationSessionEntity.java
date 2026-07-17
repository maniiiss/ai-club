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
 * Assistant 云端会话主记录。
 * 该实体只负责保存会话元信息与前端回显快照，不承载 Assistant 内部隐藏记忆。
 */
@Entity
@Table(name = "hermes_conversation_session")
public class AssistantConversationSessionEntity {

    /** 会话主键ID。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 会话归属用户。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    /** 会话标题。 */
    @Column(nullable = false, length = 100)
    private String title = "";

    /** 是否已被用户手动重命名。 */
    @Column(name = "title_customized", nullable = false)
    private boolean titleCustomized;

    /** 提供给 Assistant/Redis 热状态链路复用的稳定会话标识。 */
    @Column(name = "client_conversation_id", nullable = false, length = 120)
    private String clientConversationId = "";

    /** 创建会话时绑定的页面路由名称。 */
    @Column(name = "route_name", nullable = false, length = 80)
    private String routeName = "";

    /** GitPilot 会话创建时固定的 Runtime，后续对话不因平台默认切换而改变。 */
    @Column(name = "runtime_registry_code", length = 40)
    private String runtimeRegistryCode = "HERMES_LEGACY";

    /** 创建会话时绑定的 Agent Profile 版本，用于历史会话回放。 */
    @Column(name = "runtime_profile_version")
    private Long runtimeProfileVersion = 1L;

    /** 创建会话时固定的 Runtime 上下文预算配置，避免管理员改配置影响历史会话。 */
    @Column(name = "runtime_context_profile_snapshot_json", nullable = false, columnDefinition = "TEXT")
    private String runtimeContextProfileSnapshotJson = "{}";

    /** 创建会话时固化的个人外部 MCP 配置密文快照，避免用户后续编辑影响历史会话。 */
    @Column(name = "external_mcp_snapshot_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String externalMcpSnapshotCiphertext = "";

    /** 压缩后的滚动对话摘要，原始消息仍完整保留在消息表。 */
    @Column(name = "context_summary", nullable = false, columnDefinition = "TEXT")
    private String contextSummary = "";

    /** 结构化对话事实 JSON，例如项目、分支和候选对象。 */
    @Column(name = "context_facts_json", nullable = false, columnDefinition = "TEXT")
    private String contextFactsJson = "{}";

    /** 当前等待用户确认的问题。 */
    @Column(name = "pending_clarification_json", nullable = false, columnDefinition = "TEXT")
    private String pendingClarificationJson = "";

    @Column(name = "summary_through_message_id")
    private Long summaryThroughMessageId;

    @Column(name = "context_version", nullable = false)
    private Long contextVersion = 0L;

    @Column(name = "estimated_context_tokens", nullable = false)
    private Integer estimatedContextTokens = 0;

    /** 会话绑定的项目ID。 */
    @Column(name = "project_id")
    private Long projectId;

    /** 会话绑定的任务ID。 */
    @Column(name = "task_id")
    private Long taskId;

    /** 会话绑定的迭代ID。 */
    @Column(name = "iteration_id")
    private Long iterationId;

    /** 会话绑定的测试计划ID。 */
    @Column(name = "plan_id")
    private Long planId;

    /** 会话绑定的 Wiki 空间ID。 */
    @Column(name = "wiki_space_id")
    private Long wikiSpaceId;

    /** 会话绑定的 Wiki 页面ID。 */
    @Column(name = "wiki_page_id")
    private Long wikiPageId;

    /** 用于列表展示的最近一条回答摘要。 */
    @Column(name = "latest_preview", nullable = false, length = 500)
    private String latestPreview = "";

    /** 前端回显所需的最新展示态快照，使用 JSON 文本保存。 */
    @Column(name = "latest_display_state_json", nullable = false, columnDefinition = "TEXT")
    private String latestDisplayStateJson = "{}";

    /**
     * 当前会话中已被用户确认执行过的动作 key 列表，使用 JSON 数组字符串保存。
     * 用于刷新或换设备后仍能把"可执行动作"按钮恢复为"已执行"，避免重复触发同一写入动作。
     */
    @Column(name = "executed_action_keys_json", nullable = false, columnDefinition = "TEXT")
    private String executedActionKeysJson = "[]";

    /** 当前会话是否已被归档。 */
    @Column(nullable = false)
    private boolean archived;

    /** 会话归档时间。 */
    @Column(name = "archived_at")
    private LocalDateTime archivedAt;

    /** 会话创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 会话最近更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** 会话最近一条消息的时间。 */
    @Column(name = "last_message_at")
    private LocalDateTime lastMessageAt;

    /**
     * 首次入库前补齐默认时间戳。
     */
    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
        // 不再自动填充 lastMessageAt，保持为 null 表示未使用的会话
    }

    /**
     * 每次更新前刷新更新时间。
     */
    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /**
     * 获取会话主键ID。
     */
    public Long getId() {
        return id;
    }

    /**
     * 设置会话主键ID。
     */
    public void setId(Long id) {
        this.id = id;
    }

    /**
     * 获取会话归属用户。
     */
    public UserEntity getUser() {
        return user;
    }

    /**
     * 设置会话归属用户。
     */
    public void setUser(UserEntity user) {
        this.user = user;
    }

    /**
     * 获取会话标题。
     */
    public String getTitle() {
        return title;
    }

    /**
     * 设置会话标题。
     */
    public void setTitle(String title) {
        this.title = title;
    }

    /**
     * 获取会话标题是否已手动定制。
     */
    public boolean isTitleCustomized() {
        return titleCustomized;
    }

    /**
     * 设置会话标题是否已手动定制。
     */
    public void setTitleCustomized(boolean titleCustomized) {
        this.titleCustomized = titleCustomized;
    }

    /**
     * 获取 Assistant 侧复用的稳定会话标识。
     */
    public String getClientConversationId() {
        return clientConversationId;
    }

    /**
     * 设置 Assistant 侧复用的稳定会话标识。
     */
    public void setClientConversationId(String clientConversationId) {
        this.clientConversationId = clientConversationId;
    }

    /**
     * 获取绑定的路由名称。
     */
    public String getRouteName() {
        return routeName;
    }

    /**
     * 设置绑定的路由名称。
     */
    public void setRouteName(String routeName) {
        this.routeName = routeName;
    }

    public String getRuntimeRegistryCode() { return runtimeRegistryCode; }
    public void setRuntimeRegistryCode(String runtimeRegistryCode) { this.runtimeRegistryCode = runtimeRegistryCode; }
    public Long getRuntimeProfileVersion() { return runtimeProfileVersion; }
    public void setRuntimeProfileVersion(Long runtimeProfileVersion) { this.runtimeProfileVersion = runtimeProfileVersion; }
    public String getRuntimeContextProfileSnapshotJson() { return runtimeContextProfileSnapshotJson; }
    public void setRuntimeContextProfileSnapshotJson(String runtimeContextProfileSnapshotJson) { this.runtimeContextProfileSnapshotJson = runtimeContextProfileSnapshotJson; }
    public String getExternalMcpSnapshotCiphertext() { return externalMcpSnapshotCiphertext; }
    public void setExternalMcpSnapshotCiphertext(String externalMcpSnapshotCiphertext) { this.externalMcpSnapshotCiphertext = externalMcpSnapshotCiphertext; }
    public String getContextSummary() { return contextSummary; }
    public void setContextSummary(String contextSummary) { this.contextSummary = contextSummary; }
    public String getContextFactsJson() { return contextFactsJson; }
    public void setContextFactsJson(String contextFactsJson) { this.contextFactsJson = contextFactsJson; }
    public String getPendingClarificationJson() { return pendingClarificationJson; }
    public void setPendingClarificationJson(String pendingClarificationJson) { this.pendingClarificationJson = pendingClarificationJson; }
    public Long getSummaryThroughMessageId() { return summaryThroughMessageId; }
    public void setSummaryThroughMessageId(Long summaryThroughMessageId) { this.summaryThroughMessageId = summaryThroughMessageId; }
    public Long getContextVersion() { return contextVersion; }
    public void setContextVersion(Long contextVersion) { this.contextVersion = contextVersion; }
    public Integer getEstimatedContextTokens() { return estimatedContextTokens; }
    public void setEstimatedContextTokens(Integer estimatedContextTokens) { this.estimatedContextTokens = estimatedContextTokens; }

    /**
     * 获取绑定的项目ID。
     */
    public Long getProjectId() {
        return projectId;
    }

    /**
     * 设置绑定的项目ID。
     */
    public void setProjectId(Long projectId) {
        this.projectId = projectId;
    }

    /**
     * 获取绑定的任务ID。
     */
    public Long getTaskId() {
        return taskId;
    }

    /**
     * 设置绑定的任务ID。
     */
    public void setTaskId(Long taskId) {
        this.taskId = taskId;
    }

    /**
     * 获取绑定的迭代ID。
     */
    public Long getIterationId() {
        return iterationId;
    }

    /**
     * 设置绑定的迭代ID。
     */
    public void setIterationId(Long iterationId) {
        this.iterationId = iterationId;
    }

    /**
     * 获取绑定的测试计划ID。
     */
    public Long getPlanId() {
        return planId;
    }

    /**
     * 设置绑定的测试计划ID。
     */
    public void setPlanId(Long planId) {
        this.planId = planId;
    }

    /**
     * 获取绑定的 Wiki 空间ID。
     */
    public Long getWikiSpaceId() {
        return wikiSpaceId;
    }

    /**
     * 设置绑定的 Wiki 空间ID。
     */
    public void setWikiSpaceId(Long wikiSpaceId) {
        this.wikiSpaceId = wikiSpaceId;
    }

    /**
     * 获取绑定的 Wiki 页面ID。
     */
    public Long getWikiPageId() {
        return wikiPageId;
    }

    /**
     * 设置绑定的 Wiki 页面ID。
     */
    public void setWikiPageId(Long wikiPageId) {
        this.wikiPageId = wikiPageId;
    }

    /**
     * 获取最近一条摘要预览。
     */
    public String getLatestPreview() {
        return latestPreview;
    }

    /**
     * 设置最近一条摘要预览。
     */
    public void setLatestPreview(String latestPreview) {
        this.latestPreview = latestPreview;
    }

    /**
     * 获取最新展示态快照JSON。
     */
    public String getLatestDisplayStateJson() {
        return latestDisplayStateJson;
    }

    /**
     * 设置最新展示态快照JSON。
     */
    public void setLatestDisplayStateJson(String latestDisplayStateJson) {
        this.latestDisplayStateJson = latestDisplayStateJson;
    }

    /**
     * 获取已执行动作 key 列表的 JSON 文本。
     */
    public String getExecutedActionKeysJson() {
        return executedActionKeysJson;
    }

    /**
     * 设置已执行动作 key 列表的 JSON 文本。
     */
    public void setExecutedActionKeysJson(String executedActionKeysJson) {
        this.executedActionKeysJson = executedActionKeysJson;
    }

    /**
     * 获取当前会话是否已归档。
     */
    public boolean isArchived() {
        return archived;
    }

    /**
     * 设置当前会话是否已归档。
     */
    public void setArchived(boolean archived) {
        this.archived = archived;
    }

    /**
     * 获取归档时间。
     */
    public LocalDateTime getArchivedAt() {
        return archivedAt;
    }

    /**
     * 设置归档时间。
     */
    public void setArchivedAt(LocalDateTime archivedAt) {
        this.archivedAt = archivedAt;
    }

    /**
     * 获取创建时间。
     */
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    /**
     * 设置创建时间。
     */
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    /**
     * 获取更新时间。
     */
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    /**
     * 设置更新时间。
     */
    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    /**
     * 获取最近消息时间。
     */
    public LocalDateTime getLastMessageAt() {
        return lastMessageAt;
    }

    /**
     * 设置最近消息时间。
     */
    public void setLastMessageAt(LocalDateTime lastMessageAt) {
        this.lastMessageAt = lastMessageAt;
    }
}
