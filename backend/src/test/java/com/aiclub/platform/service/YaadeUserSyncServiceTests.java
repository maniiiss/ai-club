package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.PlatformYaadeProjectBindingEntity;
import com.aiclub.platform.domain.model.PlatformYaadeUserBindingEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.PlatformYaadeProjectBindingRepository;
import com.aiclub.platform.repository.PlatformYaadeUserBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class YaadeUserSyncServiceTests {

    @Mock
    private UserRepository userRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private PlatformYaadeProjectBindingRepository projectBindingRepository;

    @Mock
    private PlatformYaadeUserBindingRepository userBindingRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private YaadeClientService yaadeClientService;

    @Mock
    private TokenCipherService tokenCipherService;

    private YaadeUserSyncService yaadeUserSyncService;

    @BeforeEach
    void setUp() {
        yaadeUserSyncService = new YaadeUserSyncService(
                userRepository,
                projectRepository,
                projectBindingRepository,
                userBindingRepository,
                projectDataPermissionService,
                yaadeClientService,
                new YaadeProperties(
                        "http://localhost:9339/api/yaade/proxy",
                        "admin",
                        "admin-password",
                        "default-password",
                        "未关联项目",
                        120
                ),
                tokenCipherService
        );
        AuthContextHolder.set(new AuthContext(18L, "tester", "测试用户", Set.of("USER"), Set.of("api:view"), "token-a"));
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldSyncOnlySelectedProjectGroupForEmbeddedProjectSession() {
        UserEntity user = new UserEntity();
        user.setId(18L);
        when(userRepository.findWithDetailsById(18L)).thenReturn(Optional.of(user));
        var scope = new ProjectDataPermissionService.ProjectDataScope(
                18L,
                false,
                new ProjectDataPermissionService.DataPermissionPolicy(
                        DataPermissionScopeType.ALL,
                        DataPermissionScopeType.ALL,
                        DataPermissionScopeType.ALL,
                        DataPermissionScopeType.ALL
                )
        );
        when(projectDataPermissionService.requireCurrentScope()).thenReturn(scope);

        var selectedProject = new com.aiclub.platform.domain.model.ProjectEntity();
        selectedProject.setId(7L);
        selectedProject.setName("CRM项目");

        PlatformYaadeProjectBindingEntity selectedBinding = new PlatformYaadeProjectBindingEntity();
        selectedBinding.setProjectId(7L);
        selectedBinding.setYaadeCollectionId(51L);
        selectedBinding.setYaadeGroupName("aiclub-project-7");
        selectedBinding.setStatus(YaadeProjectSyncService.STATUS_ACTIVE);
        when(projectBindingRepository.findByProjectId(7L)).thenReturn(Optional.of(selectedBinding));

        YaadeClientService.YaadeSession adminSession = new YaadeClientService.YaadeSession("admin-cookie");
        when(yaadeClientService.loginAdmin()).thenReturn(adminSession);
        ObjectMapper objectMapper = new ObjectMapper();
        var remoteUser = new YaadeClientService.YaadeRemoteUser(
                101L,
                "aiclub-18",
                objectMapper.createObjectNode().put("username", "aiclub-18"),
                List.of("aiclub-api-public")
        );
        when(yaadeClientService.listUsers(adminSession)).thenReturn(List.of(remoteUser));
        PlatformYaadeUserBindingEntity userBinding = new PlatformYaadeUserBindingEntity();
        userBinding.setUserId(18L);
        userBinding.setYaadeUserId(101L);
        userBinding.setYaadeUsername("aiclub-18");
        userBinding.setPasswordCiphertext("cipher-password");
        when(userBindingRepository.findByUserId(18L)).thenReturn(Optional.of(userBinding));
        when(tokenCipherService.decrypt("cipher-password")).thenReturn("managed-password");
        when(tokenCipherService.encrypt("managed-password")).thenReturn("cipher-password");
        when(yaadeClientService.login("aiclub-18", "managed-password"))
                .thenReturn(new YaadeClientService.YaadeSession("user-cookie"));

        yaadeUserSyncService.loginCurrentUserWithSyncedGroups(selectedProject);

        ArgumentCaptor<com.fasterxml.jackson.databind.node.ObjectNode> userDataCaptor = ArgumentCaptor.forClass(com.fasterxml.jackson.databind.node.ObjectNode.class);
        verify(yaadeClientService).updateUserGroups(eq(adminSession), eq(101L), userDataCaptor.capture());
        assertThat(userDataCaptor.getValue().withArray("groups")).extracting(node -> node.asText())
                .containsExactly("aiclub-api-public", "aiclub-project-7");
    }
}
