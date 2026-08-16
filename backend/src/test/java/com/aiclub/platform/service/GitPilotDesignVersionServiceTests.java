package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitPilotDesignVersionEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.design.DesignVersionDtos;
import com.aiclub.platform.repository.GitPilotDesignVersionRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 验证 Design 上传的幂等、快照安全边界和项目当前版本切换语义。 */
@ExtendWith(MockitoExtension.class)
class GitPilotDesignVersionServiceTests {

    @Mock
    private GitPilotDesignVersionRepository versionRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private GitPilotDesignVersionService service;

    @BeforeEach
    void setUp() {
        service = new GitPilotDesignVersionService(
                versionRepository,
                projectRepository,
                projectDataPermissionService,
                objectMapper
        );
    }

    @Test
    void shouldReturnExistingVersionWhenRetryingSameDesignRevision() throws Exception {
        ProjectEntity project = project(1L);
        GitPilotDesignVersionEntity existing = version(42L, 1L, "design-login", "rev-3", 3, "DRAFT");
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        when(versionRepository.findByProjectIdAndDesignIdAndRevisionId(1L, "design-login", "rev-3"))
                .thenReturn(Optional.of(existing));

        DesignVersionDtos.DesignVersionSummary result = service.upload(1L, request("pages/login/index.html"), 7L);

        assertThat(result.id()).isEqualTo(42L);
        assertThat(result.versionNumber()).isEqualTo(3);
        assertThat(result.status()).isEqualTo("DRAFT");
        verify(projectDataPermissionService).requireProjectVisible(project);
        verify(versionRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void shouldRejectTraversalPathBeforePersistingSnapshot() throws Exception {
        ProjectEntity project = project(1L);
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service.upload(1L, request("pages/../secret.html"), 7L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("文件路径非法");

        verify(versionRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void shouldArchivePriorCurrentVersionWhenActivatingAnotherRevision() {
        ProjectEntity project = project(1L);
        GitPilotDesignVersionEntity previous = version(10L, 1L, "design-login", "rev-2", 2, "CURRENT");
        GitPilotDesignVersionEntity target = version(11L, 1L, "design-login", "rev-3", 3, "DRAFT");
        when(projectRepository.findById(1L)).thenReturn(Optional.of(project));
        when(versionRepository.findById(11L)).thenReturn(Optional.of(target));
        when(versionRepository.findByProjectIdAndDesignIdAndStatus(1L, "design-login", "CURRENT"))
                .thenReturn(List.of(previous));
        when(versionRepository.save(target)).thenReturn(target);

        DesignVersionDtos.DesignVersionDetail result = service.activate(1L, 11L);

        assertThat(previous.getStatus()).isEqualTo("ARCHIVED");
        assertThat(target.getStatus()).isEqualTo("CURRENT");
        assertThat(result.id()).isEqualTo(11L);
        assertThat(result.status()).isEqualTo("CURRENT");
        verify(projectDataPermissionService).requireProjectEditable(project);
    }

    private DesignVersionDtos.CreateDesignVersionRequest request(String path) throws Exception {
        JsonNode snapshot = objectMapper.readTree("""
                {
                  "document": { "name": "登录页" },
                  "files": [{ "path": "%s", "content": "<main>Login</main>" }]
                }
                """.formatted(path));
        return new DesignVersionDtos.CreateDesignVersionRequest(
                "design-login",
                "rev-3",
                "登录页",
                "调整登录流程",
                snapshot,
                "<main>Login</main>"
        );
    }

    private ProjectEntity project(Long id) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        project.setName("Design 项目");
        return project;
    }

    private GitPilotDesignVersionEntity version(Long id, Long projectId, String designId, String revisionId,
                                                  int versionNo, String status) {
        GitPilotDesignVersionEntity entity = new GitPilotDesignVersionEntity();
        entity.setId(id);
        entity.setProjectId(projectId);
        entity.setDesignId(designId);
        entity.setRevisionId(revisionId);
        entity.setVersionNo(versionNo);
        entity.setTitle("登录页");
        entity.setSummary("调整登录流程");
        entity.setStatus(status);
        entity.setSnapshotJson("{\"files\":[{\"path\":\"pages/login/index.html\",\"content\":\"<main>Login</main>\"}]}");
        entity.setPreviewHtml("<main>Login</main>");
        entity.setCreatorUserId(7L);
        entity.setCreatedAt(LocalDateTime.of(2026, 8, 16, 12, 0));
        entity.setUpdatedAt(LocalDateTime.of(2026, 8, 16, 12, 0));
        return entity;
    }
}
