package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesChatAuditEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesChatResponse;
import com.aiclub.platform.dto.HermesToolContext;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.repository.HermesChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Hermes 聊天服务会按“用户 + 项目”生成范围键，并在成功结束后落审计摘要。
 */
@ExtendWith(MockitoExtension.class)
class HermesChatServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private HermesContextAssembler hermesContextAssembler;

    @Mock
    private HermesPromptBuilder hermesPromptBuilder;

    @Mock
    private HermesGatewayService hermesGatewayService;

    @Mock
    private HermesActionPlannerService hermesActionPlannerService;

    @Mock
    private HermesToolOrchestrator hermesToolOrchestrator;

    @Mock
    private HermesChatAuditRepository hermesChatAuditRepository;

    /**
     * 成功流式问答时，应使用项目级范围键，并将最终回答摘要写回审计日志。
     */
    @Test
    void shouldUseProjectScopedSessionKeyAndPersistSuccessAudit() throws Exception {
        HermesProperties hermesProperties = new HermesProperties(
                "http://localhost:18080/v1",
                "",
                "hermes-agent",
                60,
                "test:hermes",
                4
        );
        HermesChatService hermesChatService = new HermesChatService(
                authService,
                userRepository,
                hermesProperties,
                hermesContextAssembler,
                hermesPromptBuilder,
                hermesGatewayService,
                hermesActionPlannerService,
                hermesToolOrchestrator,
                hermesChatAuditRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUserInfo = new CurrentUserInfo(
                5L,
                "pm-user",
                "项目经理",
                "",
                "",
                "",
                "",
                true,
                List.of("PM"),
                List.of("项目经理"),
                List.of("hermes:chat")
        );
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");

        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of("这个项目当前最大的阻塞是什么"),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("系统提示词", "用户提示词");

        when(authService.currentUser()).thenReturn(currentUserInfo);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUserInfo))).thenReturn(context);
        when(hermesPromptBuilder.build(eq(currentUserInfo), eq(context), any(), any())).thenReturn(prompt);
        when(hermesActionPlannerService.planActions(any(), eq(context))).thenReturn(List.of());
        when(hermesToolOrchestrator.planAndRunReadTools(any(), eq(context), eq("test:hermes:project:12:user:5:conversation:test-conversation")))
                .thenReturn(new HermesToolContext(List.of(), List.of(), ""));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(hermesGatewayService.streamChat(eq("test:hermes:project:12:user:5:conversation:test-conversation"), eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-1", "完整回答内容"));

        HermesChatResponse response = hermesChatService.chat(new HermesChatRequest(
                "这个项目当前最大的阻塞是什么",
                "project-iterations",
                12L,
                null,
                null,
                null,
                "test-conversation"
        ));

        verify(hermesGatewayService, timeout(1000)).streamChat(eq("test:hermes:project:12:user:5:conversation:test-conversation"), eq(prompt), any());
        ArgumentCaptor<HermesChatAuditEntity> auditCaptor = ArgumentCaptor.forClass(HermesChatAuditEntity.class);
        verify(hermesChatAuditRepository, timeout(1000).atLeast(2)).save(auditCaptor.capture());

        HermesChatAuditEntity latestAudit = auditCaptor.getAllValues().get(auditCaptor.getAllValues().size() - 1);
        assertThat(latestAudit.getStatus()).isEqualTo("SUCCESS");
        assertThat(latestAudit.getScopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:test-conversation");
        assertThat(latestAudit.getResponseSummary()).contains("完整回答内容");
        assertThat(latestAudit.getHermesResponseId()).isEqualTo("resp-1");
        assertThat(response.scopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:test-conversation");
        assertThat(response.content()).isEqualTo("完整回答内容");
    }
}
