package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ChatMessageAttachmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatMessageAttachmentRepository extends JpaRepository<ChatMessageAttachmentEntity, Long> {

    List<ChatMessageAttachmentEntity> findAllByMessage_IdIn(List<Long> messageIds);

    List<ChatMessageAttachmentEntity> findAllByMessage_Room_IdOrderByCreatedAtDescIdDesc(Long roomId);
}
