package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.UserDashboardQuickTaskEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 负责读取和持久化当前用户的首页快捷任务。
 */
public interface UserDashboardQuickTaskRepository extends JpaRepository<UserDashboardQuickTaskEntity, Long> {

    /**
     * 按展示顺序读取某个用户的全部快捷任务。
     */
    List<UserDashboardQuickTaskEntity> findAllByUser_IdOrderBySortOrderAscIdAsc(Long userId);
}
