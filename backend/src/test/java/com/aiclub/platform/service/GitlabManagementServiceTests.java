package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.ProjectGitlabBindingSummary;
import com.aiclub.platform.dto.request.ProjectGitlabBindingRequest;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class GitlabManagementServiceTests {

    @Autowired
    private GitlabManagementService gitlabManagementService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    /**
     * 验证同一个业务项目可以同时绑定多个不同的 GitLab 仓库。
     */
    @Test
    void shouldAllowMultipleGitlabBindingsForSameProject() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("多仓库项目", "张三", "进行中", "验证一个项目支持多个仓库绑定"));

        ProjectGitlabBindingSummary firstBinding = gitlabManagementService.createBinding(new ProjectGitlabBindingRequest(
                project.getId(),
                "http://gitlab.example.com/api/v4",
                "group-a/repository-one",
                "main",
                "token-one",
                true
        ));
        ProjectGitlabBindingSummary secondBinding = gitlabManagementService.createBinding(new ProjectGitlabBindingRequest(
                project.getId(),
                "http://gitlab.example.com/api/v4",
                "group-a/repository-two",
                "develop",
                "token-two",
                true
        ));

        assertThat(firstBinding.projectId()).isEqualTo(project.getId());
        assertThat(secondBinding.projectId()).isEqualTo(project.getId());
        assertThat(projectGitlabBindingRepository.countByProject_Id(project.getId())).isEqualTo(2);
        assertThat(projectGitlabBindingRepository.findByProject_IdOrderByIdAsc(project.getId()))
                .extracting(item -> item.getGitlabProjectRef())
                .containsExactly("group-a/repository-one", "group-a/repository-two");
    }

    /**
     * 验证同一项目下重复绑定同一个 GitLab 仓库时会被拦截，避免产生重复映射。
     */
    @Test
    void shouldRejectDuplicateRepositoryBindingForSameProject() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("重复绑定校验项目", "李四", "进行中", "验证同仓库重复绑定校验"));

        gitlabManagementService.createBinding(new ProjectGitlabBindingRequest(
                project.getId(),
                "http://gitlab.example.com/api/v4",
                "group-a/repository-one",
                "main",
                "token-one",
                true
        ));

        assertThatThrownBy(() -> gitlabManagementService.createBinding(new ProjectGitlabBindingRequest(
                project.getId(),
                "http://gitlab.example.com/api/v4",
                "group-a/repository-one",
                "main",
                "token-two",
                true
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前项目已绑定该 GitLab 仓库，请勿重复创建");
    }
}
