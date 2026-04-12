package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.UserFeedbackEntity;
import com.aiclub.platform.dto.request.CreateFeedbackRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.UserFeedbackRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 覆盖反馈提交的核心集成场景，确保登录态、校验规则与入库快照符合预期。
 */
@SpringBootTest
@Transactional
class FeedbackServiceIntegrationTests {

    @Autowired
    private FeedbackService feedbackService;

    @Autowired
    private UserFeedbackRepository userFeedbackRepository;

    @Autowired
    private Validator validator;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 合法反馈应成功写入数据库，并保留提交时的用户信息快照。
     */
    @Test
    void shouldPersistFeedbackWithCurrentUserSnapshot() {
        loginAs(101L, "feedback-user", "反馈用户");

        feedbackService.createFeedback(new CreateFeedbackRequest(
                "SUGGESTION",
                "建议优化顶部入口",
                "希望在右上角用户菜单里增加反馈入口，方便快速提交建议。"
        ));

        assertThat(userFeedbackRepository.findAll()).hasSize(1);
        UserFeedbackEntity feedback = userFeedbackRepository.findAll().get(0);
        assertThat(feedback.getFeedbackType()).isEqualTo("SUGGESTION");
        assertThat(feedback.getTitle()).isEqualTo("建议优化顶部入口");
        assertThat(feedback.getContent()).isEqualTo("希望在右上角用户菜单里增加反馈入口，方便快速提交建议。");
        assertThat(feedback.getSubmitterUserId()).isEqualTo(101L);
        assertThat(feedback.getSubmitterUsername()).isEqualTo("feedback-user");
        assertThat(feedback.getSubmitterNickname()).isEqualTo("反馈用户");
        assertThat(feedback.getCreatedAt()).isNotNull();
    }

    /**
     * 未登录时提交反馈应直接拒绝，避免匿名数据混入业务库。
     */
    @Test
    void shouldRejectFeedbackWhenCurrentUserMissing() {
        AuthContextHolder.clear();

        assertThatThrownBy(() -> feedbackService.createFeedback(new CreateFeedbackRequest(
                "BUG",
                "页面报错",
                "点击反馈入口后页面出现空白。"
        )))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Not logged in");
    }

    /**
     * 类型非法时应命中请求校验规则，阻止后续业务处理。
     */
    @Test
    void shouldRejectInvalidFeedbackType() {
        Set<ConstraintViolation<CreateFeedbackRequest>> violations = validator.validate(new CreateFeedbackRequest(
                "INVALID",
                "非法类型",
                "这是一条带有非法类型的反馈。"
        ));

        assertThat(violations)
                .extracting(ConstraintViolation::getMessage)
                .contains("反馈类型不合法");
    }

    /**
     * 标题为空或超长时都应返回明确校验提示。
     */
    @Test
    void shouldRejectBlankOrTooLongTitle() {
        Set<ConstraintViolation<CreateFeedbackRequest>> blankTitleViolations = validator.validate(new CreateFeedbackRequest(
                "BUG",
                "   ",
                "标题为空时不应通过校验。"
        ));
        Set<ConstraintViolation<CreateFeedbackRequest>> tooLongTitleViolations = validator.validate(new CreateFeedbackRequest(
                "BUG",
                "T".repeat(101),
                "标题超长时不应通过校验。"
        ));

        assertThat(blankTitleViolations)
                .extracting(ConstraintViolation::getMessage)
                .contains("请输入反馈标题");
        assertThat(tooLongTitleViolations)
                .extracting(ConstraintViolation::getMessage)
                .contains("反馈标题长度不能超过100");
    }

    /**
     * 内容为空或超长时都应命中长度与必填校验。
     */
    @Test
    void shouldRejectBlankOrTooLongContent() {
        Set<ConstraintViolation<CreateFeedbackRequest>> blankContentViolations = validator.validate(new CreateFeedbackRequest(
                "EXPERIENCE",
                "体验反馈",
                "   "
        ));
        Set<ConstraintViolation<CreateFeedbackRequest>> tooLongContentViolations = validator.validate(new CreateFeedbackRequest(
                "EXPERIENCE",
                "体验反馈",
                "C".repeat(2001)
        ));

        assertThat(blankContentViolations)
                .extracting(ConstraintViolation::getMessage)
                .contains("请输入反馈内容");
        assertThat(tooLongContentViolations)
                .extracting(ConstraintViolation::getMessage)
                .contains("反馈内容长度不能超过2000");
    }

    /**
     * 为测试场景注入一个最小可用的登录态上下文。
     */
    private void loginAs(Long userId, String username, String nickname) {
        AuthContextHolder.set(new AuthContext(userId, username, nickname, Set.of(), Set.of()));
    }
}
