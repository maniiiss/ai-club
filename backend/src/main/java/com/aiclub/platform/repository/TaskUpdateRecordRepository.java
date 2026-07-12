package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskUpdateRecordEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskUpdateRecordRepository extends JpaRepository<TaskUpdateRecordEntity, Long> {

    Page<TaskUpdateRecordEntity> findAllByTask_Id(Long taskId, Pageable pageable);

    Page<TaskUpdateRecordEntity> findAllByTask_IdAndActionTypeNot(Long taskId, String actionType, Pageable pageable);
}
