package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.NotificationMessageEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.NotificationMessageRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖通知服务的持久化字段归一化规则，避免调用方传入长业务码时触发数据库长度异常。
 */
@ExtendWith(MockitoExtension.class)
class NotificationServiceTests {

    @Mock
    private NotificationMessageRepository notificationMessageRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private NotificationPushService notificationPushService;

    private NotificationService notificationService;

    @BeforeEach
    void setUp() {
        notificationService = new NotificationService(notificationMessageRepository, userRepository, notificationPushService);
    }

    /**
     * biz_type / type / action_url 等字段由消息中心统一裁剪，执行调度层不需要感知数据库列长度细节。
     */
    @Test
    void shouldLimitNotificationFieldsBeforeSaving() {
        UserEntity recipient = new UserEntity();
        recipient.setId(7L);
        recipient.setUsername("receiver");
        recipient.setNickname("接收人");
        recipient.setEnabled(true);

        when(userRepository.findById(7L)).thenReturn(Optional.of(recipient));
        when(notificationMessageRepository.save(any(NotificationMessageEntity.class))).thenAnswer(invocation -> {
            NotificationMessageEntity entity = invocation.getArgument(0);
            entity.setId(99L);
            return entity;
        });
        when(notificationMessageRepository.countByRecipientUser_IdAndReadFlagFalse(7L)).thenReturn(1L);

        notificationService.sendToUser(
                7L,
                "CUSTOM_NOTIFICATION_TYPE_THAT_IS_TOO_LONG",
                "INFO",
                "标题",
                "内容",
                "https://example.test/" + "a".repeat(400),
                "DEVELOPMENT_EXECUTION_PLAN_CONFIRMATION_REQUIRED",
                123L
        );

        ArgumentCaptor<NotificationMessageEntity> captor = ArgumentCaptor.forClass(NotificationMessageEntity.class);
        verify(notificationMessageRepository).save(captor.capture());
        NotificationMessageEntity saved = captor.getValue();
        assertThat(saved.getType()).hasSize(30);
        assertThat(saved.getBizType()).hasSize(40);
        assertThat(saved.getActionUrl()).hasSize(300);
    }
}
