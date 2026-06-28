package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.ChatRoomSummary;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.request.CreateChatRoomRequest;
import com.aiclub.platform.dto.request.SendChatMessageRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomMembersRequest;
import com.aiclub.platform.domain.model.ChatRoomMemberEntity;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomMemberRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

/**
 * 覆盖聊天室服务的核心权限和消息落库规则。
 */
@ExtendWith(MockitoExtension.class)
class ChatRoomServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private ChatRoomMemberRepository chatRoomMemberRepository;

    @Mock
    private ChatMessageRepository chatMessageRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private ChatWebSocketPushService chatWebSocketPushService;

    @Mock
    private ChatHermesService chatHermesService;

    @Mock
    private ChatRoomAgentService chatRoomAgentService;

    @Test
    void shouldCreateProjectRoomVisibleToProjectParticipants() {
        ChatRoomService service = buildService();
        CurrentUserInfo currentUser = currentUser(5L);
        UserEntity creator = user(5L, "creator", "创建人");
        ProjectEntity project = project(12L, "支付项目");

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(creator));
        when(projectRepository.findById(12L)).thenReturn(Optional.of(project));
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> {
            ChatRoomEntity entity = invocation.getArgument(0);
            entity.setId(21L);
            return entity;
        });

        ChatRoomSummary summary = service.createRoom(new CreateChatRoomRequest("项目战情室", 12L, List.of()));

        ArgumentCaptor<ChatRoomEntity> roomCaptor = ArgumentCaptor.forClass(ChatRoomEntity.class);
        verify(projectDataPermissionService).requireProjectVisible(project);
        verify(chatRoomRepository).save(roomCaptor.capture());
        assertThat(roomCaptor.getValue().getProject()).isSameAs(project);
        assertThat(roomCaptor.getValue().getVisibilityType()).isEqualTo("PROJECT");
        assertThat(summary.id()).isEqualTo(21L);
        assertThat(summary.projectId()).isEqualTo(12L);
    }

    @Test
    void shouldCreateGlobalRoomWithInvitedMembersOnly() {
        ChatRoomService service = buildService();
        CurrentUserInfo currentUser = currentUser(5L);
        UserEntity creator = user(5L, "creator", "创建人");
        UserEntity invited = user(8L, "qa", "测试");

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(creator));
        when(userRepository.findAllById(any())).thenReturn(List.of(invited, creator));
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> {
            ChatRoomEntity entity = invocation.getArgument(0);
            entity.setId(31L);
            return entity;
        });

        ChatRoomSummary summary = service.createRoom(new CreateChatRoomRequest("发布讨论", null, List.of(8L)));

        assertThat(summary.id()).isEqualTo(31L);
        assertThat(summary.visibilityType()).isEqualTo("GLOBAL_INVITE");
        verify(chatRoomMemberRepository).saveAll(any());
    }

    @Test
    void shouldUpdateProjectRoomExtraMembers() {
        ChatRoomService service = buildService();
        CurrentUserInfo currentUser = currentUser(5L);
        UserEntity creator = user(5L, "creator", "创建人");
        UserEntity projectMember = user(6L, "pm", "项目成员");
        UserEntity invited = user(8L, "qa", "测试");
        ProjectEntity project = project(12L, "支付项目");
        ChatRoomEntity room = room(41L, creator, project);

        when(authService.currentUser()).thenReturn(currentUser);
        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(projectDataPermissionService.isProjectVisible(project)).thenReturn(true);
        when(userRepository.findAllById(any())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Iterable<Long> ids = invocation.getArgument(0);
            java.util.LinkedHashSet<Long> idSet = new java.util.LinkedHashSet<>();
            ids.forEach(idSet::add);
            if (idSet.contains(8L)) {
                return List.of(invited);
            }
            if (idSet.contains(6L)) {
                return List.of(projectMember);
            }
            return List.of();
        });
        when(projectDataPermissionService.resolveParticipantUserIds(project)).thenReturn(Set.of(6L));
        when(chatRoomMemberRepository.findByRoom_IdOrderByIdAsc(41L)).thenReturn(List.of(member(room, invited, "MEMBER")));

        ChatRoomSummary summary = service.updateMembers(41L, new UpdateChatRoomMembersRequest(List.of(8L)));

        assertThat(summary.members()).extracting("userId").containsExactly(6L, 8L);
        verify(chatRoomMemberRepository).deleteByRoom_Id(41L);
        verify(chatRoomMemberRepository).saveAll(any());
        verify(chatWebSocketPushService).broadcastRoomUpdated(eq(41L), any(ChatRoomSummary.class));
    }

    @Test
    void shouldAllowRoomMemberToAppendInvitedMembers() {
        ChatRoomService service = buildService();
        CurrentUserInfo currentUser = currentUser(8L);
        UserEntity creator = user(5L, "creator", "创建人");
        UserEntity member = user(8L, "qa", "测试");
        UserEntity newcomer = user(9L, "dev", "开发");
        ChatRoomEntity room = room(51L, creator, null);

        when(authService.currentUser()).thenReturn(currentUser);
        when(chatRoomRepository.findById(51L)).thenReturn(Optional.of(room));
        when(chatRoomMemberRepository.existsByRoom_IdAndUser_Id(51L, 8L)).thenReturn(true);
        when(chatRoomMemberRepository.findByRoom_IdOrderByIdAsc(51L))
                .thenReturn(List.of(
                        member(room, creator, "OWNER"),
                        member(room, member, "MEMBER")
                ))
                .thenReturn(List.of(
                        member(room, creator, "OWNER"),
                        member(room, member, "MEMBER"),
                        member(room, newcomer, "MEMBER")
                ));
        when(userRepository.findAllById(any())).thenReturn(List.of(creator, member, newcomer));

        ChatRoomSummary summary = service.updateMembers(51L, new UpdateChatRoomMembersRequest(List.of(5L, 8L, 9L)));

        assertThat(summary.members()).extracting("userId").containsExactly(5L, 8L, 9L);
        verify(chatRoomMemberRepository).saveAll(any());
    }

    @Test
    void shouldRejectRoomMemberRemovingExistingMembers() {
        ChatRoomService service = buildService();
        CurrentUserInfo currentUser = currentUser(8L);
        UserEntity creator = user(5L, "creator", "创建人");
        UserEntity member = user(8L, "qa", "测试");
        UserEntity removable = user(9L, "dev", "开发");
        ChatRoomEntity room = room(52L, creator, null);

        when(authService.currentUser()).thenReturn(currentUser);
        when(chatRoomRepository.findById(52L)).thenReturn(Optional.of(room));
        when(chatRoomMemberRepository.existsByRoom_IdAndUser_Id(52L, 8L)).thenReturn(true);
        when(chatRoomMemberRepository.findByRoom_IdOrderByIdAsc(52L)).thenReturn(List.of(
                member(room, creator, "OWNER"),
                member(room, member, "MEMBER"),
                member(room, removable, "MEMBER")
        ));

        assertThatThrownBy(() -> service.updateMembers(52L, new UpdateChatRoomMembersRequest(List.of(5L, 8L))))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("只有群主可以移除成员");
    }

    @Test
    void shouldRejectGlobalRoomWithoutInvitedMembers() {
        ChatRoomService service = buildService();
        when(authService.currentUser()).thenReturn(currentUser(5L));
        when(userRepository.findById(5L)).thenReturn(Optional.of(user(5L, "creator", "创建人")));

        assertThatThrownBy(() -> service.createRoom(new CreateChatRoomRequest("空房间", null, List.of())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("至少邀请一名成员");
    }

    @Test
    void shouldPersistUserMessageAndCreateAgentTaskWhenMentioned() {
        ChatRoomService service = buildService();
        CurrentUserInfo currentUser = currentUser(5L);
        UserEntity creator = user(5L, "creator", "创建人");
        ChatRoomEntity room = room(41L, creator, null);

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(creator));
        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> {
            ChatMessageEntity entity = invocation.getArgument(0);
            if (entity.getId() == null) {
                entity.setId("assistant".equals(entity.getRole()) ? 102L : 101L);
            }
            return entity;
        });
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChatMessageSummary message = service.sendMessage(41L, new SendChatMessageRequest("@hermes 汇总一下", List.of()));

        assertThat(message.id()).isEqualTo(101L);
        assertThat(message.mentionsHermes()).isTrue();
        verify(chatWebSocketPushService, times(2)).broadcastMessageCreated(eq(41L), any(ChatMessageSummary.class));
        verify(chatRoomAgentService).createMentionTask(eq(41L), eq(102L), eq(101L), eq(5L));
    }

    private ChatRoomService buildService() {
        return new ChatRoomService(
                authService,
                userRepository,
                projectRepository,
                chatRoomRepository,
                chatRoomMemberRepository,
                chatMessageRepository,
                projectDataPermissionService,
                chatWebSocketPushService,
                chatHermesService,
                chatRoomAgentService
        );
    }

    private CurrentUserInfo currentUser(Long id) {
        return new CurrentUserInfo(id, "user-" + id, "用户" + id, "", "", "", "", true, List.of(), List.of(), List.of("chat:view", "chat:manage", "hermes:chat"));
    }

    private UserEntity user(Long id, String username, String nickname) {
        UserEntity entity = new UserEntity();
        entity.setId(id);
        entity.setUsername(username);
        entity.setNickname(nickname);
        entity.setPasswordHash("hash");
        entity.setEnabled(true);
        return entity;
    }

    private ProjectEntity project(Long id, String name) {
        ProjectEntity entity = new ProjectEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setOwner("owner");
        entity.setStatus("进行中");
        entity.setDescription("");
        return entity;
    }

    private ChatRoomEntity room(Long id, UserEntity creator, ProjectEntity project) {
        ChatRoomEntity entity = new ChatRoomEntity();
        entity.setId(id);
        entity.setTitle("发布讨论");
        entity.setCreatorUser(creator);
        entity.setProject(project);
        entity.setVisibilityType(project == null ? "GLOBAL_INVITE" : "PROJECT");
        return entity;
    }

    private ChatRoomMemberEntity member(ChatRoomEntity room, UserEntity user, String role) {
        ChatRoomMemberEntity entity = new ChatRoomMemberEntity();
        entity.setRoom(room);
        entity.setUser(user);
        entity.setRole(role);
        return entity;
    }
}
