package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ExecutionTaskRepository extends JpaRepository<ExecutionTaskEntity, Long>, JpaSpecificationExecutor<ExecutionTaskEntity> {

    List<ExecutionTaskEntity> findTop10ByStatusOrderByCreatedAtAscIdAsc(String status);

    /**
     * 直接读取取消标记，避免长事务内命中一级缓存导致看不到最新取消状态。
     */
    @Query("select task.cancelRequested from ExecutionTaskEntity task where task.id = :id")
    Boolean findCancelRequestedFlagById(@Param("id") Long id);
}
