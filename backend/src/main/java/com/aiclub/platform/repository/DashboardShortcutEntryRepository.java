package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DashboardShortcutEntryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 负责首页快捷入口的持久化读写。
 */
public interface DashboardShortcutEntryRepository extends JpaRepository<DashboardShortcutEntryEntity, Long> {

    /**
     * 读取全部系统级入口，供首页聚合和管理后台复用。
     */
    List<DashboardShortcutEntryEntity> findAllByScopeTypeOrderBySortOrderAscIdAsc(String scopeType);

    /**
     * 读取某个用户的全部个人入口。
     */
    List<DashboardShortcutEntryEntity> findAllByScopeTypeAndOwnerUser_IdOrderBySortOrderAscIdAsc(String scopeType, Long ownerUserId);
}
