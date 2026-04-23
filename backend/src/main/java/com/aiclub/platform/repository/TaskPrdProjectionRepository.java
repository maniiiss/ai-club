package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskPrdProjectionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 需求工作项 PRD 投影仓储。
 */
public interface TaskPrdProjectionRepository extends JpaRepository<TaskPrdProjectionEntity, Long> {

    /**
     * 按工作项读取 PRD 投影。
     */
    Optional<TaskPrdProjectionEntity> findByTask_Id(Long taskId);

    /**
     * 批量读取工作项投影，供任务列表回显扩展状态。
     */
    List<TaskPrdProjectionEntity> findAllByTask_IdIn(Collection<Long> taskIds);
}
