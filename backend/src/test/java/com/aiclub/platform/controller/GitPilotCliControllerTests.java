package com.aiclub.platform.controller;

import com.aiclub.platform.dto.ProjectMemberSummary;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.cli.CliDtos;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.CreditService;
import com.aiclub.platform.service.GitPilotCliService;
import com.aiclub.platform.service.GitPilotWorkResearchService;
import com.aiclub.platform.service.PlatformStoreService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 验证 CLI 项目目录走独立路由、scope 校验和最小摘要映射，避免误回到 Web JWT 接口。 */
class GitPilotCliControllerTests {

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldListCliVisibleProjectsAsMinimalSummaries() {
        GitPilotCliService cliService = mock(GitPilotCliService.class);
        PlatformStoreService platformStoreService = mock(PlatformStoreService.class);
        AuthContextHolder.set(new AuthContext(7L, "cli-user", "CLI 用户", Set.of(), Set.of(), "gpt_test"));
        when(platformStoreService.listAllProjects()).thenReturn(List.of(
                new ProjectSummary(1L, "订单中心", "负责人", 2L, 2L, null,
                        List.of(), List.of(), List.<ProjectMemberSummary>of(), "进行中", "订单域", 3, 4, 1, false, false),
                new ProjectSummary(2L, "知识库", "负责人", 2L, 2L, null,
                        List.of(), List.of(), List.<ProjectMemberSummary>of(), "规划中", "知识域", 0, 0, 0, false, false)
        ));

        GitPilotCliController controller = new GitPilotCliController(
                cliService,
                platformStoreService,
                mock(CreditService.class),
                mock(GitPilotWorkResearchService.class)
        );

        var response = controller.projects("订单");

        assertThat(response.data()).containsExactly(new CliDtos.CliProjectSummary(1L, "订单中心", "进行中", "订单域", "负责人"));
        verify(cliService).requireScope("gpt_test", GitPilotCliService.SCOPE_PROJECT_READ);
    }
}
