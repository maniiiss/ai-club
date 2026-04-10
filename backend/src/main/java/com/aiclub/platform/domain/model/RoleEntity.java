package com.aiclub.platform.domain.model;

import com.aiclub.platform.common.DataPermissionScopeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;

import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "role_info")
public class RoleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 100)
    private String code;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(nullable = false)
    private boolean builtIn = false;

    @Column(nullable = false, length = 500)
    private String description = "";

    /**
     * 项目可见范围。
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "project_visibility_scope", nullable = false, length = 30)
    private DataPermissionScopeType projectVisibilityScope = DataPermissionScopeType.PROJECT_PARTICIPANT;

    /**
     * 项目维护范围。
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "project_manage_scope", nullable = false, length = 30)
    private DataPermissionScopeType projectManageScope = DataPermissionScopeType.OWNER_OR_CREATOR;

    /**
     * 迭代删除范围。
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "iteration_delete_scope", nullable = false, length = 30)
    private DataPermissionScopeType iterationDeleteScope = DataPermissionScopeType.CREATOR_ONLY;

    /**
     * 工作项删除范围。
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "task_delete_scope", nullable = false, length = 30)
    private DataPermissionScopeType taskDeleteScope = DataPermissionScopeType.CREATOR_ONLY;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "role_permission_rel",
            joinColumns = @JoinColumn(name = "role_id"),
            inverseJoinColumns = @JoinColumn(name = "permission_id")
    )
    private Set<PermissionEntity> permissions = new LinkedHashSet<>();

    public RoleEntity() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public DataPermissionScopeType getProjectVisibilityScope() {
        return projectVisibilityScope;
    }

    public void setProjectVisibilityScope(DataPermissionScopeType projectVisibilityScope) {
        this.projectVisibilityScope = projectVisibilityScope;
    }

    public DataPermissionScopeType getProjectManageScope() {
        return projectManageScope;
    }

    public void setProjectManageScope(DataPermissionScopeType projectManageScope) {
        this.projectManageScope = projectManageScope;
    }

    public DataPermissionScopeType getIterationDeleteScope() {
        return iterationDeleteScope;
    }

    public void setIterationDeleteScope(DataPermissionScopeType iterationDeleteScope) {
        this.iterationDeleteScope = iterationDeleteScope;
    }

    public DataPermissionScopeType getTaskDeleteScope() {
        return taskDeleteScope;
    }

    public void setTaskDeleteScope(DataPermissionScopeType taskDeleteScope) {
        this.taskDeleteScope = taskDeleteScope;
    }

    public Set<PermissionEntity> getPermissions() {
        return permissions;
    }

    public void setPermissions(Set<PermissionEntity> permissions) {
        this.permissions = permissions;
    }
}
