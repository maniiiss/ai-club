package com.aiclub.platform.service;

import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.UserSummary;
import com.aiclub.platform.dto.request.UserRequest;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖用户管理的持久化契约，避免外部账号绑定字段在新增、编辑和检索链路中丢失。
 */
@SpringBootTest
@Transactional
class AccessManagementServiceIntegrationTests {

    @Autowired
    private AccessManagementService accessManagementService;

    @Autowired
    private UserRepository userRepository;

    @Test
    void shouldPersistAndSearchGiteeMemberBindingSnapshot() {
        UserSummary created = accessManagementService.createUser(new UserRequest(
                "gitee-bound-user",
                "Gitee 绑定用户",
                "bound@example.com",
                "13800000000",
                "gitlab-user",
                991L,
                "zhangsan",
                "张三",
                true,
                List.of(),
                "secret123"
        ));

        UserSummary updated = accessManagementService.updateUser(created.id(), new UserRequest(
                "gitee-bound-user",
                "Gitee 绑定用户",
                "bound@example.com",
                "13800000000",
                "gitlab-user",
                992L,
                "lisi",
                "李四",
                true,
                List.of(),
                null
        ));
        PageResponse<UserSummary> pageData = accessManagementService.pageUsers(1, 10, "李四", true, null);

        assertThat(updated.giteeMemberId()).isEqualTo(992L);
        assertThat(updated.giteeUsername()).isEqualTo("lisi");
        assertThat(updated.giteeName()).isEqualTo("李四");
        assertThat(pageData.records())
                .extracting(UserSummary::id)
                .contains(updated.id());
        assertThat(userRepository.findById(updated.id()).orElseThrow().getGiteeUsername()).isEqualTo("lisi");
    }
}
