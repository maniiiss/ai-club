package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatRoomAgentToolPolicyEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ChatRoomAgentToolPolicyRepository extends JpaRepository<ChatRoomAgentToolPolicyEntity, Long> {

    List<ChatRoomAgentToolPolicyEntity> findByRoom_IdOrderByToolCodeAsc(Long roomId);

    Optional<ChatRoomAgentToolPolicyEntity> findByRoom_IdAndToolCode(Long roomId, String toolCode);
}
