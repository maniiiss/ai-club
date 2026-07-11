package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.OwnerRepoPushLogEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnerRepoPushLogRepository extends JpaRepository<OwnerRepoPushLogEntity, Long> {

    /**
     * 按绑定分页查询推送历史，最新记录在前。
     */
    Page<OwnerRepoPushLogEntity> findByBinding_IdOrderByIdDesc(Long bindingId, Pageable pageable);
}
