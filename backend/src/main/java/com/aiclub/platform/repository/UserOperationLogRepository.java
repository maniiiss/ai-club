package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.UserOperationLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * 用户操作日志仓库。
 */
public interface UserOperationLogRepository extends JpaRepository<UserOperationLogEntity, Long>, JpaSpecificationExecutor<UserOperationLogEntity> {
}
