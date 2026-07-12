package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskUpdateRecordDetailEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface TaskUpdateRecordDetailRepository extends JpaRepository<TaskUpdateRecordDetailEntity, Long> {

    List<TaskUpdateRecordDetailEntity> findAllByRecord_IdInOrderByIdAsc(Collection<Long> recordIds);
}
