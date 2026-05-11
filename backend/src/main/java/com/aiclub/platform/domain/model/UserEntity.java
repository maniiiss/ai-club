package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "user_info")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    @Column(nullable = false, length = 100)
    private String nickname;

    @Column(nullable = false, length = 100)
    private String email = "";

    @Column(nullable = false, length = 30)
    private String phone = "";

    /** 绑定的 GitLab 用户ID，空值表示仅保留历史手填用户名或尚未绑定远端用户。 */
    @Column(name = "gitlab_user_id")
    private Long gitlabUserId;

    /** 绑定的 GitLab 用户登录名，兼容历史手填字段并供通知按用户名反查本地用户。 */
    @Column(name = "gitlab_username", nullable = false, length = 100)
    private String gitlabUsername = "";

    /** 绑定的 GitLab 用户展示名快照，用于用户管理列表和关键字检索。 */
    @Column(name = "gitlab_name", nullable = false, length = 100)
    private String gitlabName = "";

    /** 绑定的 Gitee 企业成员ID，空值表示尚未建立远端成员映射。 */
    @Column(name = "gitee_member_id")
    private Long giteeMemberId;

    /** 绑定的 Gitee 成员登录名快照，用于列表展示和关键字检索。 */
    @Column(name = "gitee_username", nullable = false, length = 100)
    private String giteeUsername = "";

    /** 绑定的 Gitee 成员姓名快照，避免远端成员改名后本地列表无可读展示。 */
    @Column(name = "gitee_name", nullable = false, length = 100)
    private String giteeName = "";

    /** 用户头像访问地址，默认空字符串表示使用前端回退头像。 */
    @Column(name = "avatar_url", nullable = false, length = 255)
    private String avatarUrl = "";

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(nullable = false)
    private boolean builtIn = false;

    @Column
    private LocalDateTime lastLoginAt;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "user_role_rel",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    private Set<RoleEntity> roles = new LinkedHashSet<>();

    public UserEntity() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getGitlabUsername() {
        return gitlabUsername;
    }

    public Long getGitlabUserId() {
        return gitlabUserId;
    }

    public void setGitlabUserId(Long gitlabUserId) {
        this.gitlabUserId = gitlabUserId;
    }

    public void setGitlabUsername(String gitlabUsername) {
        this.gitlabUsername = gitlabUsername;
    }

    public String getGitlabName() {
        return gitlabName;
    }

    public void setGitlabName(String gitlabName) {
        this.gitlabName = gitlabName;
    }

    public Long getGiteeMemberId() {
        return giteeMemberId;
    }

    public void setGiteeMemberId(Long giteeMemberId) {
        this.giteeMemberId = giteeMemberId;
    }

    public String getGiteeUsername() {
        return giteeUsername;
    }

    public void setGiteeUsername(String giteeUsername) {
        this.giteeUsername = giteeUsername;
    }

    public String getGiteeName() {
        return giteeName;
    }

    public void setGiteeName(String giteeName) {
        this.giteeName = giteeName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isBuiltIn() {
        return builtIn;
    }

    public void setBuiltIn(boolean builtIn) {
        this.builtIn = builtIn;
    }

    public LocalDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(LocalDateTime lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public Set<RoleEntity> getRoles() {
        return roles;
    }

    public void setRoles(Set<RoleEntity> roles) {
        this.roles = roles;
    }
}
