package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.UserFeedbackEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 用户反馈数据访问接口。
 */
public interface UserFeedbackRepository extends JpaRepository<UserFeedbackEntity, Long> {
}
