package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ServerDetail;
import com.aiclub.platform.dto.request.ServerRequest;
import com.aiclub.platform.repository.ServerInfoRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ServerManagementServiceTests {

    @Autowired
    private ServerManagementService serverManagementService;

    @Autowired
    private ServerInfoRepository serverInfoRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TokenCipherService tokenCipherService;

    @MockBean
    private ServerSshGateway serverSshGateway;

    @MockBean
    private ServerTerminalSessionManager serverTerminalSessionManager;

    @MockBean
    private NotificationService notificationService;

    @Test
    void shouldEncryptPasswordAndHidePlaintextInDetail() {
        UserEntity recipient = createUser("server-alert-user");

        ServerDetail detail = serverManagementService.createServer(new ServerRequest(
                "生产机 A",
                "支付服务主机",
                "10.10.10.9",
                22,
                "deploy",
                "LINUX",
                "PASSWORD",
                "super-secret-password",
                null,
                null,
                true,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                85,
                90,
                92,
                2,
                30,
                List.of(recipient.getId())
        ));

        ServerInfoEntity saved = serverInfoRepository.findById(detail.id()).orElseThrow();
        assertThat(saved.getPasswordCiphertext()).isNotBlank().isNotEqualTo("super-secret-password");
        assertThat(tokenCipherService.decrypt(saved.getPasswordCiphertext())).isEqualTo("super-secret-password");
        assertThat(detail.passwordConfigured()).isTrue();
        assertThat(detail.privateKeyConfigured()).isFalse();
        assertThat(detail.jumpPasswordConfigured()).isFalse();
    }

    @Test
    void shouldKeepExistingCiphertextWhenPasswordLeftBlankAndClearOldPasswordWhenSwitchingToPrivateKey() {
        ServerDetail created = serverManagementService.createServer(new ServerRequest(
                "堡垒主机",
                "先用密码接入",
                "172.16.0.8",
                22,
                "root",
                "LINUX",
                "PASSWORD",
                "initial-password",
                null,
                null,
                true,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of()
        ));
        String originalCiphertext = serverInfoRepository.findById(created.id()).orElseThrow().getPasswordCiphertext();

        serverManagementService.updateServer(created.id(), new ServerRequest(
                "堡垒主机",
                "继续使用旧密码密文",
                "172.16.0.8",
                22,
                "root",
                "LINUX",
                "PASSWORD",
                "",
                null,
                null,
                true,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of()
        ));

        ServerInfoEntity passwordUpdated = serverInfoRepository.findById(created.id()).orElseThrow();
        assertThat(passwordUpdated.getPasswordCiphertext()).isEqualTo(originalCiphertext);

        serverManagementService.updateServer(created.id(), new ServerRequest(
                "堡垒主机",
                "切换为私钥",
                "172.16.0.8",
                22,
                "root",
                "LINUX",
                "PRIVATE_KEY",
                null,
                "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
                "",
                true,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of()
        ));

        ServerInfoEntity switched = serverInfoRepository.findById(created.id()).orElseThrow();
        assertThat(switched.getPasswordCiphertext()).isNull();
        assertThat(switched.getPrivateKeyCiphertext()).isNotBlank();
        assertThat(tokenCipherService.decrypt(switched.getPrivateKeyCiphertext())).contains("BEGIN PRIVATE KEY");
    }

    private UserEntity createUser(String username) {
        UserEntity entity = new UserEntity();
        entity.setUsername(username);
        entity.setNickname("通知人");
        entity.setPasswordHash("hashed");
        entity.setEnabled(true);
        return userRepository.save(entity);
    }
}
