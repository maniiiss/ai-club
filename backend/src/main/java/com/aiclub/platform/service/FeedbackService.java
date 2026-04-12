package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.UserFeedbackEntity;
import com.aiclub.platform.dto.request.CreateFeedbackRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.UserFeedbackRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * 处理用户反馈提交流程。
 */
@Service
@Transactional(readOnly = true)
public class FeedbackService {

    /** 平台允许提交的反馈类型集合。 */
    private static final Set<String> ALLOWED_TYPES = Set.of("BUG", "SUGGESTION", "EXPERIENCE", "OTHER");

    private final UserFeedbackRepository userFeedbackRepository;

    public FeedbackService(UserFeedbackRepository userFeedbackRepository) {
        this.userFeedbackRepository = userFeedbackRepository;
    }

    /**
     * 保存当前登录用户提交的反馈内容。
     */
    @Transactional
    public void createFeedback(CreateFeedbackRequest request) {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));

        String feedbackType = normalizeFeedbackType(request.type());
        UserFeedbackEntity entity = new UserFeedbackEntity();
        entity.setFeedbackType(feedbackType);
        entity.setTitle(request.title().trim());
        entity.setContent(request.content().trim());
        entity.setSubmitterUserId(authContext.userId());
        entity.setSubmitterUsername(authContext.username().trim());
        entity.setSubmitterNickname(resolveNickname(authContext));
        userFeedbackRepository.save(entity);
    }

    /**
     * 双重校验反馈类型，避免绕过控制层校验时写入非法值。
     */
    private String normalizeFeedbackType(String type) {
        String normalizedType = type == null ? "" : type.trim().toUpperCase();
        if (!ALLOWED_TYPES.contains(normalizedType)) {
            throw new IllegalArgumentException("反馈类型不合法");
        }
        return normalizedType;
    }

    /**
     * 优先使用昵称快照；昵称为空时回退到用户名，保证历史记录始终可读。
     */
    private String resolveNickname(AuthContext authContext) {
        String nickname = authContext.nickname() == null ? "" : authContext.nickname().trim();
        if (!nickname.isEmpty()) {
            return nickname;
        }
        return authContext.username().trim();
    }
}
