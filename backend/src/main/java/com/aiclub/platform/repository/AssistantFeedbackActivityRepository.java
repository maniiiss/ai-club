package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantFeedbackActivityEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** GitPilot 反馈活动仓储。 */
public interface AssistantFeedbackActivityRepository extends JpaRepository<AssistantFeedbackActivityEntity, Long> {
    /** 按时间倒序读取反馈处理轨迹。 */
    List<AssistantFeedbackActivityEntity> findAllByFeedbackIdOrderByCreatedAtDescIdDesc(Long feedbackId);
}
