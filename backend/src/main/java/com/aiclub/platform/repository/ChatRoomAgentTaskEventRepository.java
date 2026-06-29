package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatRoomAgentTaskEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatRoomAgentTaskEventRepository extends JpaRepository<ChatRoomAgentTaskEventEntity, Long> {

    List<ChatRoomAgentTaskEventEntity> findByTask_IdOrderByCreatedAtAscIdAsc(Long taskId);
}
