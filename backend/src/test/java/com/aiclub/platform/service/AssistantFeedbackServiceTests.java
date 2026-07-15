package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantConversationMessageEntity;
import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.domain.model.AssistantMessageFeedbackEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.request.AssistantFeedbackResolutionRequest;
import com.aiclub.platform.dto.request.AssistantFeedbackTriageRequest;
import com.aiclub.platform.dto.request.AssistantMessageFeedbackRequest;
import com.aiclub.platform.repository.AssistantConversationMessageRepository;
import com.aiclub.platform.repository.AssistantConversationSessionRepository;
import com.aiclub.platform.repository.AssistantFeedbackActivityRepository;
import com.aiclub.platform.repository.AssistantMessageFeedbackRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * 验证 GitPilot 单条回答反馈的归属校验、幂等更新和运营状态流转。
 */
@ExtendWith(MockitoExtension.class)
class AssistantFeedbackServiceTests {

    @Mock
    private AssistantMessageFeedbackRepository feedbackRepository;
    @Mock
    private AssistantFeedbackActivityRepository activityRepository;
    @Mock
    private AssistantConversationMessageRepository messageRepository;
    @Mock
    private AssistantConversationSessionRepository sessionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private AssistantConversationSessionService sessionService;
    @Mock
    private AuthService authService;

    private AssistantFeedbackService service;
    private AssistantConversationSessionEntity session;
    private AssistantConversationMessageEntity userMessage;
    private AssistantConversationMessageEntity assistantMessage;

    @BeforeEach
    void setUp() {
        service = new AssistantFeedbackService(feedbackRepository, activityRepository, messageRepository, sessionRepository,
                userRepository, sessionService, authService, new ObjectMapper());
        session = new AssistantConversationSessionEntity();
        session.setId(10L);
        session.setRouteName("projects");
        session.setRuntimeRegistryCode("HERMES_LEGACY");
        session.setProjectId(12L);
        userMessage = new AssistantConversationMessageEntity();
        userMessage.setId(20L);
        userMessage.setRole("user");
        userMessage.setContent("请分析这个项目的风险");
        assistantMessage = new AssistantConversationMessageEntity();
        assistantMessage.setId(21L);
        assistantMessage.setRole("assistant");
        assistantMessage.setContent("当前风险是接口联调时间不足。");
        lenient().when(authService.currentUser()).thenReturn(currentUser());
        lenient().when(sessionService.requireOwnedSession(10L)).thenReturn(session);
        lenient().when(messageRepository.findByIdAndSession_IdAndRole(21L, 10L, "assistant")).thenReturn(Optional.of(assistantMessage));
        lenient().when(messageRepository.findBySession_IdOrderByCreatedAtAscIdAsc(10L)).thenReturn(List.of(userMessage, assistantMessage));
        lenient().when(feedbackRepository.save(any(AssistantMessageFeedbackEntity.class))).thenAnswer(invocation -> {
            AssistantMessageFeedbackEntity entity = invocation.getArgument(0);
            if (entity.getId() == null) entity.setId(91L);
            return entity;
        });
    }

    @Test
    void shouldPersistNegativeFeedbackWithQuestionAndAnswerSnapshots() {
        when(feedbackRepository.findBySubmitterUserIdAndAssistantMessageId(5L, 21L)).thenReturn(Optional.empty());

        var result = service.submit(10L, 21L, new AssistantMessageFeedbackRequest(
                "DOWN", List.of("WRONG_ANSWER", "MISSING_CONTEXT"), "请给出具体证据。"));

        assertThat(result.id()).isEqualTo(91L);
        assertThat(result.status()).isEqualTo("NEW");
        assertThat(result.questionSnapshot()).isEqualTo("请分析这个项目的风险");
        assertThat(result.answerSnapshot()).contains("接口联调");
        assertThat(result.reasonCodes()).containsExactly("WRONG_ANSWER", "MISSING_CONTEXT");
        verify(activityRepository).save(any());
    }

    @Test
    void shouldRequireReasonForNegativeFeedback() {
        assertThatThrownBy(() -> service.submit(10L, 21L, new AssistantMessageFeedbackRequest("DOWN", List.of(), "")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("点踩反馈至少选择一个原因");
    }

    @Test
    void shouldRejectMessageOutsideOwnedSession() {
        when(messageRepository.findByIdAndSession_IdAndRole(999L, 10L, "assistant")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.submit(10L, 999L, new AssistantMessageFeedbackRequest("UP", List.of(), "")))
                .isInstanceOf(java.util.NoSuchElementException.class)
                .hasMessage("GitPilot 助手回答不存在");
    }

    @Test
    void shouldAutoClosePositiveFeedbackAndAllowOverwrite() {
        AssistantMessageFeedbackEntity existing = new AssistantMessageFeedbackEntity();
        existing.setId(91L);
        existing.setStatus("RESOLVED");
        when(feedbackRepository.findBySubmitterUserIdAndAssistantMessageId(5L, 21L)).thenReturn(Optional.of(existing));

        var result = service.submit(10L, 21L, new AssistantMessageFeedbackRequest("UP", List.of(), ""));

        assertThat(result.vote()).isEqualTo("UP");
        assertThat(result.status()).isEqualTo("AUTO_CLOSED");
        assertThat(result.datasetStatus()).isEqualTo("PENDING");
    }

    @Test
    void shouldUpdateTriageAndResolutionWithActivities() {
        AssistantMessageFeedbackEntity existing = new AssistantMessageFeedbackEntity();
        existing.setId(91L);
        existing.setStatus("NEW");
        existing.setDatasetStatus("PENDING");
        when(feedbackRepository.findById(91L)).thenReturn(Optional.of(existing));
        when(userRepository.findById(8L)).thenReturn(Optional.of(new com.aiclub.platform.domain.model.UserEntity()));

        service.triage(91L, new AssistantFeedbackTriageRequest("IN_PROGRESS", 8L, "交给智能体团队复核"));
        var detail = service.resolve(91L, new AssistantFeedbackResolutionRequest(
                "RESOLVED", "PROMPT_FIX", "已补充提示词中的证据要求。", List.of("PROMPT", "GROUNDING"), "INCLUDED"));

        assertThat(detail.feedback().status()).isEqualTo("RESOLVED");
        assertThat(detail.feedback().datasetStatus()).isEqualTo("INCLUDED");
        verify(activityRepository, org.mockito.Mockito.times(2)).save(any());
    }

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(5L, "feedback-user", "反馈用户", "", "", "", "", true,
                List.of(), List.of(), List.of("assistant:chat"), List.of(), "deep-sea");
    }
}
