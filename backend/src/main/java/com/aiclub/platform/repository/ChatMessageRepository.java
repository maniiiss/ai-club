package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, Long> {

    List<ChatMessageEntity> findByRoom_IdOrderByCreatedAtAscIdAsc(Long roomId);

    List<ChatMessageEntity> findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(Long roomId);

    @Query("""
            select count(message)
            from ChatMessageEntity message
            where message.room.id = :roomId
              and (:afterId is null or message.id > :afterId)
              and message.role = 'user'
            """)
    long countUserMessagesAfter(@Param("roomId") Long roomId, @Param("afterId") Long afterId);
}
