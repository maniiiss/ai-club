package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskAttachmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskAttachmentRepository extends JpaRepository<TaskAttachmentEntity, Long> {

    List<TaskAttachmentEntity> findAllByTask_IdOrderByCreatedAtAscIdAsc(Long taskId);

    Optional<TaskAttachmentEntity> findByIdAndTask_Id(Long id, Long taskId);
}
