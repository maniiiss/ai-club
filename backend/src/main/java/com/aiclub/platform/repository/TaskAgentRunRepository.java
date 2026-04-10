package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.TaskAgentRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TaskAgentRunRepository extends JpaRepository<TaskAgentRunEntity, Long> {

    List<TaskAgentRunEntity> findTop10ByTask_IdOrderByCreatedAtDescIdDesc(Long taskId);
}
