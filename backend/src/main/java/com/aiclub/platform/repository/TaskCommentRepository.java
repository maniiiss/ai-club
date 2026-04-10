package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskCommentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TaskCommentRepository extends JpaRepository<TaskCommentEntity, Long> {

    List<TaskCommentEntity> findAllByTask_IdOrderByCreatedAtAscIdAsc(Long taskId);
}
