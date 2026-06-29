package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatRoomEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatRoomRepository extends JpaRepository<ChatRoomEntity, Long> {

    List<ChatRoomEntity> findByArchivedFalseOrderByLastMessageAtDescUpdatedAtDescIdDesc();
}
