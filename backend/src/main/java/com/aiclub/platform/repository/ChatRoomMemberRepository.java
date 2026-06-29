package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatRoomMemberEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatRoomMemberRepository extends JpaRepository<ChatRoomMemberEntity, Long> {

    boolean existsByRoom_IdAndUser_Id(Long roomId, Long userId);

    List<ChatRoomMemberEntity> findByRoom_IdOrderByIdAsc(Long roomId);

    void deleteByRoom_Id(Long roomId);
}
