package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, Long> {

    List<ChatMessageEntity> findByRoom_IdOrderByCreatedAtAscIdAsc(Long roomId);

    List<ChatMessageEntity> findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(Long roomId);
}
