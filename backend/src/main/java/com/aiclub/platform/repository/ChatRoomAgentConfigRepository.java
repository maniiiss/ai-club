package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatRoomAgentConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface ChatRoomAgentConfigRepository extends JpaRepository<ChatRoomAgentConfigEntity, Long> {

    Optional<ChatRoomAgentConfigEntity> findByRoom_Id(Long roomId);

    List<ChatRoomAgentConfigEntity> findByEnabledTrueAndTaskStatusCallbackEnabledTrueAndRoom_Project_Id(Long projectId);
}
